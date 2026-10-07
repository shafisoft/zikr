/**
 * QuietPresetOfferRow — the single quiet, dismissible discoverability
 * affordance shown when the user has no routines (AC2.4.2). Never a modal,
 * never a tour: one row, two one-tap presets, one dismiss. Presentational
 * only — visibility and persistence live in RoutinesSectionContainer.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';
import type { RoutinePresetKey } from '../../../core/stores/routineStore';

interface QuietPresetOfferRowProps {
  onPreset: (key: RoutinePresetKey) => void;
  onDismiss: () => void;
}

const QuietPresetOfferRow: React.FC<QuietPresetOfferRowProps> = ({ onPreset, onDismiss }) => {
  const { t } = useI18n();

  return (
    <div className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-label-md text-label-md text-on-surface">
            {t('routine.offer.title')}
          </p>
          <p className="font-caption text-caption text-on-surface-variant mt-0.5">
            {t('routine.offer.body')}
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-2 -mr-1 rounded-full text-on-surface-variant hover:bg-surface-variant/50 transition-colors shrink-0"
          aria-label={t('routine.offer.dismiss')}
        >
          <MaterialIcon icon="close" className="text-[18px]" />
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => onPreset('morning')}
          className="flex-1 h-touch-target-min bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <MaterialIcon icon="wb_twilight" className="text-[20px]" />
          {t('routine.preset.morning')}
        </button>
        <button
          type="button"
          onClick={() => onPreset('evening')}
          className="flex-1 h-touch-target-min rounded-xl border border-outline-variant/40 text-on-surface font-label-md text-label-md flex items-center justify-center gap-2 hover:bg-surface-variant/40 active:scale-[0.98] transition-all"
        >
          <MaterialIcon icon="nightlight" className="text-[20px]" />
          {t('routine.preset.evening')}
        </button>
      </div>
    </div>
  );
};

export default QuietPresetOfferRow;
