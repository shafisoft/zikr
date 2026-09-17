/**
 * PlanFormModal Component (V2)
 * Modal for creating and editing personal plans — one or more zikrs with a
 * combined target or per-zikr targets, on a rolling or one-time schedule.
 */

import React, { useState, useEffect } from 'react';
import MaterialIcon from './MaterialIcon';
import { showAlert } from './ConfirmDialog';
import { Plan, PlanMode, PlanPeriod, PlanZikr } from '../../core/db/types';
import { usePlanStore } from '../../core/stores/planStore';
import { useZikrStore } from '../../core/stores/zikrStore';
import { getZikrDisplayInfoFromZikr } from '../utils/zikrMapping';
import { useI18n } from '../../core/i18n';

interface PlanFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional post-save hook. Stores update themselves via liveQuery. */
  onSave?: () => void;
  editPlan?: Plan | null;
}

interface FormErrors {
  zikrs?: string;
  target?: string;
  period?: string;
  zikrTargets?: string;
}

const PERIOD_OPTIONS = [
  { value: 'daily', labelKey: 'planForm.periodDaily', descriptionKey: 'planForm.periodDailyDesc' },
  { value: 'weekly', labelKey: 'planForm.periodWeekly', descriptionKey: 'planForm.periodWeeklyDesc' },
  { value: 'monthly', labelKey: 'planForm.periodMonthly', descriptionKey: 'planForm.periodMonthlyDesc' },
  { value: 'one-time', labelKey: 'planForm.periodOneTime', descriptionKey: 'planForm.periodOneTimeDesc' },
] as const;

const PlanFormModal: React.FC<PlanFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editPlan,
}) => {
  const { lang, t } = useI18n();
  const zikrs = useZikrStore(state => state.zikrs);
  const addPlan = usePlanStore(state => state.addPlan);
  const updatePlan = usePlanStore(state => state.updatePlan);

  const [planTitle, setPlanTitle] = useState('');
  const [selectedZikrs, setSelectedZikrs] = useState<PlanZikr[]>([]);
  const [mode, setMode] = useState<PlanMode>('combined');
  const [target, setTarget] = useState('');
  const [period, setPeriod] = useState<PlanPeriod>('daily');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);

  // Reset form when modal opens or editPlan changes
  useEffect(() => {
    if (isOpen) {
      if (editPlan) {
        setPlanTitle(editPlan.title ?? '');
        setSelectedZikrs(editPlan.zikrs.map(z => ({ ...z })));
        setMode(editPlan.mode);
        setTarget(editPlan.target != null ? String(editPlan.target) : '');
        setPeriod(editPlan.period);
        setStartDate(editPlan.startDate ? formatDate(editPlan.startDate) : '');
        setEndDate(editPlan.endDate ? formatDate(editPlan.endDate) : '');
      } else {
        // Start with nothing selected — a silent default zikr here has
        // created plans counting zikrs the user never intended.
        setPlanTitle('');
        setSelectedZikrs([]);
        setMode('combined');
        setTarget('33');
        setPeriod('daily');
        setStartDate('');
        setEndDate('');
      }
      setErrors({});
    }
  }, [isOpen, editPlan]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSaving) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose, isSaving]);

  const formatDate = (date: Date): string => {
    return new Date(date).toISOString().split('T')[0];
  };

  const isZikrSelected = (zikrId: number) => selectedZikrs.some(z => z.zikrId === zikrId);

  const toggleZikr = (zikrId: number) => {
    setSelectedZikrs(prev =>
      prev.some(z => z.zikrId === zikrId)
        ? prev.filter(z => z.zikrId !== zikrId)
        : [
            ...prev,
            {
              zikrId,
              name: zikrs.find(z => z.id === zikrId)?.name ?? `Zikr ${zikrId}`,
              arabic: zikrs.find(z => z.id === zikrId)?.arabicText ?? null,
            },
          ]
    );
  };

  const setZikrTarget = (zikrId: number, value: string) => {
    setSelectedZikrs(prev =>
      prev.map(z => (z.zikrId === zikrId ? { ...z, target: value === '' ? undefined : parseInt(value, 10) } : z))
    );
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (selectedZikrs.length === 0) {
      newErrors.zikrs = t('zikrForm.select');
    }

    if (mode === 'combined') {
      if (!target.trim()) {
        newErrors.target = t('planForm.targetRequired');
      } else {
        const targetNum = parseInt(target, 10);
        if (isNaN(targetNum) || targetNum < 1 || targetNum > 100000000) {
          newErrors.target = t('planForm.targetRange');
        }
      }
    } else {
      // Per-zikr mode: every selected zikr needs its own valid target.
      const invalid = selectedZikrs.some(z => {
        const num = z.target;
        return num == null || isNaN(num) || num < 1 || num > 100000000;
      });
      if (invalid) newErrors.zikrTargets = t('planForm.zikrTargetRange');
    }

    // One-time plans run on a date window (validated when provided)
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start > end) {
        newErrors.period = t('planForm.dateOrder');
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      const planData: Omit<Plan, 'id'> = {
        title: planTitle.trim() || undefined,
        mode,
        period,
        target: mode === 'combined' ? parseInt(target, 10) : undefined,
        zikrs: selectedZikrs.map(z => ({
          ...z,
          target: mode === 'per-zikr' ? z.target : undefined,
        })),
        startDate: period === 'one-time' && startDate ? new Date(startDate) : undefined,
        endDate: period === 'one-time' && endDate ? new Date(`${endDate}T23:59:59.999`) : undefined,
        status: editPlan?.status || 'active',
        createdAt: editPlan?.createdAt || new Date(),
        completedAt: editPlan?.completedAt,
      };

      if (editPlan) {
        // Update existing plan
        await updatePlan(editPlan.id, planData);
      } else {
        // Create new plan
        await addPlan(planData);
      }

      // Close modal and refresh
      onSave?.();
      onClose();
    } catch (error) {
      console.error('Failed to save plan:', error);
      await showAlert({ message: t('planForm.saveFailed'), icon: 'error_outline' });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-headline-lg text-headline-lg text-primary">
            {editPlan ? t('planForm.editTitle') : t('planForm.createTitle')}
          </h2>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-1"
            aria-label="Close"
          >
            <MaterialIcon icon="close" className="text-[24px]" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* Plan Title (optional) */}
          <div>
            <label className="block font-label-md text-label-md text-on-surface mb-2">
              {t('planForm.planName')}
            </label>
            <input
              type="text"
              value={planTitle}
              onChange={(e) => setPlanTitle(e.target.value)}
              placeholder={t('planForm.planNamePlaceholder')}
              maxLength={60}
              className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 h-touch-target-min font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              disabled={isSaving}
            />
            <p className="font-caption text-caption text-on-surface-variant mt-2">
              {t('planForm.planNameHint')}
            </p>
          </div>

          {/* Zikr Selection (multi) */}
          <div>
            <label className="block font-label-md text-label-md text-on-surface mb-2">
              {t('planForm.selectZikr')}
            </label>
            {zikrs.length === 0 ? (
              <div className="bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 py-6 text-center">
                <p className="font-body-md text-body-md text-on-surface-variant">
                  {t('progress.selectZikr')}
                </p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto rounded-xl border border-outline-variant/50 divide-y divide-outline-variant/20">
                {zikrs.map((zikr) => {
                  const selected = zikr.id != null && isZikrSelected(zikr.id);
                  const displayInfo = getZikrDisplayInfoFromZikr(zikr, lang);
                  const entry = selectedZikrs.find(z => z.zikrId === zikr.id);
                  return (
                    <div key={zikr.id} className={selected ? 'bg-primary-container/20' : ''}>
                      <button
                        type="button"
                        onClick={() => zikr.id != null && toggleZikr(zikr.id)}
                        aria-pressed={selected}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          selected ? '' : 'hover:bg-surface-variant/30'
                        }`}
                        disabled={isSaving}
                      >
                        <span
                          className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                            selected
                              ? 'bg-primary border-primary text-on-primary'
                              : 'border-outline-variant'
                          }`}
                        >
                          {selected && <MaterialIcon icon="check" className="text-[14px]" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-body-md text-body-md text-on-surface truncate">
                            {zikr.name}
                          </span>
                          <span className="block font-caption text-caption text-on-surface-variant truncate">
                            {displayInfo.translation}
                          </span>
                        </span>
                      </button>
                      {/* Per-zikr target input */}
                      {selected && mode === 'per-zikr' && (
                        <div className="px-4 pb-3 flex items-center gap-3">
                          <label className="font-caption text-caption text-on-surface-variant shrink-0">
                            {t('planForm.zikrTarget')}
                          </label>
                          <input
                            type="number"
                            value={entry?.target ?? ''}
                            onChange={(e) => zikr.id != null && setZikrTarget(zikr.id, e.target.value)}
                            min={1}
                            max={100000000}
                            placeholder="e.g., 100"
                            className="w-32 bg-surface-container-low border border-outline-variant/50 rounded-lg px-3 h-10 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                            disabled={isSaving}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {errors.zikrs && (
              <p className="font-caption text-caption text-error mt-2">{errors.zikrs}</p>
            )}
            {errors.zikrTargets && (
              <p className="font-caption text-caption text-error mt-2">{errors.zikrTargets}</p>
            )}
          </div>

          {/* Target mode */}
          <div>
            <label className="block font-label-md text-label-md text-on-surface mb-2">
              {t('planForm.targetMode')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('combined')}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  mode === 'combined'
                    ? 'border-primary bg-primary-container/20'
                    : 'border-outline-variant/30 hover:border-outline-variant'
                }`}
              >
                <p className="font-label-md text-label-md text-on-surface">
                  {t('planForm.modeCombined')}
                </p>
                <p className="font-caption text-caption text-on-surface-variant">
                  {t('planForm.modeCombinedDesc')}
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode('per-zikr')}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  mode === 'per-zikr'
                    ? 'border-primary bg-primary-container/20'
                    : 'border-outline-variant/30 hover:border-outline-variant'
                }`}
              >
                <p className="font-label-md text-label-md text-on-surface">
                  {t('planForm.modePerZikr')}
                </p>
                <p className="font-caption text-caption text-on-surface-variant">
                  {t('planForm.modePerZikrDesc')}
                </p>
              </button>
            </div>
          </div>

          {/* Combined Target Count */}
          {mode === 'combined' && (
            <div>
              <label className="block font-label-md text-label-md text-on-surface mb-2">
                {t('planForm.targetCount')}
              </label>
              <input
                type="number"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={t('planForm.targetPlaceholder')}
                min={1}
                max={100000000}
                className={`w-full bg-surface-container-low border ${
                  errors.target ? 'border-error' : 'border-outline-variant/50'
                } rounded-xl px-4 h-touch-target-min font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors`}
                disabled={isSaving}
              />
              {errors.target && (
                <p className="font-caption text-caption text-error mt-2">{errors.target}</p>
              )}
              <p className="font-caption text-caption text-on-surface-variant mt-2">
                {t('planForm.targetHint')}
              </p>
            </div>
          )}

          {/* Period Selection */}
          <div>
            <label className="block font-label-md text-label-md text-on-surface mb-2">
              {t('planForm.frequency')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPeriod(option.value)}
                  className={`p-4 rounded-xl border-2 transition-all text-left ${
                    period === option.value
                      ? 'border-primary bg-primary-container/20'
                      : 'border-outline-variant/30 hover:border-outline-variant'
                  }`}
                >
                  <p className="font-label-md text-label-md text-on-surface">
                    {t(option.labelKey)}
                  </p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {t(option.descriptionKey)}
                  </p>
                </button>
              ))}
            </div>
            {errors.period && (
              <p className="font-caption text-caption text-error mt-2">{errors.period}</p>
            )}
          </div>

          {/* One-time window */}
          {period === 'one-time' && (
            <div className="bg-surface-container-low rounded-xl p-4">
              <p className="font-label-md text-label-md text-on-surface mb-4">
                {t('planForm.dateRange')}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-caption text-caption text-on-surface-variant mb-2">
                    {t('planForm.startDate')}
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-surface border border-outline-variant/50 rounded-xl px-3 h-10 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                    disabled={isSaving}
                  />
                </div>
                <div>
                  <label className="block font-caption text-caption text-on-surface-variant mb-2">
                    {t('planForm.endDate')}
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-surface border border-outline-variant/50 rounded-xl px-3 h-10 font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
                    disabled={isSaving}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="bg-primary-container/10 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <MaterialIcon icon="info" className="text-primary text-[20px] mt-0.5" />
              <div>
                <p className="font-body-md text-body-md text-on-surface">
                  {t('planForm.infoTitle')}
                </p>
                <p className="font-caption text-caption text-on-surface-variant mt-1">
                  {t('planForm.infoBody')}
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-touch-target-min rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
              disabled={isSaving}
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 h-touch-target-min rounded-xl font-label-md text-label-md bg-primary-container text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              disabled={isSaving}
            >
              <MaterialIcon icon={editPlan ? 'save' : 'add_circle'} className="text-[18px]" />
              {isSaving ? t('progress.saving') : editPlan ? t('zikrForm.saveChanges') : t('planForm.create')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PlanFormModal;
