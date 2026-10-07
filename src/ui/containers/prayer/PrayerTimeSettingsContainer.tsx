/**
 * PrayerTimeSettingsContainer — the Settings "Prayer times" section
 * (R1, §16.2). The one data-touching tier of the surface: it subscribes
 * to the settings store (`prayerLocation`, `postSalahEnabled`), invokes
 * `saveSetting` for both keys, OWNS the one-shot user-initiated device
 * geolocation call (the button is a callback-only affordance), and
 * derives the offline city search plus computation availability
 * (AC1.4.3's honest note) via useMemo. Every row/chooser below it is a
 * presentational component.
 *
 * Privacy shape (§4.3, AC1.1.3): the permission prompt can only appear
 * on an explicit tap; denial leaves paths 1–2 (city list, coordinates)
 * fully usable and is never re-prompted — no state remembers an attempt
 * beyond the open form.
 */

import React, { useCallback, useMemo, useState } from 'react';
import LocationSetupForm, {
  DeviceFixState,
  LocationDraft,
} from '../../components/prayer/LocationSetupForm';
import PrayerLocationRow from '../../components/prayer/PrayerLocationRow';
import PrayerMethodChoosers from '../../components/prayer/PrayerMethodChoosers';
import PostSalahToggleRow from '../../components/prayer/PostSalahToggleRow';
import MaterialIcon from '../../components/MaterialIcon';
import { useSettingsStore } from '../../../core/stores/settingsStore';
import { useI18n } from '../../../core/i18n';
import { cityById, searchCities } from '../../../core/data/prayerCities';
import type { PrayerCity } from '../../../core/data/prayerCities';
import { postSalahWindow } from '../../../core/utils/prayerTimes';
import type {
  PrayerCalculationMethod,
  PrayerLocation,
  PrayerMadhab,
} from '../../../core/db/types';

/** Label for a saved location — bn name when it came from the city list. */
function locationLabel(loc: PrayerLocation, lang: string): string {
  if (loc.cityId) {
    const city = cityById(loc.cityId);
    if (city) return lang === 'bn' ? city.nameBn : city.name;
  }
  return loc.label;
}

const PrayerTimeSettingsContainer: React.FC = () => {
  const { lang, t } = useI18n();
  const prayerLocation = useSettingsStore(
    state => state.settings.prayerLocation as PrayerLocation | undefined
  );
  const postSalahEnabled = useSettingsStore(
    state => state.settings.postSalahEnabled as boolean | undefined
  );
  const saveSetting = useSettingsStore(state => state.saveSetting);

  // ----- Setup form state (the container owns acquisition) -----
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [coords, setCoords] = useState({ lat: '', lon: '' });
  const [draft, setDraft] = useState<LocationDraft | null>(null);
  const [draftCityId, setDraftCityId] = useState<string | undefined>(undefined);
  const [deviceFixState, setDeviceFixState] = useState<DeviceFixState>('idle');

  const results = useMemo(() => searchCities(query), [query]);

  // Availability (AC1.4.3): computed from the SAVED location only.
  const available = useMemo(() => {
    if (!prayerLocation) return true;
    return postSalahWindow(prayerLocation, new Date()) !== null;
  }, [prayerLocation]);

  const savedLabel = useMemo(
    () => (prayerLocation ? locationLabel(prayerLocation, lang) : ''),
    [prayerLocation, lang]
  );

  const resetForm = useCallback(() => {
    setEditing(false);
    setQuery('');
    setCoords({ lat: '', lon: '' });
    setDraft(null);
    setDraftCityId(undefined);
    setDeviceFixState('idle');
  }, []);

  // ----- Handlers (store writes live here, never in components) -----
  const handleSelectCity = useCallback((city: PrayerCity) => {
    setDraft({ label: city.name, lat: city.lat, lon: city.lng });
    setDraftCityId(city.id);
    setQuery(city.name);
  }, []);

  const handleCoordsChange = useCallback((lat: string, lon: string) => {
    setCoords({ lat, lon });
    const latNum = Number.parseFloat(lat);
    const lonNum = Number.parseFloat(lon);
    if (
      Number.isFinite(latNum) && latNum >= -90 && latNum <= 90 &&
      Number.isFinite(lonNum) && lonNum >= -180 && lonNum <= 180
    ) {
      setDraft({
        label: `${latNum.toFixed(4)}, ${lonNum.toFixed(4)}`,
        lat: latNum,
        lon: lonNum,
      });
      setDraftCityId(undefined);
    } else {
      setDraft(null);
      setDraftCityId(undefined);
    }
  }, []);

  const handleRequestDeviceFix = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return;
    setDeviceFixState('locating');
    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = position.coords.latitude;
        const lon = position.coords.longitude;
        setCoords({ lat: lat.toFixed(4), lon: lon.toFixed(4) });
        setDraft({ label: `${lat.toFixed(4)}, ${lon.toFixed(4)}`, lat, lon });
        setDraftCityId(undefined);
        setDeviceFixState('idle');
      },
      () => {
        // Denial/failure leaves paths 1–2 untouched (AC1.1.3); the
        // affordance never re-prompts on its own.
        setDeviceFixState('failed');
      },
      { timeout: 10_000, maximumAge: 0 }
    );
  }, []);

  const handleConfirmSave = useCallback(() => {
    if (!draft) return;
    const current = useSettingsStore.getState().settings.prayerLocation as
      | PrayerLocation
      | undefined;
    const saved: PrayerLocation = {
      lat: draft.lat,
      lon: draft.lon,
      label: draft.label,
      cityId: draftCityId,
      method: current?.method ?? 'Karachi',
      madhab: current?.madhab ?? 'Shafi',
      highLatitudeRule: current?.highLatitudeRule,
    };
    void saveSetting('prayerLocation', saved);
    resetForm();
  }, [draft, draftCityId, saveSetting, resetForm]);

  const handleCancel = useCallback(() => resetForm(), [resetForm]);

  const handleClear = useCallback(() => {
    // Clearing the location removes the feature entirely (§6); the toggle
    // is reset with it so a re-entry starts from the honest default OFF.
    void saveSetting('prayerLocation', undefined);
    void saveSetting('postSalahEnabled', false);
  }, [saveSetting]);

  const handleMethodChange = useCallback(
    (method: PrayerCalculationMethod) => {
      const current = useSettingsStore.getState().settings.prayerLocation as
        | PrayerLocation
        | undefined;
      if (!current) return;
      void saveSetting('prayerLocation', { ...current, method });
    },
    [saveSetting]
  );

  const handleMadhabChange = useCallback(
    (madhab: PrayerMadhab) => {
      const current = useSettingsStore.getState().settings.prayerLocation as
        | PrayerLocation
        | undefined;
      if (!current) return;
      void saveSetting('prayerLocation', { ...current, madhab });
    },
    [saveSetting]
  );

  const handleToggle = useCallback(
    (value: boolean) => {
      void saveSetting('postSalahEnabled', value);
    },
    [saveSetting]
  );

  // Nothing saved (or mid-edit) → the setup form is the section's body.
  if (!prayerLocation || editing) {
    return (
      <section>
        <h2 className="font-label-md text-label-md text-on-surface-variant mb-4 px-2">
          {t('settings.prayerTimes')}
        </h2>
        <div className="flex flex-col gap-2">
          <p className="font-caption text-caption text-on-surface-variant px-2 -mt-1 mb-1">
            {t('settings.prayerTimesIntro')}
          </p>
          <LocationSetupForm
            query={query}
            results={results}
            onQueryChange={setQuery}
            onSelectCity={handleSelectCity}
            coords={coords}
            onCoordsChange={handleCoordsChange}
            deviceFixState={deviceFixState}
            onRequestDeviceFix={handleRequestDeviceFix}
            draft={draft}
            onConfirmSave={handleConfirmSave}
            onCancel={prayerLocation ? handleCancel : undefined}
          />
        </div>
      </section>
    );
  }

  // Saved view: location row + choosers + toggle (+ honest unavailability).
  return (
    <section>
      <h2 className="font-label-md text-label-md text-on-surface-variant mb-4 px-2">
        {t('settings.prayerTimes')}
      </h2>
      <div className="flex flex-col gap-2">
        {!available && (
          <p className="bg-surface-container-low rounded-xl border border-outline-variant/20 p-4 flex items-start gap-3 font-caption text-caption text-on-surface-variant">
            <MaterialIcon icon="info" className="text-[18px] shrink-0 mt-0.5" />
            {t('settings.prayerUnavailable')}
          </p>
        )}
        <PrayerLocationRow
          label={savedLabel}
          onEdit={() => setEditing(true)}
          onClear={handleClear}
        />
        <PrayerMethodChoosers
          method={prayerLocation.method}
          madhab={prayerLocation.madhab}
          onMethodChange={handleMethodChange}
          onMadhabChange={handleMadhabChange}
        />
        <PostSalahToggleRow
          enabled={postSalahEnabled === true}
          onToggle={handleToggle}
        />
      </div>
    </section>
  );
};

export default PrayerTimeSettingsContainer;
