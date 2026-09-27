/**
 * PrayerMethodChoosers — the calculation method + Asr madhab choosers
 * (§4.2/§6; defaults Karachi/Shafi). Lives behind the feature's explicit
 * opt-in, so it does not violate P1; parameter objects, not code paths.
 * Presentational.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';
import type {
  PrayerCalculationMethod,
  PrayerMadhab,
} from '../../../core/db/types';

const METHODS: readonly PrayerCalculationMethod[] = [
  'Karachi',
  'MuslimWorldLeague',
  'Egyptian',
  'UmmAlQura',
  'MoonsightingCommittee',
  'NorthAmerica',
];

const MADHABS: readonly PrayerMadhab[] = ['Shafi', 'Hanafi'];

interface PrayerMethodChoosersProps {
  method: PrayerCalculationMethod;
  madhab: PrayerMadhab;
  onMethodChange: (m: PrayerCalculationMethod) => void;
  onMadhabChange: (m: PrayerMadhab) => void;
}

const PrayerMethodChoosers: React.FC<PrayerMethodChoosersProps> = ({
  method,
  madhab,
  onMethodChange,
  onMadhabChange,
}) => {
  const { t } = useI18n();

  const pill = (active: boolean) =>
    `px-3 py-2 rounded-lg font-label-md text-label-md transition-all ${
      active ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:bg-surface-variant/50'
    }`;

  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="bg-surface-container-high p-2 rounded-lg shrink-0">
          <MaterialIcon icon="calculate" className="text-primary text-[20px]" />
        </div>
        <div className="min-w-0">
          <p className="font-body-md text-body-md text-on-surface">
            {t('settings.prayerMethod')}
          </p>
          <div className="flex flex-wrap gap-1 mt-2 bg-surface-container-lowest p-1 rounded-xl">
            {METHODS.map(m => (
              <button
                key={m}
                type="button"
                onClick={() => onMethodChange(m)}
                aria-pressed={method === m}
                className={pill(method === m)}
              >
                {t(`postSalah.method.${m}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="font-body-md text-body-md text-on-surface">
          {t('settings.prayerMadhab')}
        </p>
        <div className="flex gap-1 bg-surface-container-lowest p-1 rounded-xl shrink-0">
          {MADHABS.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => onMadhabChange(m)}
              aria-pressed={madhab === m}
              className={pill(madhab === m)}
            >
              {t(`postSalah.madhab.${m}`)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PrayerMethodChoosers;
