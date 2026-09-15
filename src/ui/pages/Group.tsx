/**
 * Group Screen (V2) — the groups hub.
 * Groups are persistent: they keep their code, members, and plan history.
 * Cards summarise each group's active plans; closed groups live below.
 * Noor design system; INTEGRATED WITH sharedRoomStore.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import MaterialIcon from '../components/MaterialIcon';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import OrnamentDivider from '../components/decor/OrnamentDivider';
import CreateRoomModal from '../components/CreateRoomModal';
import JoinRoomModal from '../components/JoinRoomModal';
import { useSharedRoomStore } from '../../core/stores/sharedRoomStore';
import { Plan, SharedRoom } from '../../core/db/types';
import { getPlanPhase, sharedPlanProgress } from '../../core/utils/planUtils';
import { useI18n } from '../../core/i18n';

const Group: React.FC = () => {
  const navigate = useNavigate();
  const navActions = useNavActions();
  const { t } = useI18n();
  const {
    initialized,
    configured,
    rooms,
    plans,
    error,
    init,
    clearError,
  } = useSharedRoomStore();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const grouped = useMemo(() => {
    const active = rooms.filter(r => r.status === 'active');
    const closed = rooms.filter(r => r.status !== 'active');
    // Most recently created group first (by local join time).
    const byJoined = (a: SharedRoom, b: SharedRoom) =>
      new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime();
    active.sort(byJoined);
    closed.sort(byJoined);
    return { active, closed };
  }, [rooms]);

  const openRoom = (code: string) => navigate(`/group/${code}`);

  return (
    <AppLayout
      topBar={{ brand: true, actions: navActions }}
      bottomNav
      contentClassName="w-full px-container-padding-mobile py-8"
    >
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4">
          <div>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary mb-2">
              {t('group.heading')}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              {t('group.sub')}
            </p>
          </div>
          <OrnamentDivider className="w-48" />
        </div>

        {/* Not-configured notice */}
        {initialized && !configured && (
          <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-6 text-center flex flex-col items-center">
            <MaterialIcon icon="cloud_off" className="text-4xl text-tertiary mb-3" />
            <h3 className="font-headline-md text-headline-md text-primary mb-2">
              {t('group.notConfiguredTitle')}
            </h3>
            <p className="font-caption text-caption text-on-surface-variant">
              {t('group.notConfiguredBody')}
            </p>
          </div>
        )}

        {configured && (
          <>
            {/* Actions */}
            <div className="flex flex-col gap-3 mb-8">
              <button
                onClick={() => setIsCreateOpen(true)}
                className="w-full bg-primary-container text-on-primary rounded-xl h-touch-target-min flex items-center justify-center gap-2 font-label-md text-label-md hover:opacity-90 active-scale-98 duration-200 shadow-sm"
              >
                <MaterialIcon icon="add" className="text-[20px]" />
                {t('group.new')}
              </button>
              <button
                onClick={() => setIsJoinOpen(true)}
                className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl h-touch-target-min flex items-center justify-center gap-2 font-label-md text-label-md text-primary hover:bg-surface-container transition-colors"
              >
                <MaterialIcon icon="group_add" className="text-[20px]" />
                {t('group.join')}
              </button>
            </div>

            {error && (
              <div
                className="mb-6 bg-error/10 border border-error/20 rounded-xl p-4 flex items-center justify-between gap-3"
                role="alert"
              >
                <p className="font-caption text-caption text-error">{error ? t(`errors.${error}`) : null}</p>
                <button onClick={clearError} aria-label="Dismiss" className="text-error shrink-0">
                  <MaterialIcon icon="close" className="text-[18px]" />
                </button>
              </div>
            )}

            {/* Loading */}
            {!initialized && (
              <div className="flex items-center justify-center py-12 text-on-surface-variant">
                {t('common.loading')}
              </div>
            )}

            {/* Empty state */}
            {initialized && rooms.length === 0 && (
              <div className="flex flex-col items-center text-center py-8 relative overflow-hidden rounded-t-[120px] rounded-b-2xl border border-tertiary-container/30 bg-surface-container-low px-6 pt-14 pb-8">
                <div className="w-20 h-24 rounded-t-full rounded-b-xl border border-tertiary-container/40 bg-surface-container-lowest flex items-center justify-center mb-6">
                  <MaterialIcon icon="groups" filled className="text-5xl text-tertiary" />
                </div>
                <h3 className="font-headline-md text-headline-md text-primary mb-2">
                  {t('group.emptyTitle')}
                </h3>
                <p className="font-body-md text-body-md text-on-surface-variant mb-2">
                  {t('group.emptyBody')}
                </p>
              </div>
            )}

            {/* Active groups */}
            {grouped.active.length > 0 && (
              <section className="flex flex-col gap-4 mb-10">
                <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide">
                  {t('group.groups', { count: grouped.active.length })}
                </h3>
                {grouped.active.map((room) => (
                  <RoomCard key={room.code} room={room} plans={plans} onClick={() => openRoom(room.code)} />
                ))}
              </section>
            )}

            {/* Closed groups */}
            {grouped.closed.length > 0 && (
              <section className="flex flex-col gap-4">
                <h3 className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide">
                  {t('group.closed')}
                </h3>
                {grouped.closed.map((room) => (
                  <RoomCard key={room.code} room={room} plans={plans} onClick={() => openRoom(room.code)} />
                ))}
              </section>
            )}

            {/* Privacy explainer */}
            {rooms.length > 0 && (
              <div className="mt-10 bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-start gap-3">
                <MaterialIcon icon="lock" className="text-tertiary text-[20px] mt-0.5" />
                <p className="font-caption text-caption text-on-surface-variant">
                  {t('group.privacyNote')}
                </p>
              </div>
            )}
          </>
        )}

      {/* Modals */}
      <CreateRoomModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(room) => {
          setIsCreateOpen(false);
          navigate(`/group/${room.code}`);
        }}
      />
      <JoinRoomModal
        isOpen={isJoinOpen}
        onClose={() => setIsJoinOpen(false)}
        onJoined={(room) => {
          setIsJoinOpen(false);
          navigate(`/group/${room.code}`);
        }}
      />

    </AppLayout>
  );
};

// ---------- Group card ----------

interface RoomCardProps {
  room: SharedRoom;
  plans: Plan[];
  onClick: () => void;
}

const RoomCard: React.FC<RoomCardProps> = ({ room, plans, onClick }) => {
  const { t } = useI18n();
  const now = new Date();

  const roomPlans = plans.filter(p => p.roomCode === room.code);
  const activePlans = roomPlans.filter(p => getPlanPhase(p, now) === 'active');
  const primary = activePlans[0];
  const primaryProgress = primary ? sharedPlanProgress(primary) : null;
  const closed = room.status !== 'active';

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-surface-container-lowest rounded-xl border border-outline-variant/30 p-5 shadow-card relative overflow-hidden hover:shadow-card-lifted transition-shadow duration-300 active-scale-98"
    >
      {/* Gold quarter-circle wash */}
      <div
        className="absolute top-0 right-0 w-20 h-20 bg-tertiary-fixed/20 rounded-bl-full -mr-3 -mt-3 pointer-events-none"
        aria-hidden="true"
      />

      <div className="flex justify-between items-start gap-3 relative z-10">
        <div className="min-w-0">
          <h4 className="font-headline-md text-headline-md text-primary text-lg truncate">
            {room.title}
          </h4>
          <p className="font-caption text-caption text-on-surface-variant mt-0.5 truncate">
            {primary
              ? planZikrLabel(primary)
              : t(closed ? 'group.closedLabel' : 'group.noActivePlan')}
          </p>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-caption text-caption border ${
            closed
              ? 'bg-surface-container-high text-on-surface-variant border-transparent'
              : 'bg-tertiary-container/10 text-tertiary border-tertiary-container/30'
          }`}
        >
          <MaterialIcon icon={closed ? 'lock' : 'target'} className="text-[14px]" />
          {closed
            ? t('group.closedLabel')
            : activePlans.length > 1
              ? t('group.planCount', { count: activePlans.length })
              : primary
                ? t('group.activeLabel')
                : t('group.noActivePlan')}
        </span>
      </div>

      {/* Primary plan progress */}
      {primaryProgress && (
        <div className="mt-4 relative z-10">
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="font-label-md text-label-md text-primary tabular-nums">
              {primaryProgress.combined.toLocaleString()}
              <span className="text-on-surface-variant font-normal"> / {primaryProgress.target.toLocaleString()}</span>
            </span>
            <span className="font-caption text-caption text-tertiary font-semibold tabular-nums">
              {primaryProgress.percent}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface-container-high overflow-hidden">
            <div
              className="h-full rounded-full bg-tertiary-container transition-all duration-700"
              style={{ width: `${primaryProgress.percent}%` }}
            />
          </div>
        </div>
      )}
    </button>
  );
};

function planZikrLabel(plan: Plan): string {
  const names = plan.zikrs.map(z => z.name);
  const joined = names.length > 2 ? `${names.slice(0, 2).join(' · ')} +${names.length - 2}` : names.join(' · ');
  return plan.title?.trim() ? `${plan.title} — ${joined}` : joined;
}

export default Group;
