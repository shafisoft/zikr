/**
 * Home Screen (V2)
 * Dashboard with Arabic greeting, streak badge, daily goal arch, and quick start cards
 * INTEGRATED WITH ZUSTAND STORES
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import CircularProgress from '../components/progress/CircularProgress';
import ZikrCard from '../components/cards/ZikrCard';
import MaterialIcon from '../components/MaterialIcon';
import ZikrFormModal from '../components/ZikrFormModal';
import PatternBackdrop from '../components/decor/PatternBackdrop';
import OrnamentDivider from '../components/decor/OrnamentDivider';
import { useZikrStore } from '../../core/stores/zikrStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { useGoalStore } from '../../core/stores/goalStore';

import { useI18n } from '../../core/i18n';
import { getZikrDisplayInfoFromZikr } from '../utils/zikrMapping';
import { formatDate, getToday } from '../../core/utils/dateUtils';
import { calculateOverallStreak } from '../../core/utils/overallStreak';
import { todayTotal as metricsTodayTotal, goalRingProgress } from '../../core/utils/metrics';
import { Zikr } from '../../core/db/types';

/** Rotating hero phrases — one per day, rooted in dhikr itself (i18n keys). */
const DAILY_PHRASE_KEYS = [1, 2, 3, 4, 5];

const Home: React.FC = () => {
  const navigate = useNavigate();
  const navActions = useNavActions();
  const { lang, t } = useI18n();
  const phraseKey = useMemo(() => {
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const day = Math.floor((now.getTime() - startOfYear.getTime()) / 86400_000);
    return DAILY_PHRASE_KEYS[day % DAILY_PHRASE_KEYS.length];
  }, []);

  // Store integrations
  const zikrs = useZikrStore(state => state.zikrs);
  const zikrsLoading = useZikrStore(state => state.loading);
  const sessions = useSessionStore(state => state.sessions);
  const sessionsLoading = useSessionStore(state => state.loading);
  const goals = useGoalStore(state => state.goals);
  const getGoalZikrIds = useGoalStore(state => state.getGoalZikrIds);

  // Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Derived stats — pure functions from core/utils/metrics + overallStreak,
  // memoized directly off the stores (no effect/state round-trip, so the
  // numbers can never go stale mid-render).
  const streakDays = useMemo(
    () => calculateOverallStreak(sessions.map(s => s.date)),
    [sessions]
  );
  const todayTotal = useMemo(() => metricsTodayTotal(sessions), [sessions]);
  const dailyGoalProgress = useMemo(
    () => goalRingProgress(goals, sessions, getGoalZikrIds).percent,
    [goals, sessions, getGoalZikrIds]
  );

  // Quick Start rail: curated library zikrs (isQuickStarter) first — most
  // recently practiced first, then the rest of the starter set — followed by
  // any other zikrs (e.g. user-created) so new additions are usable here.
  const recentZikrs = useMemo<Zikr[]>(() => {
    if (zikrs.length === 0) return [];

    const pool = zikrs.filter(z => getZikrDisplayInfoFromZikr(z, lang).isQuickStarter);

    // Get zikr IDs from recent sessions (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentSessions = sessions
      .filter(s => s.timestamp >= sevenDaysAgo)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Get unique zikr IDs in order of most recent practice
    const recentZikrIds = [...new Set(recentSessions.map(s => s.zikrId))];

    // Map to zikr objects
    const recentZikrObjects = recentZikrIds
      .map(id => pool.find(z => z.id === id))
      .filter(Boolean) as typeof zikrs;

    // Add any remaining quick starters that haven't been practiced
    const practicedIds = new Set(recentZikrIds);
    const remainingZikrs = pool.filter(z => !practicedIds.has(z.id!));

    // Then the user's own zikrs (custom etc.) that aren't quick starters
    const poolIds = new Set(pool.map(z => z.id));
    const otherZikrs = zikrs.filter(z => !poolIds.has(z.id!));

    return [...recentZikrObjects, ...remainingZikrs, ...otherZikrs].slice(0, 20);
  }, [zikrs, sessions, lang]);

  const handleStartZikr = (zikrId: number) => {
    navigate(`/counter?zikrId=${zikrId}`);
  };

  // Loading state
  if (zikrsLoading || sessionsLoading) {
    return (
      <div className="min-h-screen bg-surface text-on-surface antialiased flex items-center justify-center">
        <div className="text-on-surface-variant">{t('common.loading')}</div>
      </div>
    );
  }

  // Empty state - no zikrs
  if (zikrs.length === 0) {
    return (
      <div className="min-h-screen bg-surface text-on-surface antialiased flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
        <PatternBackdrop className="absolute inset-0" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-20 h-24 rounded-t-full rounded-b-xl border border-tertiary-container/40 bg-surface-container-low flex items-center justify-center mb-6">
            <MaterialIcon icon="spa" className="text-5xl text-tertiary" />
          </div>
          <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary mb-2">
            {t('home.beginJourney')}
          </h2>
          <p className="font-body-md text-body-md text-on-surface-variant mb-6">
            {t('home.beginJourneyHint')}
          </p>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-primary-container text-on-primary rounded-xl h-touch-target-min px-8 font-label-md"
          >
            {t('home.createZikr')}
          </button>
        </div>
        <ZikrFormModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </div>
    );
  }

  return (
    <AppLayout
      topBar={{ brand: true, actions: navActions }}
      bottomNav
      contentClassName="pt-8 pb-8 px-container-padding-mobile gap-8 relative"
    >
        {/* Welcome & Streak Header */}
        <section className="relative flex flex-col items-center text-center gap-2">
          <PatternBackdrop className="absolute -inset-x-8 -top-8 h-48" />
          <p className="relative font-display-arabic text-[32px] leading-[48px] text-tertiary" lang="ar" dir="rtl">
            ٱلسَّلَامُ عَلَيْكُمْ
          </p>
          {streakDays > 0 && (
            <div className="relative inline-flex items-center gap-2 bg-tertiary-container/10 text-tertiary border border-tertiary-container/30 px-4 py-1.5 rounded-full font-label-md text-label-md">
              <MaterialIcon icon="local_fire_department" filled className="text-[20px]" />
              <span className="tabular-nums">{t('home.streak', { count: streakDays })}</span>
            </div>
          )}
          <h2 className="relative font-headline-lg-mobile text-headline-lg-mobile text-primary mt-2">
            {streakDays > 0 ? t('home.keepGoing') : t(`home.phrase${phraseKey}`)}
          </h2>
          <p className="relative font-body-md text-body-md text-on-surface-variant">
            {todayTotal > 0
              ? t('home.doneToday', { count: todayTotal })
              : t('home.beginPractice')
            }
          </p>
          {streakDays === 0 && t(`home.phrase${phraseKey}Source`) && (
            <p className="relative font-caption text-caption text-tertiary">
              — {t(`home.phrase${phraseKey}Source`)}
            </p>
          )}
        </section>

        {/* Daily Goal Progress — mihrab arch */}
        {goals.length > 0 && (
          <section className="relative w-full max-w-[300px] mx-auto flex flex-col items-center rounded-t-full rounded-b-2xl border border-tertiary-container/30 bg-surface-container-low shadow-card px-6 pt-20 pb-8 overflow-hidden">
            <PatternBackdrop className="absolute inset-0" variant="green" />
            <div className="relative flex flex-col items-center gap-5">
              <CircularProgress progress={dailyGoalProgress} size={192}>
                <div className="flex flex-col items-center justify-center text-center">
                  <MaterialIcon icon="spa" filled className="text-tertiary text-4xl mb-1" />
                  <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary tabular-nums">
                    {dailyGoalProgress}%
                  </span>
                  <span className="font-caption text-caption text-on-surface-variant mt-1">
                    {t('home.dailyGoal')}
                  </span>
                </div>
              </CircularProgress>
              <OrnamentDivider className="w-32" />
            </div>
          </section>
        )}

        {/* Quick Start Dhikr List */}
        {recentZikrs.length > 0 && (
          <section className="flex flex-col gap-4 -mx-container-padding-mobile px-container-padding-mobile">
            <h3 className="font-headline-md text-headline-md text-primary">{t('home.quickStart')}</h3>
            <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 hide-scrollbar">
              {recentZikrs.map((zikr) => {
                const displayInfo = getZikrDisplayInfoFromZikr(zikr, lang);
                // Check if practiced today
                const practicedToday = sessions.some(
                  s => s.zikrId === zikr.id && formatDate(s.date) === formatDate(getToday())
                );

                return (
                  <ZikrCard
                    key={zikr.id}
                    id={zikr.id!}
                    name={displayInfo.localizedName}
                    arabicName={displayInfo.arabicText}
                    translation={displayInfo.translation}
                    targetCount={displayInfo.defaultTarget}
                    icon={practicedToday ? 'check_circle' : 'play_arrow'}
                    onStart={handleStartZikr}
                    completed={practicedToday}
                  />
                );
              })}
              {/* Spacer for scrolling bleed */}
              <div className="shrink-0 w-4" />
            </div>
          </section>
        )}

        {/* Add Zikr CTA — always available once the user has zikrs (the
            empty state above has its own CTA). The rail may already show
            every zikr, but this remains the entry point to add more. */}
        {recentZikrs.length > 0 && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="w-full bg-surface-container-low border border-outline-variant/30 rounded-xl h-touch-target-min flex items-center justify-center gap-2 font-label-md text-label-md text-primary hover:bg-surface-container transition-colors"
          >
            <MaterialIcon icon="add" className="text-[20px]" />
            {t('home.addMore')}
          </button>
        )}
      {/* Create Zikr Modal */}
      <ZikrFormModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </AppLayout>
  );
};

export default Home;
