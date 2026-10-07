/**
 * LocationSetupForm — the R1 location setup (§16.2/§4.3): offline city
 * search over the bundled list, raw coordinates, and the optional
 * one-shot device-fix affordance (callback only — the container owns the
 * geolocation call), all converging on ONE manual confirm step: the user
 * always sees label/coords before saving, so the save is a deliberate
 * act. Presentational.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';
import type { PrayerCity } from '../../../core/data/prayerCities';

/** The one-shot device fix's visible states. */
export type DeviceFixState = 'idle' | 'locating' | 'failed';

export interface LocationDraft {
  label: string;
  lat: number;
  lon: number;
}

interface LocationSetupFormProps {
  query: string;
  results: PrayerCity[];
  onQueryChange: (q: string) => void;
  onSelectCity: (city: PrayerCity) => void;
  /** The two raw-coordinate fields (string drafts; the container parses). */
  coords: { lat: string; lon: string };
  onCoordsChange: (lat: string, lon: string) => void;
  deviceFixState: DeviceFixState;
  onRequestDeviceFix: () => void;
  /** The pending choice awaiting the one manual confirm; null = none yet. */
  draft: LocationDraft | null;
  onConfirmSave: () => void;
  /** Present when editing an existing location (back out to the row). */
  onCancel?: () => void;
}

const LocationSetupForm: React.FC<LocationSetupFormProps> = ({
  query,
  results,
  onQueryChange,
  onSelectCity,
  coords,
  onCoordsChange,
  deviceFixState,
  onRequestDeviceFix,
  draft,
  onConfirmSave,
  onCancel,
}) => {
  const { t } = useI18n();
  const deviceFixSupported =
    typeof navigator !== 'undefined' && 'geolocation' in navigator;

  return (
    <div className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex flex-col gap-4">
      <p className="font-body-md text-body-md text-on-surface flex items-center gap-3">
        <span className="bg-surface-container-high p-2 rounded-lg">
          <MaterialIcon icon="location_on" className="text-primary text-[20px]" />
        </span>
        {t('settings.prayerTimesSetupTitle')}
      </p>

      {/* Offline city search (path 1) */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="prayer-city-search"
          className="font-caption text-caption text-on-surface-variant"
        >
          {t('settings.prayerSearchLabel')}
        </label>
        <input
          id="prayer-city-search"
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder={t('settings.prayerSearchPlaceholder')}
          className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl h-touch-target-min px-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
        />
        {results.length > 0 && (
          <ul className="flex flex-col gap-1 max-h-56 overflow-y-auto">
            {results.map(city => (
              <li key={city.id}>
                <button
                  type="button"
                  onClick={() => onSelectCity(city)}
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface-container-high transition-colors flex items-center justify-between gap-2"
                >
                  <span className="font-body-md text-body-md text-on-surface truncate">
                    {city.name}
                  </span>
                  <span className="font-caption text-caption text-on-surface-variant shrink-0">
                    {city.nameBn}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Raw coordinates (path 2) */}
      <div className="flex flex-col gap-2">
        <p className="font-caption text-caption text-on-surface-variant">
          {t('settings.prayerCoordsLabel')}
        </p>
        <div className="flex gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={coords.lat}
            onChange={e => onCoordsChange(e.target.value, coords.lon)}
            placeholder={t('settings.prayerLatitude')}
            aria-label={t('settings.prayerLatitude')}
            className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl h-touch-target-min px-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
          <input
            type="text"
            inputMode="decimal"
            value={coords.lon}
            onChange={e => onCoordsChange(coords.lat, e.target.value)}
            placeholder={t('settings.prayerLongitude')}
            aria-label={t('settings.prayerLongitude')}
            className="w-full bg-surface-container-lowest border border-outline-variant/50 rounded-xl h-touch-target-min px-4 font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors"
          />
        </div>
      </div>

      {/* One-shot device fix (path 3 — optional; permission prompt only on tap) */}
      {deviceFixSupported && (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onRequestDeviceFix}
            disabled={deviceFixState === 'locating'}
            className="h-touch-target-min rounded-xl border border-outline-variant/50 bg-surface-container-lowest font-label-md text-label-md text-primary flex items-center justify-center gap-2 hover:bg-surface-container transition-colors disabled:opacity-50"
          >
            <MaterialIcon
              icon={deviceFixState === 'locating' ? 'location_searching' : 'my_location'}
              className="text-[18px]"
            />
            {deviceFixState === 'locating'
              ? t('settings.prayerDeviceLocating')
              : t('settings.prayerUseDevice')}
          </button>
          <p className="font-caption text-caption text-on-surface-variant">
            {deviceFixState === 'failed'
              ? t('settings.prayerDeviceFailed')
              : t('settings.prayerDevicePrivacy')}
          </p>
        </div>
      )}

      {/* The ONE manual confirm step — label/coords visible before saving */}
      <div className="flex flex-col gap-2 border-t border-outline-variant/20 pt-4">
        {draft ? (
          <>
            <p className="font-caption text-caption text-on-surface-variant flex items-center gap-1.5">
              <MaterialIcon icon="location_on" className="text-[14px]" />
              {draft.label}
            </p>
            <div className="flex gap-3">
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 h-11 rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
              )}
              <button
                type="button"
                onClick={onConfirmSave}
                className="flex-1 h-11 rounded-xl bg-primary-container text-on-primary font-label-md text-label-md hover:opacity-90 active:scale-[0.98] transition-all"
              >
                {t('settings.prayerConfirmSave')}
              </button>
            </div>
          </>
        ) : (
          <p className="font-caption text-caption text-on-surface-variant">
            {t('settings.prayerDraftNone')}
          </p>
        )}
      </div>
    </div>
  );
};

export default LocationSetupForm;
