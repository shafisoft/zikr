/**
 * Room Screen (V2) — one persistent group.
 * Group header (title, members) + the group's plans: several can run at
 * once; ended plans stay as history. Contributions target one zikr of one
 * plan. My contribution history is device-local only.
 * Noor design system; INTEGRATED WITH sharedRoomStore.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MaterialIcon from '../components/MaterialIcon';
import { showConfirm } from '../components/ConfirmDialog';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import CircularProgress from '../components/progress/CircularProgress';
import PatternBackdrop from '../components/decor/PatternBackdrop';
import OrnamentDivider from '../components/decor/OrnamentDivider';
import InputField from '../components/forms/InputField';
import { useSharedRoomStore } from '../../core/stores/sharedRoomStore';
import { sharedRoomErrorMessage } from '../utils/roomErrors';
import { useZikrStore } from '../../core/stores/zikrStore';
import CounterModal from '../components/counter/CounterModal';
import CreatePlanModal from '../components/CreatePlanModal';
import { Plan, SharedSubmission, Zikr } from '../../core/db/types';
import {
  formatTimeRemaining,
  isValidDelta,
  progressPercent,
} from '../../core/utils/sharedRoomUtils';
import {
  formatResetsIn,
  getPlanPhase,
  sharedPlanProgress,
} from '../../core/utils/planUtils';
import { useI18n } from '../../core/i18n';
import useShare from '../hooks/useShare';

const QUICK_AMOUNTS = [10, 33, 100];

const Room: React.FC = () => {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const navActions = useNavActions();
  const { t } = useI18n();
  const zikrs = useZikrStore(state => state.zikrs);
  const {
    initialized,
    configured,
    identity,
    currentRoom,
    currentPlans,
    currentMembers,
    isMember,
    mySubmissions,
    syncing,
    loading,
    error,
    openRoom,
    closeCurrentRoom,
    refreshCurrentRoom,
    flushOutbox,
    submit,
    endPlan,
    leaveRoom,
    closeRoom,
    removeMember,
    clearError,
  } = useSharedRoomStore();

  const [customDelta, setCustomDelta] = useState('');
  const [customOpen, setCustomOpen] = useState<string | null>(null); // planId
  /** Selected zikr for quick-add on multi-zikr plans (planId → zikr name). */
  const [quickZikr, setQuickZikr] = useState<Record<string, string>>({});
  const [isCounterOpen, setIsCounterOpen] = useState(false);
  const [isCreatePlanOpen, setIsCreatePlanOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  // Live override while the counter modal is open — each tap moves the
  // plan's ring immediately.
  const [liveCount, setLiveCount] = useState<number | null>(null);
  const [counterContext, setCounterContext] = useState<{ plan: Plan; zikr: Zikr; base: number } | null>(null);
  // Contribution history: collapsed to the total until the user expands it.
  const [contributionExpanded, setContributionExpanded] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const { share } = useShare();

  useEffect(() => {
    void init_once();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init_once() {
    if (!useSharedRoomStore.getState().initialized) {
      await useSharedRoomStore.getState().init();
    }
    if (code) await openRoom(code);
  }

  useEffect(() => () => closeCurrentRoom(), [closeCurrentRoom]);

  const room = currentRoom;
  const roomActive = room?.status === 'active';

  const { activePlans, endedPlans } = useMemo(() => {
    const now = new Date();
    const active = (currentPlans || []).filter(
      p => p.status !== 'ended' && getPlanPhase(p, now) !== 'ended'
    );
    const ended = (currentPlans || []).filter(
      p => p.status === 'ended' || getPlanPhase(p, now) === 'ended'
    );
    return { activePlans: active, endedPlans: ended };
  }, [currentPlans]);

  // The local zikr record matching a plan zikr name — lets members open
  // the counter pre-filled with the same dhikr the plan is counting.
  const localZikrByName = (name: string): Zikr | null =>
    zikrs.find(z => z.name === name) ?? null;

  const shareLink = room
    ? `${window.location.origin}${import.meta.env.BASE_URL}join/${room.code}`
    : '';

  const copy = async (kind: 'code' | 'link', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      void useSharedRoomStore.getState().track('room_shared', { kind });
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setActionError(t('createRoom.copyFailed'));
    }
  };

  const handleQuickSubmit = async (plan: Plan, zikrName: string, delta: number) => {
    if (!room) return;
    setActionError(null);
    try {
      await submit(delta, plan.id, zikrName);
    } catch (err) {
      setActionError(sharedRoomErrorMessage(err));
    }
  };

  const handleCustomSubmit = async (plan: Plan, zikrName: string) => {
    const delta = parseInt(customDelta, 10);
    if (!isValidDelta(delta)) {
      setActionError(t('errors.invalid-delta'));
      return;
    }
    setActionError(null);
    try {
      await submit(delta, plan.id, zikrName);
      setCustomDelta('');
      setCustomOpen(null);
    } catch (err) {
      setActionError(sharedRoomErrorMessage(err));
    }
  };

  const openCounter = (plan: Plan, zikrName: string) => {
    const zikr = localZikrByName(zikrName);
    if (!zikr || !room) return;
    const progress = sharedPlanProgress(plan);
    const zEntry = plan.zikrs.find(z => z.name === zikrName);
    // Combined: continue the group's combined count. Per-zikr: that zikr's count.
    const base =
      plan.mode === 'combined'
        ? progress.combined
        : plan.period !== 'one-time'
          ? zEntry?.periodTotal ?? 0
          : zEntry?.total ?? 0;
    setCounterContext({ plan, zikr, base });
    setLiveCount(null);
    setIsCounterOpen(true);
  };

  const isOwner = Boolean(room && identity && room.ownerId === identity.userId);

  const pendingCount = mySubmissions.filter((s) => s.syncState === 'pending').length;
  const myContributionTotal = mySubmissions.reduce((sum, s) => sum + s.delta, 0);

  return (
    <AppLayout
      topBar={{
        title: room ? room.title : 'Room',
        back: true,
        onBack: () => navigate('/group'),
        actions: navActions,
      }}
      bottomNav
      contentClassName="w-full px-container-padding-mobile pt-6 pb-6 gap-6"
    >
        {loading && !room && (
          <div className="flex items-center justify-center py-16 text-on-surface-variant">
            {t('room.opening')}
          </div>
        )}

        {error && !room && (
          <div className="bg-error/10 border border-error/20 rounded-xl p-6 text-center">
            <MaterialIcon icon="search_off" className="text-4xl text-error mx-auto mb-3" />
            <p className="font-body-md text-body-md text-error mb-4">{error ? t(`errors.${error}`) : null}</p>
            <button
              onClick={() => navigate('/group')}
              className="h-touch-target-min px-8 bg-primary-container text-on-primary rounded-xl font-label-md text-label-md"
            >
              {t('room.backToGroup')}
            </button>
          </div>
        )}

        {room && (
          <>
            {/* Hero: the persistent group */}
            <section className="relative rounded-t-full rounded-b-2xl border border-tertiary-container/30 bg-surface-container-low shadow-card px-6 pt-16 pb-8 overflow-hidden flex flex-col items-center">
              <PatternBackdrop className="absolute inset-0" />
              <div className="relative flex flex-col items-center gap-3 w-full">
                <h1 className="font-headline-lg text-headline-lg text-primary text-center">
                  {room.title}
                </h1>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-caption text-caption bg-tertiary-container/10 text-tertiary border border-tertiary-container/30">
                    <MaterialIcon icon="groups" className="text-[14px]" />
                    {t('room.members', { count: currentMembers.length })}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-caption text-caption bg-surface-container-high text-on-surface-variant">
                    <MaterialIcon icon="target" className="text-[14px]" />
                    {t('room.planCount', { active: activePlans.length, total: currentPlans.length })}
                  </span>
                  {room.status === 'closed' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-caption text-caption bg-surface-container-high text-on-surface-variant">
                      <MaterialIcon icon="lock" className="text-[14px]" />
                      {t('group.closedLabel')}
                    </span>
                  )}
                </div>
                <OrnamentDivider className="w-32" />
              </div>
            </section>

            {(error || actionError) && (
              <div
                className="bg-error/10 border border-error/20 rounded-xl p-4 flex items-center justify-between gap-3"
                role="alert"
              >
                <p className="font-caption text-caption text-error">{actionError || (error ? t(`errors.${error}`) : null)}</p>
                <button
                  onClick={() => {
                    clearError();
                    setActionError(null);
                  }}
                  aria-label="Dismiss"
                  className="text-error shrink-0"
                >
                  <MaterialIcon icon="close" className="text-[18px]" />
                </button>
              </div>
            )}

            {/* Active plans */}
            {activePlans.length > 0 && (
              <section className="flex flex-col gap-4">
                {activePlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    canContribute={roomActive && isMember}
                    liveCount={
                      counterContext?.plan.id === plan.id && liveCount !== null ? liveCount : null
                    }
                    quickZikr={quickZikr[plan.id]}
                    onQuickZikr={(name) =>
                      setQuickZikr(prev => ({ ...prev, [plan.id]: name }))
                    }
                    localZikrByName={localZikrByName}
                    syncing={syncing}
                    customOpen={customOpen === plan.id}
                    customDelta={customDelta}
                    onCustomDelta={setCustomDelta}
                    onCustomOpen={(open) => {
                      setCustomOpen(open ? plan.id : null);
                      if (!open) setCustomDelta('');
                    }}
                    onQuickSubmit={(zikrName, delta) => handleQuickSubmit(plan, zikrName, delta)}
                    onCustomSubmit={(zikrName) => handleCustomSubmit(plan, zikrName)}
                    onOpenCounter={(zikrName) => openCounter(plan, zikrName)}
                    onEnd={
                      isOwner && roomActive
                        ? async () => {
                            const ok = await showConfirm({
                              message: t('plan.endConfirm'),
                              danger: true,
                              confirmLabel: t('common.delete'),
                            });
                            if (ok) void endPlan(room.code, plan.id);
                          }
                        : undefined
                    }
                  />
                ))}
              </section>
            )}

            {/* No active plans */}
            {activePlans.length === 0 && roomActive && (
              <GlassCardLike>
                <div className="text-center flex flex-col items-center gap-2 py-4">
                  <MaterialIcon icon="flag" className="text-4xl text-tertiary" />
                  <p className="font-headline-md text-headline-md text-primary">
                    {t('room.noActivePlans')}
                  </p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {isOwner ? t('room.noActivePlansOwner') : t('room.noActivePlansMember')}
                  </p>
                </div>
              </GlassCardLike>
            )}

            {/* Owner: new plan */}
            {isOwner && roomActive && (
              <button
                onClick={() => setIsCreatePlanOpen(true)}
                className="w-full h-touch-target-min rounded-xl border border-tertiary-container/40 bg-tertiary-container/10 text-tertiary font-label-md text-label-md flex items-center justify-center gap-2 hover:bg-tertiary-container/20 active-scale-95 transition-all"
              >
                <MaterialIcon icon="add_circle" className="text-[20px]" />
                {t('plan.new')}
              </button>
            )}

            {/* Not a member (preview via deep link) */}
            {!isMember && initialized && (
              <GlassCardLike>
                <p className="font-body-md text-body-md text-on-surface-variant mb-4">
                  {t('room.viewingRoom')}
                </p>
                <button
                  onClick={async () => {
                    try {
                      await useSharedRoomStore.getState().joinRoom(room.code);
                      await refreshCurrentRoom();
                    } catch (err) {
                      setActionError(sharedRoomErrorMessage(err));
                    }
                  }}
                  disabled={!configured}
                  className="w-full h-touch-target-min bg-primary-container text-on-primary rounded-xl font-label-md text-label-md disabled:opacity-50"
                >
                  {t('room.joinThisRoom')}
                </button>
              </GlassCardLike>
            )}

            {/* Past plans (history) */}
            {endedPlans.length > 0 && (
              <GlassCardLike>
                <button
                  onClick={() => setHistoryExpanded((v) => !v)}
                  aria-expanded={historyExpanded}
                  className="w-full flex items-center justify-between gap-3 text-left active-scale-[0.99] transition-transform"
                >
                  <span className="font-label-md text-label-md text-primary flex items-center gap-2">
                    <MaterialIcon icon="history" className="text-[20px]" />
                    {t('room.pastPlans', { count: endedPlans.length })}
                  </span>
                  <MaterialIcon
                    icon={historyExpanded ? 'expand_less' : 'expand_more'}
                    className="text-on-surface-variant"
                  />
                </button>
                {historyExpanded && (
                  <ul className="mt-4 flex flex-col divide-y divide-outline-variant/10">
                    {endedPlans.map((plan) => {
                      const progress = sharedPlanProgress(plan);
                      return (
                        <li key={plan.id} className="py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-label-md text-label-md text-on-surface truncate">
                              {plan.title?.trim() ||
                                plan.zikrs.map(z => z.name).join(' · ')}
                            </p>
                            <p className="font-caption text-caption text-on-surface-variant tabular-nums">
                              {t('room.endedSummary', {
                                total: progress.combined.toLocaleString(),
                                target: progress.target.toLocaleString(),
                                percent: progress.percent,
                              })}
                            </p>
                          </div>
                          <MaterialIcon
                            icon={progress.done ? 'celebration' : 'flag'}
                            filled
                            className={progress.done ? 'text-tertiary' : 'text-on-surface-variant'}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </GlassCardLike>
            )}

            {/* My contribution (local only) — total by default, tap for details */}
            <GlassCardLike>
              <button
                onClick={() => setContributionExpanded((v) => !v)}
                aria-expanded={contributionExpanded}
                className="w-full flex items-center justify-between gap-3 text-left active-scale-[0.99] transition-transform"
              >
                <span className="font-label-md text-label-md text-primary flex items-center gap-2">
                  <MaterialIcon icon="history" className="text-[20px]" />
                  {t('room.myContribution')}
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-headline-sm text-headline-sm text-tertiary font-bold tabular-nums">
                    {myContributionTotal.toLocaleString()}
                  </span>
                  <MaterialIcon
                    icon={contributionExpanded ? 'expand_less' : 'expand_more'}
                    className="text-on-surface-variant"
                  />
                </span>
              </button>

              {contributionExpanded && (
                <div className="mt-4">
                  {mySubmissions.length === 0 ? (
                    <p className="font-caption text-caption text-on-surface-variant">
                      {t('room.nothingYet')}
                    </p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-outline-variant/10 -mx-1">
                      {mySubmissions.slice(0, 20).map((s) => (
                        <SubmissionRow key={s.eventId} submission={s} />
                      ))}
                    </ul>
                  )}
                  <p className="font-caption text-caption text-on-surface-variant/70 mt-4 flex items-start gap-1.5">
                    <MaterialIcon icon="lock" className="text-[14px] mt-0.5 shrink-0" />
                    {t('room.localNote')}
                  </p>
                </div>
              )}
            </GlassCardLike>

            {/* Sync status */}
            {isMember && (
              <p className="font-caption text-caption text-on-surface-variant flex items-center gap-1.5">
                {syncing ? (
                  <>
                    <MaterialIcon icon="cloud_upload" className="text-[16px] text-tertiary" />
                    {t('room.syncing')}
                  </>
                ) : pendingCount > 0 ? (
                  <>
                    <MaterialIcon icon="cloud_upload" className="text-[16px] text-tertiary" />
                    {t('room.queued', { count: pendingCount })}
                  </>
                ) : (
                  <>
                    <MaterialIcon icon="cloud_done" className="text-[16px] text-primary" />
                    {t('room.allSynced')}
                  </>
                )}
              </p>
            )}

            {/* Members */}
            <GlassCardLike>
              <h3 className="font-label-md text-label-md text-primary mb-4 flex items-center gap-2">
                <MaterialIcon icon="groups" className="text-[20px]" />
                {t('room.members', { count: currentMembers.length })}
              </h3>
              <div className="flex flex-wrap gap-2">
                {currentMembers.map((m, idx) => {
                  const isSelf = m.name === identity?.displayName;
                  return (
                    <span
                      key={`${m.name}-${idx}`}
                      className="inline-flex items-center gap-1.5 bg-surface-container-high text-on-surface px-3 py-1.5 rounded-full font-caption text-caption"
                    >
                      {m.name}
                      {isSelf && <span className="text-tertiary font-semibold">(you)</span>}
                      {isOwner && !isSelf && m.userId && (
                        <button
                          onClick={async () => {
                            const ok = await showConfirm({
                              message: t('room.removeConfirm', { name: m.name }),
                              danger: true,
                              confirmLabel: t('common.delete'),
                            });
                            if (ok) void removeMember(room.code, m.userId!);
                          }}
                          className="text-on-surface-variant hover:text-error transition-colors -mr-1"
                          aria-label={`Remove ${m.name}`}
                        >
                          <MaterialIcon icon="close" className="text-[14px]" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
              <p className="font-caption text-caption text-on-surface-variant mt-3">
                {t('room.membersNote')}
              </p>
            </GlassCardLike>

            {/* Share */}
            <GlassCardLike>
              <h3 className="font-label-md text-label-md text-primary mb-4 flex items-center gap-2">
                <MaterialIcon icon="share" className="text-[20px]" />
                {t('room.invite')}
              </h3>
              {/* Native share intent — the whole invite in one tap */}
              <button
                onClick={() =>
                  share({
                    title: room.title,
                    text: t('room.shareText', { title: room.title }),
                    url: shareLink,
                  }).catch(() => {})
                }
                className="w-full h-touch-target-min mb-3 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active-scale-95 transition-all"
              >
                <MaterialIcon icon="share" className="text-[18px]" />
                {t('room.shareInvite')}
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 bg-surface-container-lowest border border-tertiary-container/30 rounded-xl py-3 text-center">
                  <span className="font-label-md text-label-md text-[20px] tracking-[0.25em] text-primary tabular-nums">
                    {room.code}
                  </span>
                </div>
                <button
                  onClick={() => copy('code', room.code)}
                  aria-label="Copy code"
                  className="w-12 h-12 rounded-xl border border-outline-variant/40 text-primary flex items-center justify-center hover:bg-surface-variant/40 transition-colors"
                >
                  <MaterialIcon icon="content_copy" className="text-[20px]" />
                </button>
                <button
                  onClick={() => copy('link', shareLink)}
                  aria-label="Copy invite link"
                  className="w-12 h-12 rounded-xl border border-outline-variant/40 text-primary flex items-center justify-center hover:bg-surface-variant/40 transition-colors"
                >
                  <MaterialIcon icon="link" className="text-[20px]" />
                </button>
              </div>
              {(copied === 'code' || copied === 'link') && (
                <p className="font-caption text-caption text-tertiary mt-2">{t('room.copied')}</p>
              )}
            </GlassCardLike>

            {/* Owner / member management */}
            {isOwner && roomActive && (
              <button
                onClick={async () => {
                  const ok = await showConfirm({
                    message: t('room.closeConfirm'),
                    danger: true,
                    confirmLabel: t('common.delete'),
                  });
                  if (ok) void closeRoom(room.code);
                }}
                className="w-full h-14 rounded-xl bg-error/5 border border-error/20 text-error font-label-md text-label-md flex items-center justify-center gap-2 hover:bg-error/10 transition-colors"
              >
                <MaterialIcon icon="lock" className="text-[20px]" />
                {t('room.closeRoom')}
              </button>
            )}
            {!isOwner && (
              <button
                onClick={async () => {
                  const ok = await showConfirm({
                    message: t('room.leaveConfirm'),
                    danger: true,
                  });
                  if (ok) {
                    void leaveRoom(room.code).then(() => navigate('/group'));
                  }
                }}
                className="w-full h-14 rounded-xl text-on-surface-variant font-label-md text-label-md flex items-center justify-center gap-2 hover:bg-surface-variant/50 transition-colors"
              >
                <MaterialIcon icon="logout" className="text-[20px]" />
                {t('room.leaveRoom')}
              </button>
            )}
          </>
        )}

      {/* Counter in place — continues the plan's count on your own tasbeeh;
          only the taps you add here are saved and contributed */}
      {counterContext && room && (
        <CounterModal
          isOpen={isCounterOpen}
          onClose={() => {
            // Dismissed — but an auto-saved round may still be queued.
            setIsCounterOpen(false);
            setLiveCount(null);
            void flushOutbox()
              .then(() => refreshCurrentRoom())
              .catch(() => {});
          }}
          onFinish={() => {
            setIsCounterOpen(false);
            setLiveCount(null);
            void flushOutbox()
              .then(() => refreshCurrentRoom())
              .catch(() => {});
          }}
          zikr={counterContext.zikr}
          startCount={counterContext.base}
          target={
            counterContext.plan.mode === 'combined'
              ? counterContext.plan.target ?? 0
              : counterContext.plan.zikrs.find(
                  z => z.name === counterContext.zikr.name
                )?.target ?? 0
          }
          onCount={(count) => setLiveCount(count)}
        />
      )}

      {/* Owner starts another plan in the same group */}
      {room && (
        <CreatePlanModal
          isOpen={isCreatePlanOpen}
          onClose={() => setIsCreatePlanOpen(false)}
          roomCode={room.code}
        />
      )}
    </AppLayout>
  );
};

/** Simple card container matching the Noor look. */
const GlassCardLike: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <section className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-5">
    {children}
  </section>
);

// ---------- Plan card ----------

interface PlanCardProps {
  plan: Plan;
  canContribute: boolean;
  liveCount: number | null;
  quickZikr?: string;
  onQuickZikr: (name: string) => void;
  localZikrByName: (name: string) => Zikr | null;
  syncing: boolean;
  customOpen: boolean;
  customDelta: string;
  onCustomDelta: (v: string) => void;
  onCustomOpen: (open: boolean) => void;
  onQuickSubmit: (zikrName: string, delta: number) => void;
  onCustomSubmit: (zikrName: string) => void;
  onOpenCounter: (zikrName: string) => void;
  onEnd?: () => void;
}

const PlanCard: React.FC<PlanCardProps> = ({
  plan,
  canContribute,
  liveCount,
  quickZikr,
  onQuickZikr,
  localZikrByName,
  syncing,
  customOpen,
  customDelta,
  onCustomDelta,
  onCustomOpen,
  onQuickSubmit,
  onCustomSubmit,
  onOpenCounter,
  onEnd,
}) => {
  const { t } = useI18n();
  const now = new Date();
  const phase = getPlanPhase(plan, now);
  const progress = sharedPlanProgress(plan);
  const multiZikr = plan.zikrs.length > 1;
  const activeZikr = quickZikr ?? plan.zikrs[0]?.name;
  const singleZikr = plan.zikrs.length === 1 ? plan.zikrs[0] : null;

  const periodChip =
    plan.period === 'one-time'
      ? plan.endDate
        ? t('group.timeLeft', { time: formatTimeRemaining(new Date(plan.endDate), now) })
        : t('plans.oneTime')
      : t('plan.resetsIn', {
          time: formatResetsIn(plan.period, plan.timeZone || 'UTC', now),
        });

  const periodLabel =
    plan.period === 'daily'
      ? t('plans.dailyPractice')
      : plan.period === 'weekly'
        ? t('plans.weekly')
        : plan.period === 'monthly'
          ? t('plans.monthly')
          : t('plans.oneTime');

  return (
    <section className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-5">
      {/* Header */}
      <div className="flex justify-between items-start gap-3 mb-4">
        <div className="min-w-0">
          <div className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-tertiary-container/10 border border-tertiary-container/30 text-tertiary font-caption text-caption uppercase tracking-wide mb-2">
            {periodLabel}
          </div>
          <h3 className="font-headline-md text-headline-md text-primary truncate">
            {plan.title?.trim() || plan.zikrs.map(z => z.name).join(' · ')}
          </h3>
          {singleZikr?.arabic && (
            <p className="font-display-arabic text-[22px] leading-8 text-tertiary" lang="ar" dir="rtl">
              {singleZikr.arabic}
            </p>
          )}
          <span className="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full font-caption text-caption bg-tertiary-container/10 text-tertiary border border-tertiary-container/30">
            <MaterialIcon icon={plan.period === 'one-time' ? 'schedule' : 'replay'} className="text-[14px]" />
            {phase === 'upcoming' ? t('plan.upcoming') : periodChip}
          </span>
        </div>
        {onEnd && (
          <button
            onClick={onEnd}
            className="shrink-0 text-on-surface-variant hover:text-error transition-colors p-1"
            aria-label={t('plan.end')}
          >
            <MaterialIcon icon="stop_circle" className="text-[20px]" />
          </button>
        )}
      </div>

      {/* Progress */}
      {plan.mode === 'combined' ? (
        <CombinedProgress
          percent={progressPercent(liveCount ?? progress.combined, progress.target)}
          current={(liveCount ?? progress.combined)}
          target={progress.target}
          countable={canContribute && phase === 'active' && !!localZikrByName(plan.zikrs[0]?.name ?? '')}
          onOpenCounter={() => onOpenCounter(plan.zikrs[0]?.name ?? '')}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {plan.zikrs.map(z => {
            const recurring = plan.period !== 'one-time';
            const zCurrent = recurring ? z.periodTotal ?? 0 : z.total ?? 0;
            const zTarget = z.target ?? 0;
            const countable =
              canContribute && phase === 'active' && !!localZikrByName(z.name);
            return (
              <button
                key={z.name}
                type="button"
                onClick={() => countable && onOpenCounter(z.name)}
                disabled={!countable}
                className={`text-left w-full ${countable ? 'cursor-pointer active-scale-[0.99] transition-transform' : 'cursor-default'}`}
                aria-label={t('room.startCounting')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-label-md text-label-md text-on-surface truncate">
                    {z.name}
                    {z.arabic && (
                      <span className="font-display-arabic text-tertiary ml-2" lang="ar" dir="rtl">
                        {z.arabic}
                      </span>
                    )}
                  </span>
                  <span className="font-caption text-caption text-on-surface-variant tabular-nums shrink-0 ml-2">
                    {zCurrent.toLocaleString()} / {zTarget.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      zCurrent >= zTarget && zTarget > 0 ? 'bg-primary' : 'bg-tertiary-container'
                    }`}
                    style={{ width: `${progressPercent(zCurrent, zTarget)}%` }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Quick add */}
      {canContribute && phase === 'active' && (
        <div className="mt-4 pt-4 border-t border-outline-variant/20">
          {multiZikr && (
            <div className="flex flex-wrap gap-2 mb-3">
              {plan.zikrs.map(z => (
                <button
                  key={z.name}
                  type="button"
                  onClick={() => onQuickZikr(z.name)}
                  className={`px-3 py-1.5 rounded-full font-caption text-caption border transition-all ${
                    activeZikr === z.name
                      ? 'bg-primary-container text-on-primary border-transparent'
                      : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                  }`}
                >
                  {z.name}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 mb-3">
            {QUICK_AMOUNTS.map((amount) => (
              <button
                key={amount}
                onClick={() => activeZikr && onQuickSubmit(activeZikr, amount)}
                disabled={syncing || !activeZikr}
                className="flex-1 h-12 rounded-xl bg-surface-container-high text-primary font-label-md text-label-md border border-outline-variant/30 active-scale-95 transition-transform disabled:opacity-50 tabular-nums"
              >
                +{amount}
              </button>
            ))}
          </div>
          {customOpen ? (
            <div className="flex flex-col gap-3">
              <InputField
                label={t('room.customAmount')}
                type="number"
                placeholder="e.g., 300"
                value={customDelta}
                onChange={(v) => onCustomDelta(String(v))}
              />
              <div className="flex gap-3">
                <button
                  onClick={() => onCustomOpen(false)}
                  className="flex-1 h-12 rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={() => activeZikr && onCustomSubmit(activeZikr)}
                  disabled={syncing}
                  className="flex-1 h-12 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md hover:opacity-90 active-scale-95 transition-all disabled:opacity-50"
                >
                  {t('common.add')}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => onCustomOpen(true)}
              className="w-full h-12 rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors flex items-center justify-center gap-2"
            >
              <MaterialIcon icon="edit" className="text-[18px]" />
              {t('room.customAmount')}
            </button>
          )}
        </div>
      )}

      {phase === 'upcoming' && (
        <p className="font-caption text-caption text-on-surface-variant mt-3">
          {t('plan.upcomingNote')}
        </p>
      )}
    </section>
  );
};

const CombinedProgress: React.FC<{
  percent: number;
  current: number;
  target: number;
  countable: boolean;
  onOpenCounter: () => void;
}> = ({ percent, current, target, countable, onOpenCounter }) => {
  const { t } = useI18n();
  const ring = (
    <CircularProgress progress={percent} size={180}>
      <div className="flex flex-col items-center justify-center text-center">
        <span className="font-headline-lg-mobile text-[40px] leading-[48px] font-bold text-primary tabular-nums">
          {current.toLocaleString()}
        </span>
        <span className="font-caption text-caption text-on-surface-variant tabular-nums">
          {t('counter.ofTarget', { target: target.toLocaleString() })}
        </span>
        <span className="font-label-md text-label-md text-tertiary font-bold tabular-nums mt-1">
          {percent}%
        </span>
      </div>
    </CircularProgress>
  );

  // The ring already reads as a counter — when counting is possible it IS
  // the CTA: tapping opens the counter modal.
  return (
    <div className="flex justify-center">
      {countable ? (
        <button
          onClick={onOpenCounter}
          aria-label={t('room.startCounting')}
          className="rounded-full cursor-pointer active-scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-4 focus:ring-offset-surface"
        >
          {ring}
        </button>
      ) : (
        ring
      )}
    </div>
  );
};

const SubmissionRow: React.FC<{ submission: SharedSubmission }> = ({ submission }) => {
  const time = new Date(submission.submittedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <li className="flex items-center justify-between py-2.5 px-1">
      <div className="flex items-center gap-3 min-w-0">
        <MaterialIcon
          icon={submission.syncState === 'synced' ? 'cloud_done' : submission.syncState === 'pending' ? 'cloud_upload' : 'cloud_off'}
          className={`text-[18px] ${
            submission.syncState === 'failed'
              ? 'text-error'
              : submission.syncState === 'pending'
                ? 'text-tertiary'
                : 'text-primary'
          }`}
        />
        <span className="font-label-md text-label-md text-primary tabular-nums">
          +{submission.delta.toLocaleString()}
        </span>
        {submission.zikrName && (
          <span className="font-caption text-caption text-on-surface-variant truncate">
            {submission.zikrName}
          </span>
        )}
      </div>
      <span className="font-caption text-caption text-on-surface-variant">{time}</span>
    </li>
  );
};

export default Room;
