/**
 * Plans Screen (V2) — personal plans list with toggle switches.
 * A plan covers one or more zikrs with a combined target or per-zikr
 * targets, on a rolling (daily/weekly/monthly) or one-time schedule.
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/cards/GlassCard';
import ToggleSwitch from '../components/forms/ToggleSwitch';
import MaterialIcon from '../components/MaterialIcon';
import { showConfirm } from '../components/ConfirmDialog';
import PlanFormModal from '../components/PlanFormModal';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import OrnamentDivider from '../components/decor/OrnamentDivider';
import { usePlanStore } from '../../core/stores/planStore';
import { useZikrStore } from '../../core/stores/zikrStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { getZikrDisplayInfoFromZikr } from '../utils/zikrMapping';
import { counterUrl } from '../utils/counterLink';
import { planZikrTarget } from '../../core/utils/planUtils';
import { Plan } from '../../core/db/types';
import type { PlanProgress } from '../../core/stores/planStore';
import { localeTag, useI18n } from '../../core/i18n';

interface PlanZikrDisplay {
  zikrId?: number;
  name: string;
  arabicText: string;
  translation: string;
}

interface PlanWithDisplay extends Plan {
  /** Plan name, falling back to the covered zikrs' names. */
  displayName: string;
  zikrDisplays: PlanZikrDisplay[];
  progress: PlanProgress;
}

const Plans: React.FC = () => {
  const navigate = useNavigate();
  const navActions = useNavActions();
  const { lang, t } = useI18n();

  // Store integrations
  const plans = usePlanStore(state => state.plans);
  const plansLoading = usePlanStore(state => state.loading);
  const computePlanProgress = usePlanStore(state => state.computePlanProgress);
  const updatePlan = usePlanStore(state => state.updatePlan);
  const deletePlan = usePlanStore(state => state.deletePlan);
  const zikrs = useZikrStore(state => state.zikrs);
  const sessions = useSessionStore(state => state.sessions);

  // Local state
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | null>(null);

  // Plans enriched with zikr display info and live progress — derived data,
  // recomputed whenever the underlying stores change (no effect/state round-trip)
  const enhancedPlans: PlanWithDisplay[] = useMemo(() => {
    return plans.map(plan => {
      const zikrDisplays: PlanZikrDisplay[] = plan.zikrs
        .map(z => {
          const zikr = z.zikrId != null ? zikrs.find(zz => zz.id === z.zikrId) : undefined;
          return {
            zikrId: z.zikrId,
            name: z.name,
            arabicText: zikr?.arabicText ?? (typeof z.arabic === 'string' ? z.arabic : ''),
            translation: zikr ? getZikrDisplayInfoFromZikr(zikr, lang).translation : '',
          };
        });

      const displayName =
        plan.title?.trim() || zikrDisplays.map(d => d.name).join(' · ');

      // Progress over the plan's current period across all its zikrs
      const progress = computePlanProgress(plan, sessions);

      return {
        ...plan,
        displayName,
        zikrDisplays,
        progress,
      };
    });
  }, [plans, zikrs, sessions, lang, computePlanProgress]);

  const handleToggle = async (planId: string, newActiveState: boolean) => {
    setIsUpdating(planId);

    try {
      // completedAt means "target reached" — pausing must not stamp it.
      // Reactivating clears any stale completion date (Dexie deletes keys
      // set to undefined).
      await updatePlan(planId, {
        status: newActiveState ? 'active' : 'paused',
        ...(newActiveState ? { completedAt: undefined } : {}),
      } as any);
    } catch (error) {
      console.error('Failed to update plan:', error);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleCreateNew = () => {
    setIsCreateModalOpen(true);
  };

  const handleEditPlan = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      setEditPlan(plan);
    }
  };

  const handleCloseCreateModal = () => {
    setIsCreateModalOpen(false);
  };

  const handleCloseEditModal = () => {
    setEditPlan(null);
  };

  const handleDeletePlan = async (planId: string) => {
    if (!(await showConfirm({
      message: t('plans.deleteConfirm'),
      danger: true,
      confirmLabel: t('common.delete'),
    }))) return;

    try {
      await deletePlan(planId);
    } catch (error) {
      console.error('Failed to delete plan:', error);
    }
  };

  // Format period for display
  const formatPeriod = (period: Plan['period']) => {
    switch (period) {
      case 'daily': return t('plans.dailyPractice');
      case 'weekly': return t('plans.weekly');
      case 'monthly': return t('plans.monthly');
      case 'one-time': return t('plans.oneTime');
    }
  };

  // Format schedule for display — the honest cadence of the plan
  // (there is no reminder-time feature yet, so never invent clock times)
  const formatSchedule = (plan: Plan) => {
    if (plan.period === 'daily') return t('plans.everyDay');
    if (plan.period === 'weekly') return t('plans.everyWeek');
    if (plan.period === 'monthly') return t('plans.everyMonth');
    if (plan.startDate && plan.endDate) {
      const fmt = (d: Date) =>
        new Date(d).toLocaleDateString(localeTag(lang), { day: 'numeric', month: 'short' });
      return `${fmt(plan.startDate)} – ${fmt(plan.endDate)}`;
    }
    return t('plans.oneTime');
  };

  // Jump straight into the counter for the plan's zikr, counting toward the
  // plan's number (planZikrTarget — the per-zikr target or the combined
  // one). The plan id enables the counter's continue-next sequence for
  // per-zikr plans.
  const handleStartZikr = (plan: Plan, zikrId: number) => {
    navigate(counterUrl({ zikrId, target: planZikrTarget(plan, zikrId), planId: plan.id }));
  };

  // Loading state
  if (plansLoading) {
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
              {t('plans.heading')}
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant">
              {t('plans.sub')}
            </p>
          </div>
          <OrnamentDivider className="w-48" />
        </div>

        {/* Plans Stacked Layout */}
        <div className="space-y-6 mb-12">
          {enhancedPlans.length === 0 ? (
            <div className="text-center py-12">
              <MaterialIcon icon="flag" className="text-6xl text-surface-variant mb-4" />
              <h3 className="font-headline-md text-headline-md text-primary mb-2">
                {t('plans.noPlans')}
              </h3>
              <p className="font-body-md text-body-md text-on-surface-variant mb-6">
                {t('plans.noPlansHint')}
              </p>
            </div>
          ) : (
            enhancedPlans.map((plan) => (
              <GlassCard key={plan.id} hover>
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="flex-1 min-w-0">
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-tertiary-container/10 border border-tertiary-container/30 text-tertiary text-xs font-semibold tracking-wide uppercase mb-3">
                      {formatPeriod(plan.period)}
                    </div>
                    <h2 className="font-headline-md text-headline-md text-primary mb-1">
                      {plan.displayName}
                    </h2>
                    {plan.zikrDisplays.length === 1 && plan.zikrDisplays[0].arabicText && (
                      <p className="font-display-arabic text-[22px] leading-8 text-tertiary mb-1" lang="ar" dir="rtl">
                        {plan.zikrDisplays[0].arabicText}
                      </p>
                    )}
                    {plan.zikrDisplays.length === 1 && plan.zikrDisplays[0].translation ? (
                      <p className="font-body-md text-body-md text-on-surface-variant">
                        {plan.zikrDisplays[0].translation}
                      </p>
                    ) : (
                      plan.zikrDisplays.length > 1 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {plan.zikrDisplays.map((d) => (
                            <button
                              key={`${d.zikrId ?? d.name}`}
                              type="button"
                              onClick={() => d.zikrId != null && handleStartZikr(plan, d.zikrId)}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-variant/60 text-on-surface-variant font-caption text-caption hover:text-primary hover:bg-surface-variant transition-colors"
                              aria-label={t('plans.startAria', { name: d.name })}
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
                      checked={plan.status === 'active'}
                      onChange={(checked) => handleToggle(plan.id, checked)}
                      disabled={isUpdating === plan.id}
                    />
                  </div>
                </div>

                {/* Combined progress toward this period's target */}
                {plan.mode === 'combined' && (
                  <div className="mt-4 relative z-10" aria-label={t('plans.progressAria')}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-label-md text-label-md text-tertiary tabular-nums">
                        {Math.round(plan.progress.percentage)}%
                      </span>
                      <span className="font-caption text-caption text-on-surface-variant tabular-nums">
                        {t('plans.progressOf', {
                          current: plan.progress.currentCount,
                          target: plan.progress.target,
                        })}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-variant overflow-hidden">
                      <div
                        className="h-full rounded-full bg-tertiary transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.round(plan.progress.percentage))}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Per-zikr progress — each zikr against its own target */}
                {plan.mode === 'per-zikr' && plan.progress.perZikr.length > 0 && (
                  <div className="mt-4 flex flex-col gap-3 relative z-10" aria-label={t('plans.progressAria')}>
                    {plan.progress.perZikr.map(z => (
                      <div key={z.name}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-label-md text-label-md text-on-surface">
                            {z.name}
                          </span>
                          <span className="font-caption text-caption text-on-surface-variant tabular-nums">
                            {t('plans.progressOf', { current: z.currentCount, target: z.target })}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-variant overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              z.currentCount >= z.target && z.target > 0 ? 'bg-primary' : 'bg-tertiary'
                            }`}
                            style={{ width: `${Math.min(100, Math.round(z.percentage))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-4 relative z-10">
                  <div className="flex items-center gap-2 text-on-surface-variant">
                    <MaterialIcon
                      icon={plan.period === 'daily' ? 'schedule' : 'event'}
                      className="text-[20px]"
                    />
                    <span className="font-label-md text-label-md">
                      {formatSchedule(plan)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-primary font-label-md text-label-md">
                      <span>{plan.progress.target.toLocaleString()}x</span>
                    </div>
                    {/* Action buttons */}
                    <button
                      onClick={() => handleEditPlan(plan.id)}
                      className="text-on-surface-variant hover:text-primary transition-colors p-1"
                      aria-label="Edit plan"
                    >
                      <MaterialIcon icon="edit" className="text-[18px]" />
                    </button>
                    <button
                      onClick={() => handleDeletePlan(plan.id)}
                      className="text-on-surface-variant hover:text-error transition-colors p-1"
                      aria-label="Delete plan"
                    >
                      <MaterialIcon icon="delete" className="text-[18px]" />
                    </button>
                  </div>
                </div>

                {/* Start the counter for this plan's zikr (first one when several) */}
                {plan.zikrDisplays.some(d => d.zikrId != null) && (
                  <button
                    onClick={() => handleStartZikr(plan, plan.zikrDisplays.find(d => d.zikrId != null)!.zikrId!)}
                    className="
                      mt-4 w-full h-touch-target-min
                      rounded-xl border border-tertiary-container/40 bg-tertiary-container/10
                      text-tertiary font-label-md text-label-md
                      flex items-center justify-center gap-2
                      hover:bg-tertiary-container/20 active:scale-[0.98]
                      transition-all relative z-10
                    "
                    aria-label={t('plans.startAria', { name: plan.displayName })}
                  >
                    <MaterialIcon icon="play_arrow" className="text-[20px]" />
                    {t('plans.start')}
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
            {t('plans.create')}
          </button>
        </div>

      {/* Plan Form Modals */}
      <PlanFormModal
        isOpen={isCreateModalOpen}
        onClose={handleCloseCreateModal}
      />
      <PlanFormModal
        isOpen={editPlan !== null}
        onClose={handleCloseEditModal}
        editPlan={editPlan}
      />
    </AppLayout>
  );
};

export default Plans;
