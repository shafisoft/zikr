/**
 * AfterSalahTracker — the day view of the after-salah practice (R1):
 * five salah chips showing which prayers' sets are done, which window is
 * live, and which passed. Presentational only — labels and states arrive
 * via props; the live chip's tap bubbles up as onStart (the leading
 * PostSalahCard remains the moment's primary surface).
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import PatternBackdrop from '../decor/PatternBackdrop';
import { useI18n } from '../../../core/i18n';
import type { PrayerName } from '../../../core/utils/prayerTimes';

export type AfterSalahSlotState = 'done' | 'active' | 'missed' | 'upcoming';

export interface AfterSalahSlotView {
  prayer: PrayerName;
  /** Localized prayer name. */
  label: string;
  state: AfterSalahSlotState;
  /** Only the live slot is tappable (start that prayer's set). */
  onPress?: () => void;
}

interface AfterSalahTrackerProps {
  slots: AfterSalahSlotView[];
  /** Localized "X of Y complete" line. */
  progressLine: string;
}

const SLOT_ICON: Record<AfterSalahSlotState, { icon: string; filled: boolean }> = {
  done: { icon: 'check_circle', filled: true },
  active: { icon: 'radio_button_checked', filled: true },
  missed: { icon: 'radio_button_unchecked', filled: false },
  upcoming: { icon: 'radio_button_unchecked', filled: false },
};

const AfterSalahTracker: React.FC<AfterSalahTrackerProps> = ({ slots, progressLine }) => {
  const { t } = useI18n();

  return (
    <section
      className="relative w-full overflow-hidden rounded-xl border border-tertiary-container/30 bg-surface-container-low shadow-card"
      aria-label={t('postSalah.tracker.title')}
    >
      <PatternBackdrop className="absolute inset-0" variant="green" />
      <div className="relative flex flex-col gap-3 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5 font-label-md text-label-md text-primary">
            <MaterialIcon icon="mosque" className="text-[18px] text-tertiary" />
            {t('postSalah.tracker.title')}
          </span>
          <span className="font-caption text-caption text-on-surface-variant tabular-nums">
            {progressLine}
          </span>
        </div>
        <div className="flex items-stretch justify-between gap-1.5">
          {slots.map(slot => {
            const stateLabel = t(`postSalah.tracker.state.${slot.state}`);
            const { icon, filled } = SLOT_ICON[slot.state];
            const live = slot.state === 'active' && slot.onPress != null;
            const chip = (
              <>
                <MaterialIcon
                  icon={icon}
                  filled={filled}
                  className={`text-[18px] ${
                    slot.state === 'done'
                      ? 'text-tertiary'
                      : slot.state === 'active'
                        ? 'text-tertiary'
                        : 'text-on-surface-variant/50'
                  }`}
                />
                <span
                  className={`font-caption text-caption ${
                    slot.state === 'active' ? 'text-primary font-medium' : 'text-on-surface-variant/80'
                  }`}
                >
                  {slot.label}
                </span>
              </>
            );
            const tone =
              slot.state === 'active'
                ? 'bg-tertiary-container/25 border-tertiary-container/60'
                : 'border-outline-variant/20';
            return live ? (
              <button
                key={slot.prayer}
                type="button"
                onClick={slot.onPress}
                className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 active:scale-[0.97] transition-all ${tone}`}
                aria-label={t('postSalah.tracker.startAria', { prayer: slot.label })}
              >
                {chip}
              </button>
            ) : (
              <div
                key={slot.prayer}
                className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 rounded-xl border px-1 py-2 ${tone}`}
                aria-label={`${slot.label} — ${stateLabel}`}
              >
                {chip}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default AfterSalahTracker;
