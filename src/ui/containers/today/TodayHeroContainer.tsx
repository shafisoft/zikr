/**
 * TodayHeroContainer — Home's unified day hero (Noor 2.0 phase 1): the
 * daily-plan mihrab arch now carries the whole day — the plan ring, the
 * day's total across every practice (free counting, routines, after-salah
 * sets), a guilt-free pace line against the recent daily rhythm, and one
 * chip per countable plan (personal + mirrored group plans). Everything
 * derives purely via core/utils memoized off the stores; navigation
 * bubbles up to the page.
 *
 * Renders nothing until there is something to show (no plans, no counts,
 * no rhythm yet) — a brand-new library keeps the empty state's focus.
 */

import React, { useMemo } from 'react';
import CircularProgress from '../../components/progress/CircularProgress';
import PlanChip from '../../components/cards/PlanChip';
import MaterialIcon from '../../components/MaterialIcon';
import PatternBackdrop from '../../components/decor/PatternBackdrop';
import OrnamentDivider from '../../components/decor/OrnamentDivider';
import { useI18n } from '../../../core/i18n';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { usePlanStore } from '../../../core/stores/planStore';
import { useSharedRoomStore } from '../../../core/stores/sharedRoomStore';
import {
  todayTotal as metricsTodayTotal,
  planRingProgress,
  recentDailyAverage,
} from '../../../core/utils/metrics';
import { buildPlanChips } from '../../../core/utils/planUtils';

interface TodayHeroContainerProps {
  /** A chip's tap — the page navigates to /plans. */
  onOpenPlans: () => void;
}

type PaceKey = 'ahead' | 'even' | 'behind';

const PACE_ICONS: Record<PaceKey, string> = {
  ahead: 'trending_up',
  even: 'trending_flat',
  behind: 'trending_down',
};

const TodayHeroContainer: React.FC<TodayHeroContainerProps> = ({ onOpenPlans }) => {
  const { t } = useI18n();
  const sessions = useSessionStore(state => state.sessions);
  const plans = usePlanStore(state => state.plans);
  const computePlanProgress = usePlanStore(state => state.computePlanProgress);
  // Mirrored group plans — the same store slice the page and Room read.
  const groupPlans = useSharedRoomStore(state => state.plans);

  const ring = useMemo(() => planRingProgress(plans, sessions), [plans, sessions]);
  const count = useMemo(() => metricsTodayTotal(sessions), [sessions]);
  const average = useMemo(() => recentDailyAverage(sessions), [sessions]);
  const chips = useMemo(
    () =>
      buildPlanChips({
        personalPlans: plans,
        groupPlans,
        sessions,
        progressOf: computePlanProgress,
      }),
    [plans, groupPlans, sessions, computePlanProgress]
  );

  const pace: PaceKey | null =
    average > 0 ? (count > average ? 'ahead' : count < average ? 'behind' : 'even') : null;

  const hasPlans = plans.length > 0;
  if (!hasPlans && count === 0 && average === 0) return null;

  return (
    <section
      aria-label={t('home.hero.aria')}
      className="relative w-full max-w-[300px] mx-auto flex flex-col items-center rounded-t-full rounded-b-2xl border border-tertiary-container/30 bg-surface-container-low shadow-card px-6 pt-20 pb-8 overflow-hidden"
    >
      <PatternBackdrop className="absolute inset-0" variant="green" />
      <div className="relative flex w-full flex-col items-center gap-5">
        {hasPlans && (
          <CircularProgress progress={ring.percent} size={192}>
            <div className="flex flex-col items-center justify-center text-center">
              <MaterialIcon icon="spa" filled className="text-tertiary text-4xl mb-1" />
              <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary tabular-nums">
                {ring.percent}%
              </span>
              <span className="font-caption text-caption text-on-surface-variant mt-1">
                {t('home.dailyGoal')}
              </span>
            </div>
          </CircularProgress>
        )}
        <div className="flex flex-col items-center gap-1 text-center">
          {count > 0 && (
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('home.doneToday', { count })}
            </p>
          )}
          {pace && (
            <p className="flex items-center gap-1 font-caption text-caption text-tertiary">
              <MaterialIcon icon={PACE_ICONS[pace]} className="text-[15px]" />
              {t(`home.pace.${pace}`, { avg: average })}
            </p>
          )}
        </div>
        {chips.length > 0 && (
          <div className="-mx-2 flex w-[calc(100%+1rem)] gap-2 overflow-x-auto px-2 pb-1 hide-scrollbar">
            {chips.map(chip => (
              <PlanChip key={chip.key} chip={chip} onPress={onOpenPlans} />
            ))}
          </div>
        )}
        <OrnamentDivider className="w-32" />
      </div>
    </section>
  );
};

export default TodayHeroContainer;
