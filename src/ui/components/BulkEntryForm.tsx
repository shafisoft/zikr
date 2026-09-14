/**
 * BulkEntryForm Component (V2)
 * Allows logging multiple zikr counts in a single form
 * Story 20: Bulk Entry Form
 */

import React, { useState, useEffect } from 'react';
import MaterialIcon from './MaterialIcon';
import { useZikrStore } from '../../core/stores/zikrStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { useSettingsStore } from '../../core/stores/settingsStore';
import { getZikrDisplayInfoFromZikr } from '../utils/zikrMapping';
import { formatDate, getToday } from '../../core/utils/dateUtils';
import { useI18n } from '../../core/i18n';

interface ZikrEntry {
  zikrId: number;
  name: string;
  arabicText: string;
  translation: string;
  count: string;
}

interface BulkEntryFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

const BulkEntryForm: React.FC<BulkEntryFormProps> = ({ onSuccess, onCancel }) => {
  const { lang, t } = useI18n();
  const zikrs = useZikrStore(state => state.zikrs);
  const sessions = useSessionStore(state => state.sessions);

  const [entries, setEntries] = useState<ZikrEntry[]>([]);
  const [date, setDate] = useState(formatDate(getToday()));
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<number, string>>({});

  // Initialize entries with zikrs and smart defaults
  useEffect(() => {
    if (zikrs.length === 0) {
      setEntries([]);
      return;
    }

    // Get last used count for each zikr from recent sessions
    const lastCounts = new Map<number, number>();
    sessions.forEach(session => {
      if (!lastCounts.has(session.zikrId)) {
        lastCounts.set(session.zikrId, session.count);
      }
    });

    // Create entries with smart defaults
    const initialEntries: ZikrEntry[] = zikrs.map(zikr => {
      const displayInfo = getZikrDisplayInfoFromZikr(zikr, lang);
      const lastCount = lastCounts.get(zikr.id!) || 0;

      return {
        zikrId: zikr.id!,
        name: zikr.name,
        arabicText: displayInfo.arabicText,
        translation: displayInfo.translation,
        count: lastCount > 0 ? lastCount.toString() : '',
      };
    });

    setEntries(initialEntries);
  }, [zikrs, sessions, lang]);

  const handleCountChange = (zikrId: number, value: string) => {
    setEntries(prev => prev.map(entry =>
      entry.zikrId === zikrId
        ? { ...entry, count: value }
        : entry
    ));

    // Clear error for this zikr if any
    if (errors[zikrId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[zikrId];
        return newErrors;
      });
    }
  };

  const validateEntries = (): boolean => {
    const newErrors: Record<number, string> = {};

    entries.forEach(entry => {
      if (entry.count && entry.count.trim()) {
        const count = parseInt(entry.count, 10);
        if (isNaN(count) || count < 1 || count > 10000) {
          newErrors[entry.zikrId] = t('bulk.invalidCount');
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getTotalCount = (): number => {
    return entries.reduce((sum, entry) => {
      const count = parseInt(entry.count, 10);
      return sum + (isNaN(count) ? 0 : count);
    }, 0);
  };

  const handleReset = () => {
    setEntries(prev => prev.map(entry => ({ ...entry, count: '' })));
    setErrors({});
  };

  const handleSave = async () => {
    if (!validateEntries()) return;

    // Filter entries with counts
    const entriesWithCounts = entries.filter(e => e.count && parseInt(e.count, 10) > 0);

    if (entriesWithCounts.length === 0) {
      alert(t('bulk.noneSelected'));
      return;
    }

    setIsSaving(true);

    try {
      const timestampDate = new Date(date + 'T00:00:00');

      // Create sessions for each entry
      const sessionPromises = entriesWithCounts.map(entry =>
        useSessionStore.getState().saveSession({
          zikrId: entry.zikrId,
          count: parseInt(entry.count, 10),
          source: 'manual',
          timestamp: timestampDate,
          date: timestampDate,
          editableUntil: new Date(timestampDate.getTime() + 3 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
          countsToGoals: useSettingsStore.getState().settings.countToGoalsAndGroups ?? true,
        })
      );

      await Promise.all(sessionPromises);

      // Reset form
      setEntries(prev => prev.map(entry => ({ ...entry, count: '' })));

      // Show success
      alert(t('bulk.saved', { count: entriesWithCounts.length }));

      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Failed to save bulk entries:', error);
      alert(t('bulk.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  if (entries.length === 0) {
    return (
      <div className="text-center py-12">
        <MaterialIcon icon="error_outline" className="text-6xl text-tertiary-container mb-4 mx-auto" />
        <h3 className="font-headline-md text-headline-md text-primary mb-2">
          {t('bulk.noZikrs')}
        </h3>
        <p className="font-body-md text-body-md text-on-surface-variant">
          {t('bulk.noZikrsHint')}
        </p>
      </div>
    );
  }

  const totalCount = getTotalCount();
  const entriesWithCounts = entries.filter(e => e.count && parseInt(e.count, 10) > 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Date Selector */}
      <div>
        <label className="block font-label-md text-label-md text-on-surface mb-2">
          {t('bulk.date')}
        </label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full bg-surface-container-low border border-outline-variant/50 rounded-xl px-4 h-touch-target-min font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          max={formatDate(getToday())}
        />
      </div>

      {/* Zikr Entries */}
      <div className="flex flex-col gap-3">
        <p className="font-label-md text-label-md text-on-surface-variant">
          {t('bulk.hint')}
        </p>

        {entries.map((entry) => {
          const hasError = !!errors[entry.zikrId];

          return (
            <div
              key={entry.zikrId}
              className={`bg-surface rounded-xl border p-4 transition-colors ${
                hasError ? 'border-error' : 'border-outline-variant/20'
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Zikr Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-display-arabic text-display-arabic text-primary text-sm">
                      {entry.arabicText}
                    </p>
                  </div>
                  <p className="font-body-md text-body-md text-on-surface">
                    {entry.name}
                  </p>
                  <p className="font-caption text-caption text-on-surface-variant">
                    {entry.translation}
                  </p>
                </div>

                {/* Count Input */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={entry.count}
                    onChange={(e) => handleCountChange(entry.zikrId, e.target.value)}
                    placeholder="0"
                    min={1}
                    max={10000}
                    className={`w-24 bg-surface-container-low border ${
                      hasError ? 'border-error' : 'border-outline-variant/50'
                    } rounded-lg px-3 py-2 font-body-md text-body-md text-on-surface text-center focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors`}
                    aria-label={`${entry.name} count`}
                  />
                  <span className="font-caption text-caption text-on-surface-variant">x</span>
                </div>
              </div>

              {hasError && (
                <p className="font-caption text-caption text-error mt-2">
                  {errors[entry.zikrId]}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      {entriesWithCounts.length > 0 && (
        <div className="bg-primary-container/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MaterialIcon icon="summarize" className="text-primary text-[20px]" />
              <div>
                <p className="font-body-md text-body-md text-on-surface">
                  {entriesWithCounts.length === 1
                    ? t('bulk.toLog', { count: entriesWithCounts.length })
                    : t('bulk.toLogPlural', { count: entriesWithCounts.length })}
                </p>
                <p className="font-caption text-caption text-on-surface-variant">
                  {t('bulk.total', { count: totalCount })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            disabled={isSaving || totalCount === 0}
            className="flex-1 h-touch-target-min rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <MaterialIcon icon="refresh" className="text-[18px]" />
            {t('bulk.clearAll')}
          </button>
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={isSaving}
              className="flex-1 h-touch-target-min rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
          )}
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || totalCount === 0}
          className="w-full h-touch-target-min rounded-xl font-label-md text-label-md bg-primary-container text-on-primary hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <MaterialIcon icon="save" className="text-[18px]" />
          {isSaving
            ? t('progress.saving')
            : entriesWithCounts.length === 1
              ? t('bulk.saveOne')
              : t('bulk.saveMany', { count: entriesWithCounts.length })}
        </button>
      </div>

      {/* Info */}
      <div className="bg-surface-container-low rounded-xl p-4">
        <div className="flex items-start gap-3">
          <MaterialIcon icon="info" className="text-primary text-[20px] mt-0.5" />
          <div className="flex-1">
            <p className="font-body-md text-body-md text-on-surface">
              {t('bulk.quickEntryTitle')}
            </p>
            <p className="font-caption text-caption text-on-surface-variant mt-1">
              {t('bulk.quickEntryBody')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BulkEntryForm;
