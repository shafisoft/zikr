/**
 * PlanChip — one plan's progress pill in the Home hero's plan rail
 * (Noor 2.0 phase 1): title + rounded percent with a hairline bar, a
 * groups glyph on server-mirrored group plans. Presentational only —
 * the chip opens Plans via onPress.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';
import type { PlanChipRow } from '../../../core/utils/planUtils';

interface PlanChipProps {
  chip: PlanChipRow;
  onPress: () => void;
}

const PlanChip: React.FC<PlanChipProps> = ({ chip, onPress }) => {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={t('home.hero.chipAria', { name: chip.title })}
      className="flex min-w-[9.5rem] shrink-0 flex-col gap-1.5 rounded-xl border border-outline-variant/20 bg-surface-container-lowest px-3.5 py-2.5 text-left active:scale-[0.98] transition-all hover:bg-surface-container"
    >
      <span className="flex items-center gap-1 font-caption text-caption text-on-surface-variant">
        {chip.group && <MaterialIcon icon="groups" className="shrink-0 text-[14px] text-tertiary" />}
        <span className="truncate">{chip.title}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="font-label-md text-label-md text-primary tabular-nums">{chip.percent}%</span>
        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-container-high">
          <span
            className={`block h-full rounded-full ${chip.percent >= 100 ? 'bg-primary' : 'bg-tertiary-container'}`}
            style={{ width: `${chip.percent}%` }}
          />
        </span>
      </span>
    </button>
  );
};

export default PlanChip;
