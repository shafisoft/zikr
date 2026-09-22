/**
 * Goal Row Card — one countable zikr row for "Your Goals"-style surfaces:
 * name (with an optional group subtitle), current / target, a fill bar,
 * and a tap action that opens the counter on it.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { GoalZikrRow } from '../../../core/utils/planUtils';
import { progressPercent } from '../../../core/utils/sharedRoomUtils';
import { useI18n } from '../../../core/i18n';

const GoalRowCard: React.FC<{
  row: GoalZikrRow;
  onPress: (row: GoalZikrRow) => void;
}> = ({ row, onPress }) => {
  const { t } = useI18n();
  const percent = progressPercent(row.current, row.target);

  return (
    <button
      type="button"
      onClick={() => onPress(row)}
      className="
        w-full text-left bg-surface-container-low border border-outline-variant/20
        rounded-xl px-4 py-3 active:scale-[0.99] transition-all hover:bg-surface-container
      "
      aria-label={t('plans.startAria', { name: row.title })}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-label-md text-label-md text-on-surface truncate">
          {row.title}
          {row.subtitle && (
            <span className="font-caption text-caption text-on-surface-variant ml-2">
              · {row.subtitle}
            </span>
          )}
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="font-caption text-caption text-on-surface-variant tabular-nums">
            {row.current.toLocaleString()} / {row.target.toLocaleString()}
          </span>
          <MaterialIcon icon="play_arrow" className="text-[20px] text-tertiary" />
        </span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            percent >= 100 ? 'bg-primary' : 'bg-tertiary-container'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </button>
  );
};

export default GoalRowCard;
