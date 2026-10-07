/**
 * RoutineRow — one glance row of the Home routines section (§16.3): name,
 * today's position ("3 of 6" — also the aria-live announcement, AC §5.3),
 * the done check, and the gentle missing-zikr state (§5.2). Presentational
 * only: every value arrives via props, taps bubble up as callbacks.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';

interface RoutineRowProps {
  title: string;
  /** 1-based position of the first incomplete item (total when done). */
  current: number;
  total: number;
  done: boolean;
  /** Items whose zikr was soft-deleted — greys the row with a gentle suffix. */
  missingCount: number;
  /** The routine's own daily streak (shown as quiet subtext when > 0). */
  streak: number;
  /**
   * Upcoming-window label (already localized + timed, e.g. "This evening ·
   * 15:00") — shown as the leading subtext on an Up-next row.
   */
  nextLabel?: string;
  onPress: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

const RoutineRow: React.FC<RoutineRowProps> = ({
  title,
  current,
  total,
  done,
  missingCount,
  streak,
  nextLabel,
  onPress,
  onEdit,
  onDelete,
}) => {
  const { t } = useI18n();
  const missing = missingCount > 0;

  // "3 of 6" is the screen-reader announcement (AC §5.3); done reads as done.
  // A missing-zikr row keeps the position and carries the gentle suffix in
  // the subtext below.
  const stateLine = done
    ? t('routine.doneToday')
    : t('routine.position', { current, total });

  return (
    <div
      className={`w-full flex items-center gap-1 bg-surface-container-low border border-outline-variant/20 rounded-xl pl-4 pr-2 py-3 ${
        missing ? 'opacity-70' : ''
      }`}
    >
      <button
        type="button"
        onClick={onPress}
        className="flex-1 min-w-0 text-left active:scale-[0.99] transition-all"
        aria-label={t('routine.startAria', { name: title })}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="font-label-md text-label-md text-on-surface truncate">
            {title}
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            {done ? (
              <span className="flex items-center gap-1 font-caption text-caption text-tertiary">
                <MaterialIcon icon="check_circle" filled className="text-[18px]" />
                {t('routine.doneToday')}
              </span>
            ) : (
              <span
                className="font-caption text-caption text-on-surface-variant tabular-nums"
                aria-live="polite"
              >
                {stateLine}
              </span>
            )}
            <MaterialIcon icon="play_arrow" className="text-[20px] text-tertiary" />
          </span>
        </div>
        {(nextLabel || streak > 0 || missing) && (
          <div className="mt-0.5 flex items-center gap-2 font-caption text-caption text-on-surface-variant/80">
            {nextLabel && (
              <span className="flex items-center gap-1">
                <MaterialIcon icon="schedule" className="text-[14px]" />
                {nextLabel}
              </span>
            )}
            {streak > 0 && (
              <span className="flex items-center gap-1">
                <MaterialIcon icon="local_fire_department" filled className="text-[14px] text-tertiary" />
                {t('routine.streak', { count: streak })}
              </span>
            )}
            {missing && <span>{t('routine.missingSuffix')}</span>}
          </div>
        )}
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="p-2 rounded-full text-on-surface-variant hover:bg-surface-variant/50 transition-colors shrink-0"
          aria-label={t('routine.editor.editTitle')}
        >
          <MaterialIcon icon="tune" className="text-[18px]" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="p-2 rounded-full text-on-surface-variant hover:bg-surface-variant/50 transition-colors shrink-0"
          aria-label={t('routine.deleteAria')}
        >
          <MaterialIcon icon="delete" className="text-[18px]" />
        </button>
      )}
    </div>
  );
};

export default RoutineRow;
