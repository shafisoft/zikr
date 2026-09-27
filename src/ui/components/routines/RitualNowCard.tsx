/**
 * RitualNowCard — the one Home "current ritual" card (Feature C): the
 * routine whose civil window matches NOW (or the next one upcoming), with
 * its today progress ("3/9") and a Start hand-off into the counter flow.
 * Presentational only — every value arrives via props, taps bubble up as
 * callbacks. When the routine is done-today the card renders its compact
 * done state instead of vanishing (reinforcement matters for habit).
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import PatternBackdrop from '../decor/PatternBackdrop';
import { useI18n } from '../../../core/i18n';

interface RitualNowCardProps {
  title: string;
  /**
   * Upcoming window label, already localized by the container (e.g.
   * "সন্ধ্যায়" / "This evening"); shown in place of the Now chip when
   * `isNext`.
   */
  timeLabel?: string;
  /** Upcoming (window opens later) vs the current moment. */
  isNext?: boolean;
  /** Compact done state — the card stays visible, minus the Start button. */
  doneToday?: boolean;
  /** Items fully completed today. */
  doneCount: number;
  /** Total items. */
  total: number;
  onStart: () => void;
}

const RitualNowCard: React.FC<RitualNowCardProps> = ({
  title,
  timeLabel,
  isNext = false,
  doneToday = false,
  doneCount,
  total,
  onStart,
}) => {
  const { t } = useI18n();

  const chipLabel = isNext && timeLabel ? timeLabel : t('routine.now.now');
  const progressLabel = `${doneCount}/${total}`;

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-tertiary-container/30 bg-surface-container-low shadow-card">
      <PatternBackdrop className="absolute inset-0" variant="green" />
      <div className="relative flex items-center gap-2 pl-4 pr-2 py-3">
        <button
          type="button"
          onClick={onStart}
          className="flex-1 min-w-0 text-left active:scale-[0.99] transition-all"
          aria-label={t('routine.startAria', { name: title })}
        >
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-caption text-caption ${
                isNext
                  ? 'border border-outline-variant/40 text-on-surface-variant'
                  : 'bg-tertiary-container/25 text-tertiary'
              }`}
            >
              {isNext ? (
                <MaterialIcon icon="schedule" className="text-[14px]" />
              ) : (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-tertiary" />
                </span>
              )}
              {chipLabel}
            </span>
            {!doneToday && (
              <span className="font-caption text-caption text-on-surface-variant tabular-nums">
                {progressLabel}
              </span>
            )}
          </div>
          <p className="mt-0.5 font-label-md text-label-md text-on-surface truncate">
            {title}
          </p>
          {doneToday && (
            <span className="mt-0.5 flex items-center gap-1 font-caption text-caption text-tertiary">
              <MaterialIcon icon="check_circle" filled className="text-[16px]" />
              {t('routine.doneToday')}
            </span>
          )}
        </button>
        {!doneToday && (
          <button
            type="button"
            onClick={onStart}
            className="shrink-0 h-touch-target-min px-4 bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center gap-1.5 hover:opacity-90 active:scale-[0.98] transition-all"
            aria-label={t('routine.startAria', { name: title })}
          >
            {t('routine.now.start')}
            <MaterialIcon icon="play_arrow" className="text-[20px]" />
          </button>
        )}
      </div>
    </div>
  );
};

export default RitualNowCard;
