/**
 * Progress Screen (V2)
 * Stats overview, weekly chart, and manual entry form
 * NOW INTEGRATED WITH ZUSTAND STORES
 */

import React, { useState, useEffect, useMemo } from 'react';
import GlassCard from '../components/cards/GlassCard';
import InputField from '../components/forms/InputField';
import MaterialIcon from '../components/MaterialIcon';
import { showAlert } from '../components/ConfirmDialog';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import WeeklyChart from '../components/progress/WeeklyChart';
import SessionHistory from '../components/SessionHistory';
import BulkEntryForm from '../components/BulkEntryForm';
import OrnamentDivider from '../components/decor/OrnamentDivider';
import { useSessionStore } from '../../core/stores/sessionStore';
import { calculateOverallStreak } from '../../core/utils/overallStreak';
import { totalDhikr as metricsTotalDhikr, weeklyData as metricsWeeklyData } from '../../core/utils/metrics';
import { useZikrStore } from '../../core/stores/zikrStore';
import { useSettingsStore } from '../../core/stores/settingsStore';
import { formatDate, getToday } from '../../core/utils/dateUtils';
import { useI18n } from '../../core/i18n';

/** Monday-first chart labels — localized at the UI edge, as presentation. */
const WEEK_LABELS = {
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
  bn: ['র', 'সো', 'ম', 'বু', 'বৃ', 'শু', 'শ'],
} as const;

const Progress: React.FC = () => {
  const navActions = useNavActions();
  const { lang, t } = useI18n();

  // Store integrations
  const sessions = useSessionStore(state => state.sessions);
  const sessionsLoading = useSessionStore(state => state.loading);
  const zikrs = useZikrStore(state => state.zikrs);

  // Local state
  const [logDate, setLogDate] = useState(formatDate(getToday()));
  const [logCount, setLogCount] = useState('');
  const [selectedZikr, setSelectedZikr] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [entryMode, setEntryMode] = useState<'single' | 'bulk'>('single');

  // Derived statistics — pure functions from core/utils (same ones Home
  // uses), memoized off the stores. No effect/state round-trip.
  const streakDays = useMemo(
    () => calculateOverallStreak(sessions.map(s => s.date)),
    [sessions]
  );
  const totalDhikr = useMemo(() => metricsTotalDhikr(sessions), [sessions]);
  const weeklyData = useMemo(
    () => metricsWeeklyData(sessions, WEEK_LABELS[lang]),
    [sessions, lang]
  );

  // Set default zikr to first available
  useEffect(() => {
    if (zikrs.length > 0 && !selectedZikr) {
      setSelectedZikr(zikrs[0].id || null);
    }
  }, [zikrs, selectedZikr]);

  const handleSaveProgress = async () => {
    if (!selectedZikr || !logCount || isSaving) return;

    const count = parseInt(logCount, 10);
    if (isNaN(count) || count <= 0 || count > 10000) {
      await showAlert({ message: t('progress.validCount') });
      return;
    }

    setIsSaving(true);

    try {
      const timestampDate = new Date(logDate + 'T00:00:00');

      await useSessionStore.getState().saveSession({
        zikrId: selectedZikr,
        count,
        source: 'manual',
        timestamp: timestampDate,
        date: timestampDate,
        editableUntil: new Date(timestampDate.getTime() + 3 * 24 * 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
        countsToGoals: useSettingsStore.getState().settings.countToGoalsAndGroups ?? true,
      });

      // Clear form
      setLogCount('');
      setLogDate(formatDate(getToday()));

      // Show success feedback
      await showAlert({ message: t('progress.saved'), icon: 'check_circle' });
    } catch (error) {
      console.error('Failed to save progress:', error);
      await showAlert({ message: t('bulk.saveFailed'), icon: 'error_outline' });
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (sessionsLoading) {
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
      contentClassName="pt-8 px-container-padding-mobile gap-8"
    >
        {/* Header */}
        <div className="text-center flex flex-col gap-4">
          <div>
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary mb-2">
              {t('progress.heading')}
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              {t('progress.sub')}
            </p>
          </div>
          <OrnamentDivider className="w-48 mx-auto" />
        </div>

        {/* Stats Overview (Bento Style) */}
        <div className="grid grid-cols-2 gap-4">
          {/* Streak Card */}
          <GlassCard className="p-6 flex flex-col items-center justify-center text-center">
            <MaterialIcon icon="local_fire_department" filled className="text-tertiary mb-2 text-4xl" />
            <p className="font-headline-md text-headline-md text-primary tabular-nums">
              {t(streakDays === 1 ? 'progress.streakDay' : 'progress.streakDays', { count: streakDays })}
            </p>
            <p className="font-caption text-caption text-on-surface-variant mt-1">
              {t('progress.streakLabel')}
            </p>
          </GlassCard>

          {/* Total Count Card */}
          <GlassCard className="p-6 flex flex-col items-center justify-center text-center">
            <MaterialIcon icon="all_inclusive" className="text-primary mb-2 text-4xl" />
            <p className="font-headline-md text-headline-md text-primary tabular-nums">
              {totalDhikr.toLocaleString()}
            </p>
            <p className="font-caption text-caption text-on-surface-variant mt-1">
              {t('progress.totalLabel')}
            </p>
          </GlassCard>
        </div>

        {/* Weekly Progress */}
        <GlassCard className="p-6" pattern>
          <h3 className="font-label-md text-label-md text-primary mb-6">{t('progress.weekly')}</h3>
          <WeeklyChart data={weeklyData} max={100} />
        </GlassCard>

        {/* Log Offline Progress Form */}
        <GlassCard className="p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-label-md text-label-md text-primary flex items-center gap-2">
              <MaterialIcon icon="edit_document" />
              {t('progress.logOffline')}
            </h3>

            {/* Mode Toggle */}
            <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-lg">
              <button
                onClick={() => setEntryMode('single')}
                className={`px-3 py-1.5 rounded-md font-caption text-caption transition-all ${
                  entryMode === 'single'
                    ? 'bg-surface text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-variant/50'
                }`}
              >
                {t('progress.single')}
              </button>
              <button
                onClick={() => setEntryMode('bulk')}
                className={`px-3 py-1.5 rounded-md font-caption text-caption transition-all ${
                  entryMode === 'bulk'
                    ? 'bg-surface text-on-surface shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-variant/50'
                }`}
              >
                {t('progress.bulk')}
              </button>
            </div>
          </div>

          {entryMode === 'bulk' ? (
            <BulkEntryForm />
          ) : (
            <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
            {/* Zikr Selector */}
            <div className="relative">
              <label className="block font-caption text-caption text-on-surface-variant mb-2">
                {t('progress.zikr')}
              </label>
              <select
                value={selectedZikr || ''}
                onChange={(e) => setSelectedZikr(Number(e.target.value))}
                className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl px-4 h-touch-target-min font-body-md text-body-md text-on-surface focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
              >
                <option value="">{t('progress.selectZikr')}</option>
                {zikrs.map((zikr) => (
                  <option key={zikr.id} value={zikr.id}>
                    {zikr.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Input */}
            <InputField
              label={t('progress.date')}
              type="date"
              value={logDate}
              onChange={(value) => setLogDate(String(value))}
              icon="calendar_today"
            />

            {/* Count Input */}
            <InputField
              label={t('progress.count')}
              type="number"
              placeholder={t('progress.countPlaceholder')}
              value={logCount}
              onChange={(value) => setLogCount(String(value))}
              icon="numbers"
            />

            {/* Submit Button */}
            <button
              onClick={handleSaveProgress}
              disabled={!selectedZikr || !logCount || isSaving}
              className="
                w-full bg-primary-container text-on-primary
                rounded-xl h-touch-target-min
                flex items-center justify-center gap-2
                hover:opacity-90 active-scale-95 transition-all mt-2
                font-label-md text-label-md
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              <MaterialIcon icon="add_circle" />
              {isSaving ? t('progress.saving') : t('progress.save')}
            </button>
          </form>
          )}
        </GlassCard>

        {/* Session History Section */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-headline-md text-headline-md text-primary flex items-center gap-2">
              <MaterialIcon icon="history" />
              {t('progress.history')}
            </h3>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-on-surface-variant flex items-center gap-2 px-4 py-2 rounded-full hover:bg-surface-variant/50 transition-colors font-caption text-caption"
            >
              {showHistory ? t('progress.hide') : t('progress.show')}
              <MaterialIcon icon={showHistory ? 'expand_less' : 'expand_more'} className="text-[18px]" />
            </button>
          </div>

          {showHistory && (
            <SessionHistory onRefresh={handleSaveProgress} />
          )}
        </section>

    </AppLayout>
  );
};

export default Progress;
