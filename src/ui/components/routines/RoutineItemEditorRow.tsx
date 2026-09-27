/**
 * RoutineItemEditorRow — one ordered item of the routine editor form
 * (§16.3). Ordered-row interaction follows GroupPlanBuilder's pattern;
 * Arabic text always renders lang="ar" dir="rtl" (§12). Presentational.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';

interface RoutineItemEditorRowProps {
  name: string;
  arabicText?: string;
  count: number;
  onCountChange: (count: number) => void;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
  /** First/last rows hide the impossible move. */
  canMoveUp: boolean;
  canMoveDown: boolean;
}

const RoutineItemEditorRow: React.FC<RoutineItemEditorRowProps> = ({
  name,
  arabicText,
  count,
  onCountChange,
  onRemove,
  onMove,
  canMoveUp,
  canMoveDown,
}) => {
  const { t } = useI18n();

  return (
    <div className="bg-surface-container-low border border-outline-variant/20 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-label-md text-label-md text-on-surface truncate">{name}</p>
          {arabicText && (
            <p
              className="font-display-arabic text-body-md text-on-surface-variant truncate"
              lang="ar"
              dir="rtl"
            >
              {arabicText}
            </p>
          )}
        </div>
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={!canMoveUp}
            className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant/50 transition-colors disabled:opacity-30 disabled:cursor-default"
            aria-label={t('routine.editor.moveUpAria')}
          >
            <MaterialIcon icon="keyboard_arrow_up" className="text-[20px]" />
          </button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={!canMoveDown}
            className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant/50 transition-colors disabled:opacity-30 disabled:cursor-default"
            aria-label={t('routine.editor.moveDownAria')}
          >
            <MaterialIcon icon="keyboard_arrow_down" className="text-[20px]" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1.5 rounded-full text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
            aria-label={t('routine.editor.removeItemAria')}
          >
            <MaterialIcon icon="close" className="text-[20px]" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <label className="font-caption text-caption text-on-surface-variant">
          {t('routine.editor.countLabel')}
        </label>
        <input
          type="number"
          min={1}
          max={100000}
          value={count}
          onChange={(e) => onCountChange(Number(e.target.value))}
          className="w-24 h-9 px-3 rounded-lg bg-surface border border-outline-variant/40 text-body-md text-on-surface tabular-nums focus:outline-none focus:border-tertiary"
          aria-label={`${t('routine.editor.countLabel')} — ${name}`}
        />
      </div>
    </div>
  );
};

export default RoutineItemEditorRow;
