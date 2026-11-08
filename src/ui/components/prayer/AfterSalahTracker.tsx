/**
 * AfterSalahTracker — the day view of the after-salah practice (R1),
 * rendered as the Home prayer rail: five salah rows down the day, each
 * anchored on its dot — a gold check once a prayer's set is complete, a
 * ring filling in proportion while it is partly done — with the CURRENT
 * prayer highlighted (the offer rides its row) and passed prayers kept
 * quietly tappable. Presentational only — labels, states, times and
 * progress arrive via props; taps bubble up as onPress (the current
 * prayer's row starts the set; a past prayer's row asks to mark an
 * offline completion). A past, not-done prayer is never labeled "missed"
 * — the offer moved on silently, and whatever progress it had stays on
 * its ring.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import PatternBackdrop from '../decor/PatternBackdrop';
import SalahProgressRing from './SalahProgressRing';
import { useI18n } from '../../../core/i18n';
import type { PrayerName } from '../../../core/utils/prayerTimes';

export type AfterSalahSlotState = 'done' | 'active' | 'past' | 'upcoming';

export interface AfterSalahSlotView {
  prayer: PrayerName;
  /** Localized prayer name. */
  label: string;
  /** Localized clock time of the prayer — the rail row's subtitle. */
  timeLabel?: string;
  state: AfterSalahSlotState;
  /** 0..1 reached fraction of this prayer's set (1 ⇔ state 'done'). */
  progress: number;
  /**
   * Tap action: the CURRENT prayer starts its set; a PAST prayer opens
   * the offline mark-done ask. Done and upcoming rows are not tappable.
   */
  onPress?: () => void;
}

interface AfterSalahTrackerProps {
  slots: AfterSalahSlotView[];
  /** Localized "X of Y complete" line. */
  progressLine: string;
}

/** Any progress reads in the gold accent; an untouched row takes its state's tone. */
function glyphTone(slot: AfterSalahSlotView): string {
  if (slot.state === 'done' || slot.state === 'active') return 'text-tertiary';
  if (slot.progress > 0) return 'text-tertiary/80';
  return slot.state === 'past' ? 'text-on-surface-variant' : 'text-on-surface-variant/50';
}

const AfterSalahTracker: React.FC<AfterSalahTrackerProps> = ({ slots, progressLine }) => {
  const { t } = useI18n();

  return (
    <section
      className="relative w-full overflow-hidden rounded-xl border border-tertiary-container/30 bg-surface-container-low shadow-card"
      aria-label={t('postSalah.tracker.title')}
    >
      <PatternBackdrop className="absolute inset-0" variant="green" />
      <div className="relative flex flex-col gap-2 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 font-label-md text-label-md text-primary">
            <MaterialIcon icon="mosque" className="text-[18px] text-tertiary" />
            {t('postSalah.tracker.title')}
          </span>
          <span className="font-caption text-caption text-on-surface-variant tabular-nums">
            {progressLine}
          </span>
        </div>
        <ol className="flex flex-col">
          {slots.map((slot, index) => {
            const stateLabel = t(`postSalah.tracker.state.${slot.state}`);
            const tappable = slot.onPress != null && (slot.state === 'active' || slot.state === 'past');
            const glyph = glyphTone(slot);
            const last = index === slots.length - 1;
            // The row itself carries the state tone: the live prayer glows
            // gold; a passed prayer reads as "action available" on a dashed
            // hairline — never red, never "missed".
            const rowTone =
              slot.state === 'active'
                ? 'bg-tertiary-container/25'
                : slot.state === 'past'
                  ? 'border border-dashed border-on-surface-variant/40'
                  : '';
            const dotTone =
              slot.state === 'done'
                ? 'bg-tertiary-container/30'
                : slot.state === 'active'
                  ? 'border border-tertiary-container/60 bg-tertiary-container/25'
                  : slot.state === 'past'
                    ? 'border border-dashed border-on-surface-variant/40'
                    : 'border border-outline-variant/20';
            const labelTone =
              slot.state === 'active'
                ? 'text-primary font-medium'
                : slot.state === 'past'
                  ? 'text-on-surface'
                  : slot.state === 'upcoming'
                    ? 'text-on-surface-variant/70'
                    : 'text-on-surface';
            const content = (
              <>
                <span
                  className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${dotTone}`}
                >
                  {slot.state === 'done' ? (
                    <span className="flex" data-slot-progress="done">
                      <MaterialIcon icon="check_circle" filled className={`text-[20px] ${glyph}`} />
                    </span>
                  ) : (
                    <SalahProgressRing progress={slot.progress} className={glyph} />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate font-label-md text-label-md ${labelTone}`}>
                    {slot.label}
                  </span>
                  {slot.timeLabel && (
                    <span className="block font-caption text-caption text-on-surface-variant/60 tabular-nums">
                      {slot.timeLabel}
                    </span>
                  )}
                </span>
                {tappable && (
                  <MaterialIcon
                    icon={slot.state === 'active' ? 'play_arrow' : 'task_alt'}
                    className="text-[20px] text-on-surface-variant/70"
                  />
                )}
              </>
            );
            const rowLabel =
              slot.state === 'active' && tappable
                ? t('postSalah.tracker.startAria', { prayer: slot.label })
                : slot.state === 'past' && tappable
                  ? t('postSalah.tracker.markAria', { prayer: slot.label })
                  : `${slot.label} — ${stateLabel}`;
            return (
              <li key={slot.prayer} className="relative">
                {!last && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[21px] top-[30px] bottom-[-10px] w-0.5 rounded bg-outline-variant/40"
                  />
                )}
                {tappable ? (
                  <button
                    type="button"
                    onClick={slot.onPress}
                    aria-label={rowLabel}
                    className={`relative flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:scale-[0.99] transition-all ${rowTone}`}
                  >
                    {content}
                  </button>
                ) : (
                  <div
                    aria-label={rowLabel}
                    className={`relative flex w-full items-center gap-3 rounded-xl px-2 py-2 ${rowTone}`}
                  >
                    {content}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

export default AfterSalahTracker;
