/**
 * StreakArch — the Progress mihrab (Noor 2.0 phase 3): the streak lives
 * inside an arch whose inner gold glow grows with it (full at 40 days,
 * a practice milestone, then it simply holds); the "never miss twice"
 * grace shows as a held line, never as red guilt; a 30-day dot strip
 * tells the same story the badge does (the states come from the same
 * walk — practiceDayStates); and the lifetime total sits in gold at the
 * arch's foot. Presentational only — numbers, modes, and day states
 * arrive via props.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import PatternBackdrop from '../decor/PatternBackdrop';
import { useI18n } from '../../../core/i18n';
import type { StreakStatus, PracticeDay } from '../../../core/utils/overallStreak';

/** The glow arc reads "full" at this streak length, then holds. */
const GLOW_FULL_AT_DAYS = 40;

interface StreakArchProps {
  streak: StreakStatus;
  /** 30 days, oldest → today (practiceDayStates). */
  days: PracticeDay[];
  lifetimeTotal: number;
  /** False while there is no history at all — a new user's strip stays blank. */
  showDots: boolean;
}

const DOT_TONE: Record<PracticeDay['state'], string> = {
  done: 'bg-primary-container',
  grace: 'border-2 border-tertiary',
  missed: 'bg-surface-container-high',
  pending: 'border-2 border-outline-variant/50',
};

const StreakArch: React.FC<StreakArchProps> = ({ streak, days, lifetimeTotal, showDots }) => {
  const { t } = useI18n();

  const glow = Math.min(100, Math.round((streak.value / GLOW_FULL_AT_DAYS) * 100));
  const framed = streak.mode !== 'normal';

  const done = days.filter(d => d.state === 'done').length;
  const grace = days.filter(d => d.state === 'grace').length;
  const missed = days.filter(d => d.state === 'missed').length;

  const modeLine =
    streak.mode === 'grace'
      ? { icon: 'bedtime', text: t('grace.resumeLine') }
      : streak.mode === 'fresh-break'
        ? { icon: 'spa', text: t('grace.freshStart') }
        : null;

  return (
    <section
      aria-label={t('progress.streakLabel')}
      className="relative w-full max-w-[320px] mx-auto flex flex-col items-center rounded-t-full rounded-b-2xl border border-tertiary-container/30 bg-surface-container-low shadow-card px-6 pt-12 pb-6 overflow-hidden"
    >
      <PatternBackdrop className="absolute inset-0" variant="green" />
      <div className="relative flex w-full flex-col items-center">
        {/* The glow arc — grows with the streak, holds at the milestone */}
        <svg
          viewBox="0 0 200 118"
          className="w-[212px] max-w-full"
          role="img"
          aria-label={t('progress.streakDays', { count: streak.value })}
        >
          <path
            d="M20 110 A80 80 0 0 1 180 110"
            pathLength={100}
            fill="none"
            className="stroke-surface-container-high"
            strokeWidth={10}
            strokeLinecap="round"
          />
          <path
            d="M20 110 A80 80 0 0 1 180 110"
            pathLength={100}
            fill="none"
            strokeDasharray={`${glow} ${100 - glow}`}
            className="stroke-tertiary transition-all duration-700 ease-out"
            strokeWidth={10}
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 6px rgba(201,162,39,.55))' }}
          />
        </svg>

        <div className="flex flex-col items-center -mt-9">
          <MaterialIcon icon="local_fire_department" filled className="text-tertiary text-[22px]" />
          <span className="font-headline-lg-mobile text-headline-lg-mobile text-primary tabular-nums">
            {streak.value}
          </span>
          <span className="font-caption text-caption text-on-surface-variant">
            {streak.value === 1
              ? t('progress.streakDay', { count: streak.value })
              : t('progress.streakDays', { count: streak.value })}
          </span>
          {modeLine && (
            <p className="mt-1.5 flex items-center gap-1.5 font-caption text-caption text-on-surface-variant">
              <MaterialIcon icon={modeLine.icon} className="text-[14px] text-tertiary" />
              {modeLine.text}
            </p>
          )}
          {!framed && streak.value === 0 && (
            <p className="mt-1.5 font-caption text-caption text-on-surface-variant">
              {t('progress.streakLabel')}
            </p>
          )}
        </div>

        {/* 30-day strip — the badge's story, day by day */}
        {showDots && (
          <>
            <div
              className="mt-5 flex flex-wrap justify-center gap-[5px] px-2"
              role="img"
              aria-label={t('progress.dotsAria', { done, grace, missed })}
            >
              {days.map(day => (
                <span
                  key={day.date}
                  data-state={day.state}
                  className={`h-[11px] w-[11px] rounded-[3.5px] ${DOT_TONE[day.state]}`}
                />
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3 font-caption text-caption text-on-surface-variant/70">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2.5px] bg-primary-container" />
                {t('progress.dots.legendDone')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2.5px] border-2 border-tertiary" />
                {t('progress.dots.legendGrace')}
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-[2.5px] bg-surface-container-high" />
                {t('progress.dots.legendMissed')}
              </span>
            </div>
          </>
        )}

        {/* Lifetime total in gold at the arch's foot */}
        <div className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-tertiary-container/10 py-2.5 text-tertiary">
          <MaterialIcon icon="all_inclusive" className="text-[15px]" />
          <span className="font-label-md text-label-md tabular-nums font-semibold">
            {lifetimeTotal.toLocaleString()}
          </span>
          <span className="font-caption text-caption">{t('progress.totalLabel')}</span>
        </div>
      </div>
    </section>
  );
};

export default StreakArch;
