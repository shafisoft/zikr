/**
 * Goals & Reminders Screen (V2)
 * Goals list with toggle switches and reminder scheduling
 * NOW INTEGRATED WITH ZUSTAND STORES
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/cards/GlassCard';
import ToggleSwitch from '../components/forms/ToggleSwitch';
import MaterialIcon from '../components/MaterialIcon';
import GoalFormModal from '../components/GoalFormModal';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import OrnamentDivider from '../components/decor/OrnamentDivider';
import { useGoalStore } from '../../core/stores/goalStore';
import { useZikrStore } from '../../core/stores/zikrStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { getZikrDisplayInfo, getZikrDisplayInfoFromZikr } from '../utils/zikrMapping';
import { Goal } from '../../core/db/types';
import type { Progress } from '../../core/stores/goalStore';
import { localeTag, useI18n } from '../../core/i18n';

interface GoalZikrDisplay {
  zikrId: number;
  name: string;
  arabicText: string;
  translation: string;
}

interface GoalWithDisplay extends Goal {
  /** Goal name, falling back to the covered zikrs' names. */
  displayName: string;
  zikrDisplays: GoalZikrDisplay[];
  progress: Progress;
}

const Goals: React.FC = () => {
  const navigate = useNavigate();
  const navActions = useNavActions();
  const { lang, t } = useI18n();

  // Store integrations
  const goals = useGoalStore(state => state.goals);
  const goalsLoading = useGoalStore(state => state.loading);
  const getGoalZikrIds = useGoalStore(state => state.getGoalZikrIds);
  const calculateProgress = useGoalStore(state => state.calculateProgress);
  const updateGoal = useGoalStore(state => state.updateGoal);
  const deleteGoal = useGoalStore(state => state.deleteGoal);
  const zikrs = useZikrStore(state => state.zikrs);
  const sessions = useSessionStore(state => state.sessions);

  // Local state
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editGoal, setEditGoal] = useState<Goal | null>(null);

  // Goals enriched with zikr display info and live progress — derived data,
  // recomputed whenever the underlying stores change (no effect/state round-trip)
  const enhancedGoals: GoalWithDisplay[] = useMemo(() => {
    return goals.map(goal => {
      const zikrIds = getGoalZikrIds(goal);
      const zikrDisplays: GoalZikrDisplay[] = zikrIds
        .map(zikrId => {
          const zikr = zikrs.find(z => z.id === zikrId);
          const displayInfo = zikr
            ? getZikrDisplayInfoFromZikr(zikr, lang)
            : getZikrDisplayInfo(t('history.unknownZikr'), lang);
          return {
            zikrId,
            name: zikr?.name || t('history.unknownZikr'),
            arabicText: displayInfo.arabicText,
            translation: displayInfo.translation,
          };
        });

      const displayName =
        goal.name?.trim() || zikrDisplays.map(d => d.name).join(' · ');

      // Progress over the goal's current period across all its zikrs
      // (calculateProgress filters by the goal's zikr set itself)
      const progress = calculateProgress(goal, sessions);

      return {
        ...goal,
        displayName,
        zikrDisplays,
        progress,
      };
    });
  }, [goals, zikrs, sessions, lang, t]);

  const handleToggle = async (goalId: number, newActiveState: boolean) => {
    setIsUpdating(goalId.toString());

    try {
      const goal = goals.find(g => g.id === goalId);
      if (!goal) return;

      // completedAt means "target reached" — pausing must not stamp it.
      // Reactivating clears any stale completion date (Dexie deletes keys
      // set to undefined).
      await updateGoal(goalId, {
        status: newActiveState ? 'active' : 'paused',
        ...(newActiveState ? { completedAt: undefined } : {}),
      } as any);
    } catch (error) {
      console.error('Failed to update goal:', error);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleCreateNew = () => {
    setIsCreateModalOpen(true);
  };

  const handleEditGoal = (goalId: number) => {
    const goal = goals.find(g => g.id === goalId);
    if (goal) {
      setEditGoal(goal);
    }
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const handleCloseEditModal = () => {
    setEditGoal(null);
  };

  const handleDeleteGoal = async (goalId: number) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;

    try {
      await deleteGoal(goalId);
    } catch (error) {
      console.error('Failed to delete goal:', error);
    }
  };

  // Format period for display
  const formatPeriod = (period: Goal['period']) => {
    switch (period) {
      case 'daily': return t('goals.dailyPractice');
      case 'weekly': return t('goals.weekly');
      case 'monthly': return t('goals.monthly');
      case 'custom': return t('goals.custom');
    }
  };

  // Format schedule for display — the honest cadence of the goal
  // (there is no reminder-time feature yet, so never invent clock times)
  const formatSchedule = (goal: Goal) => {
    if (goal.period === 'daily') return t('goals.everyDay');
    if (goal.period === 'weekly') return t('goals.everyWeek');
    if (goal.period === 'monthly') return t('goals.everyMonth');
    if (goal.startDate && goal.endDate) {
      const fmt = (d: Date) =>
        new Date(d).toLocaleDateString(localeTag(lang), { day: 'numeric', month: 'short' });
      return `${fmt(goal.startDate)} – ${fmt(goal.endDate)}`;
    }
    return t('goals.custom');
  };

  // Jump straight into the counter for the goal's zikr
  const handleStartZikr = (zikrId: number) => {
    navigate(`/counter?zikrId=${zikrId}`);
  };

  // Loading state
  if (goalsLoading) {
    return (
      <div className="min-h-screen bg-surface text-on-surface antialiased flex items-center justify-center">
        <div className="text-on-surface-variant">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <AppLayout
      topBar={{ brand: true, actions: navActions }}
      bottomNav
      contentClassName="w-full max-w-[800px] mx-auto px-container-padding-mobile py-8"
    >
        {/* Header Section */}
        <div className="mb-10 flex flex-col gap-4">
          <div>
            <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-primary mb-2">
              {t('goals.heading')}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              {t('goals.sub')}
            </p>
          </div>
          <OrnamentDivider className="w-48" />
        </div>

        {/* Active Goals Stacked Layout */}
        <div className="space-y-6 mb-12">
          {enhancedGoals.length === 0 ? (
            <div className="text-center py-12">
              <MaterialIcon icon="flag" className="text-6xl text-surface-variant mb-4" />
              <h3 className="font-headline-md text-headline-md text-primary mb-2">
                {t('goals.noGoals')}
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant mb-6">
                {t('goals.noGoalsHint')}
              </p>
            </div>
          ) : (
            enhancedGoals.map((goal) => (
              <GlassCard key={goal.id} hover>
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="flex-1 min-w-0">
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-tertiary-container/10 border border-tertiary-container/30 text-tertiary text-xs font-semibold tracking-wide uppercase mb-3">
                      {formatPeriod(goal.period)}
                    </div>
                    <h2 className="font-headline-md text-headline-md text-primary mb-1">
                      {goal.displayName}
                    </h2>
                    {goal.zikrDisplays.length === 1 && goal.zikrDisplays[0].arabicText && (
                      <p className="font-display-arabic text-[22px] leading-8 text-tertiary mb-1" lang="ar" dir="rtl">
                        {goal.zikrDisplays[0].arabicText}
                      </p>
                    )}
                    {goal.zikrDisplays.length === 1 ? (
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        {goal.zikrDisplays[0].translation}
                      </p>
                    ) : (
                      goal.zikrDisplays.length > 1 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {goal.zikrDisplays.map((d) => (
                            <button
                              key={d.zikrId}
                              type="button"
                              onClick={() => handleStartZikr(d.zikrId)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-variant/60 text-on-surface-variant font-caption text-caption hover:text-primary hover:bg-surface-variant transition-colors"
                              aria-label={t('goals.startAria', { name: d.name })}
                            >
                              <MaterialIcon icon="play_arrow" className="text-[14px]" />
                              {d.name}
                            </button>
                          ))}
                        </div>
                      )
                    )}
                  </div>

                  {/* Toggle Switch */}
                  <div className="flex items-center gap-2">
                    <ToggleSwitch
                      checked={goal.status === 'active'}
                      onChange={(checked) => handleToggle(goal.id!, checked)}
                      disabled={isUpdating === goal.id!.toString()}
                    />
                  </div>
                </div>

                {/* Progress toward this period's target */}
                <div className="mt-4 relative z-10" aria-label={t('goals.progressAria')}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-label-md text-label-md text-tertiary tabular-nums">
                      {Math.round(goal.progress.percentage)}%
                    </span>
                    <span className="font-caption text-caption text-on-surface-variant tabular-nums">
                      {t('goals.progressOf', {
                        current: goal.progress.currentCount,
                        target: goal.target,
                      })}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-surface-variant overflow-hidden">
                    <div
                      className="h-full rounded-full bg-tertiary transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.round(goal.progress.percentage))}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 relative z-10">
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <MaterialIcon
                      icon={goal.period === 'daily' ? 'schedule' : 'event'}
                      className="text-[20px]"
                    />
                    <span className="font-label-md text-label-md">
                      {formatSchedule(goal)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-primary font-label-md text-label-md">
                      <span>{goal.target}x</span>
                    </div>
                    {/* Action buttons */}
                    <button
                      onClick={() => handleEditGoal(goal.id!)}
                      className="text-on-surface-variant hover:text-primary transition-colors p-1"
                      aria-label="Edit goal"
                    >
                      <MaterialIcon icon="edit" className="text-[18px]" />
                    </button>
                    <button
                      onClick={() => handleDeleteGoal(goal.id!)}
                      className="text-on-surface-variant hover:text-error transition-colors p-1"
                      aria-label="Delete goal"
                    >
                      <MaterialIcon icon="delete" className="text-[18px]" />
                    </button>
                  </div>
                </div>

                {/* Start the counter for this goal's zikr (first one when several) */}
                {goal.zikrDisplays.length > 0 && (
                  <button
                    onClick={() => handleStartZikr(goal.zikrDisplays[0].zikrId)}
                    className="
                      mt-4 w-full h-touch-target-min
                      rounded-xl border border-tertiary-container/40 bg-tertiary-container/10
                      text-tertiary font-label-md text-label-md
                      flex items-center justify-center gap-2
                      hover:bg-tertiary-container/20 active:scale-[0.98]
                      transition-all relative z-10
                    "
                    aria-label={t('goals.startAria', { name: goal.displayName })}
                  >
                    <MaterialIcon icon="play_arrow" className="text-[20px]" />
                    {t('goals.start')}
                  </button>
                )}
              </GlassCard>
            ))
          )}
        </div>

        {/* Create New CTA */}
        <div className="mt-8 mb-4">
          <button
            onClick={handleCreateNew}
            className="
              w-full bg-primary-container text-on-primary
              rounded-xl h-touch-target-min
              flex items-center justify-center
              font-label-md text-label-md
              hover:opacity-90 active-scale-[0.98] duration-200
              gap-2 shadow-sm
            "
          >
            <MaterialIcon icon="add" className="text-[20px]" />
            {t('goals.create')}
          </button>
        </div>

      {/* Goal Form Modals */}
      <GoalFormModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
      />
      <GoalFormModal
        isOpen={editGoal !== null}
        onClose={handleCloseEditModal}
        editGoal={editGoal}
      />
    </AppLayout>
  );
};

export default Goals;
