/**
 * Room Screen (V2) — one shared goal.
 * Combined progress ring, contribution, member chips, share code,
 * owner management. My contribution history is device-local only.
 * Noor design system; INTEGRATED WITH sharedRoomStore.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MaterialIcon from '../components/MaterialIcon';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import CircularProgress from '../components/progress/CircularProgress';
import PatternBackdrop from '../components/decor/PatternBackdrop';
import OrnamentDivider from '../components/decor/OrnamentDivider';
import InputField from '../components/forms/InputField';
import { useSharedRoomStore, sharedRoomErrorMessage } from '../../core/stores/sharedRoomStore';
import { sharedRoomService } from '../../core/services/sharedRoom';
import { useZikrStore } from '../../core/stores/zikrStore';
import CounterModal from '../components/counter/CounterModal';
import { SharedSubmission } from '../../core/db/types';
import {
  formatTimeRemaining,
  getRoomPhase,
  progressPercent,
  isValidDelta,
} from '../../core/utils/sharedRoomUtils';
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
    currentMembers,
    isMember,
    mySubmissions,
    syncing,
    loading,
    error,
    openRoom,
    closeCurrentRoom,
    refreshCurrentRoom,
    submit,
    leaveRoom,
    closeRoom,
    removeMember,
    clearError,
  } = useSharedRoomStore();

  const [customDelta, setCustomDelta] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [isCounterOpen, setIsCounterOpen] = useState(false);
  // Live override for the hero ring while the counter modal is open — each
  // count in the modal moves the room's ring immediately.
  const [liveCount, setLiveCount] = useState<number | null>(null);
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
  const phase = useMemo(() => (room ? getRoomPhase(room) : 'active'), [room]);

  // The room's zikr as a local record (matched by name) — lets members open
  // the counter pre-filled with the same dhikr the room is counting.
  const roomZikr = useMemo(
    () => (room ? zikrs.find(z => z.name === room.zikrName) ?? null : null),
    [zikrs, room]
  );

  // Counting is possible while the room runs, for members, when the room's
  // zikr exists in the local library.
  const canCount = phase === 'active' && isMember && roomZikr !== null;

  const roomRing = room ? (
    <CircularProgress progress={progressPercent(liveCount ?? room.total, room.target)} size={180}>
      <div className="flex flex-col items-center justify-center text-center">
        <span className="font-headline-lg-mobile text-[40px] leading-[48px] font-bold text-primary tabular-nums">
          {(liveCount ?? room.total).toLocaleString()}
        </span>
        <span className="font-caption text-caption text-on-surface-variant tabular-nums">
          {t('counter.ofTarget', { target: room.target.toLocaleString() })}
        </span>
        <span className="font-label-md text-label-md text-tertiary font-bold tabular-nums mt-1">
          {progressPercent(liveCount ?? room.total, room.target)}%
        </span>
      </div>
    </CircularProgress>
  ) : null;

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

  const handleQuickSubmit = async (delta: number) => {
    setActionError(null);
    try {
      await submit(delta);
    } catch (err) {
      setActionError(sharedRoomErrorMessage(err));
    }
  };

  const handleCustomSubmit = async () => {
    const delta = parseInt(customDelta, 10);
    if (!isValidDelta(delta)) {
      setActionError(t('errors.invalid-delta'));
      return;
    }
    setActionError(null);
    try {
      await submit(delta);
      setCustomDelta('');
      setCustomOpen(false);
    } catch (err) {
      setActionError(sharedRoomErrorMessage(err));
    }
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
            {/* Hero: combined progress in a mihrab arch */}
            <section className="relative rounded-t-full rounded-b-2xl border border-tertiary-container/30 bg-surface-container-low shadow-card px-6 pt-16 pb-8 overflow-hidden flex flex-col items-center">
              <PatternBackdrop className="absolute inset-0" />
              <div className="relative flex flex-col items-center gap-4 w-full">
                {/* The ring already reads as a counter — when counting is
                    possible it IS the CTA: tapping opens the counter modal. */}
                {canCount ? (
                  <button
                    onClick={() => setIsCounterOpen(true)}
                    aria-label={t('room.startCounting')}
                    className="rounded-full cursor-pointer active-scale-95 transition-transform focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-4 focus:ring-offset-surface"
                  >
                    {roomRing}
                  </button>
                ) : (
                  roomRing
                )}

                {room.zikrArabic && (
                  <p
                    className="font-display-arabic text-[28px] leading-[40px] text-tertiary text-center"
                    lang="ar"
                    dir="rtl"
                  >
                    {room.zikrArabic}
                  </p>
                )}
                <p className="font-label-md text-label-md text-on-surface-variant text-center">
                  {room.zikrName}
                </p>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-caption text-caption border ${
                      phase === 'active'
                        ? 'bg-tertiary-container/10 text-tertiary border-tertiary-container/30'
                        : 'bg-surface-container-high text-on-surface-variant border-transparent'
                    }`}
                  >
                    <MaterialIcon icon="schedule" className="text-[14px]" />
                    {phase === 'active' ? t('group.timeLeft', { time: formatTimeRemaining(room.endsAt) }) : t('group.endedLabel')}
                  </span>
                  {room.status === 'closed' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-caption text-caption bg-surface-container-high text-on-surface-variant">
                      <MaterialIcon icon="lock" className="text-[14px]" />
                      closed
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

            {/* Contribute */}
            {phase === 'active' && isMember && (
              <GlassCardLike>
                <h3 className="font-label-md text-label-md text-primary mb-4 flex items-center gap-2">
                  <MaterialIcon icon="add_circle" className="text-[20px]" />
                  {t('room.addCount')}
                </h3>
                <div className="flex gap-2 mb-3">
                  {QUICK_AMOUNTS.map((amount) => (
                    <button
                      key={amount}
                      onClick={() => handleQuickSubmit(amount)}
                      disabled={syncing}
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
                      onChange={(v) => setCustomDelta(String(v))}
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => {
                          setCustomOpen(false);
                          setCustomDelta('');
                        }}
                        className="flex-1 h-12 rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleCustomSubmit}
                        disabled={syncing}
                        className="flex-1 h-12 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md hover:opacity-90 active-scale-95 transition-all disabled:opacity-50"
                      >
                        {t('common.add')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setCustomOpen(true)}
                    className="w-full h-12 rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors flex items-center justify-center gap-2"
                  >
                    <MaterialIcon icon="edit" className="text-[18px]" />
                    {t('room.customAmount')}
                  </button>
                )}

                {/* Sync status */}
                <p className="font-caption text-caption text-on-surface-variant mt-3 flex items-center gap-1.5">
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
              </GlassCardLike>
            )}

            {/* Not a member (preview via deep link) */}
            {phase === 'active' && !isMember && initialized && (
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

            {/* Ended summary */}
            {phase === 'ended' && (
              <GlassCardLike>
                <div className="text-center flex flex-col items-center gap-2">
                  <MaterialIcon
                    icon={room.total >= room.target ? 'celebration' : 'flag'}
                    filled
                    className={`text-4xl ${room.total >= room.target ? 'text-tertiary' : 'text-on-surface-variant'}`}
                  />
                  <p className="font-headline-md text-headline-md text-primary">
                    {room.total >= room.target ? t('room.goalReached') : t('room.timeUp')}
                  </p>
                  <p className="font-caption text-caption text-on-surface-variant tabular-nums">
                    {t('room.endedSummary', {
                      total: room.total.toLocaleString(),
                      target: room.target.toLocaleString(),
                      percent: progressPercent(room.total, room.target),
                    })}
                  </p>
                </div>
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
                          onClick={() => {
                            if (confirm(t('room.removeConfirm', { name: m.name }))) {
                              void removeMember(room.code, m.userId!);
                            }
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
            {isOwner && phase === 'active' && (
              <button
                onClick={() => {
                  if (confirm(t('room.closeConfirm'))) {
                    void closeRoom(room.code);
                  }
                }}
                className="w-full h-14 rounded-xl bg-error/5 border border-error/20 text-error font-label-md text-label-md flex items-center justify-center gap-2 hover:bg-error/10 transition-colors"
              >
                <MaterialIcon icon="lock" className="text-[20px]" />
                {t('room.closeRoom')}
              </button>
            )}
            {!isOwner && (
              <button
                onClick={() => {
                  if (confirm(t('room.leaveConfirm'))) {
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

      {/* Counter in place — continues the room's count on your own tasbeeh;
          only the taps you add here are saved and contributed */}
      {roomZikr && room && (
        <CounterModal
          isOpen={isCounterOpen}
          onClose={() => {
            // Dismissed — but an auto-saved round may still be queued.
            setIsCounterOpen(false);
            setLiveCount(null);
            void sharedRoomService
              .flushOutbox()
              .then(() => refreshCurrentRoom())
              .catch(() => {});
          }}
          onFinish={() => {
            setIsCounterOpen(false);
            setLiveCount(null);
            void sharedRoomService
              .flushOutbox()
              .then(() => refreshCurrentRoom())
              .catch(() => {});
          }}
          zikr={roomZikr}
          startCount={room.total}
          target={room.target}
          onCount={(count) => setLiveCount(count)}
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

const SubmissionRow: React.FC<{ submission: SharedSubmission }> = ({ submission }) => {
  const time = new Date(submission.submittedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <li className="flex items-center justify-between py-2.5 px-1">
      <div className="flex items-center gap-3">
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
      </div>
      <span className="font-caption text-caption text-on-surface-variant">{time}</span>
    </li>
  );
};

export default Room;
