/**
 * PrayerLocationRow — the saved prayer-time location display (§16.2):
 * label + edit; clearing removes the feature entirely (§6). Presentational.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';

interface PrayerLocationRowProps {
  label: string;
  onEdit: () => void;
  onClear: () => void;
}

const PrayerLocationRow: React.FC<PrayerLocationRowProps> = ({
  label,
  onEdit,
  onClear,
}) => {
  const { t } = useI18n();

  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-4 min-w-0">
        <div className="bg-surface-container-high p-2 rounded-lg shrink-0">
          <MaterialIcon icon="location_on" className="text-primary text-[20px]" />
        </div>
        <div className="min-w-0">
          <p className="font-body-md text-body-md text-on-surface">
            {t('settings.prayerLocationRow')}
          </p>
          <p className="font-caption text-caption text-on-surface-variant truncate">
            {label}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onEdit}
          className="text-primary p-2 hover:bg-primary-container/20 rounded-lg transition-colors"
          aria-label={t('settings.prayerLocationEdit')}
        >
          <MaterialIcon icon="edit" className="text-[20px]" />
        </button>
        <button
          type="button"
          onClick={onClear}
          className="text-error p-2 hover:bg-error/10 rounded-lg transition-colors"
          aria-label={t('settings.prayerLocationRemove')}
        >
          <MaterialIcon icon="delete_outline" className="text-[20px]" />
        </button>
      </div>
    </div>
  );
};

export default PrayerLocationRow;
