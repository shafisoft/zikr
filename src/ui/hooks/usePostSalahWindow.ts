/**
 * usePostSalahWindow — the R1 ambient hook (§16.1 container plumbing):
 * the settings read (saved location + kill-switch), the shared 60s tick,
 * and the pure window util in one useMemo. Containers call this; the
 * derived state is a pure function of (location, now) — nothing is
 * persisted, so a fresh mid-window app open renders the card on first
 * paint and expiry lands on the next tick (AC1.2.5).
 */

import { useMemo } from 'react';
import { useSettingsStore } from '../../core/stores/settingsStore';
import { postSalahWindow, PostSalahWindow } from '../../core/utils/prayerTimes';
import type { PrayerLocation } from '../../core/db/types';
import useNow from './useNow';

export interface PostSalahWindowState {
  /** The saved prayer-time location, or null when never set (AC1.1.1). */
  location: PrayerLocation | null;
  /** The postSalahEnabled kill-switch — default OFF (simple-default principle). */
  enabled: boolean;
  /** postSalahWindow(loc, now) — null when no location or uncomputable. */
  window: PostSalahWindow | null;
}

export function usePostSalahWindow(): PostSalahWindowState {
  const prayerLocation = useSettingsStore(
    state => state.settings.prayerLocation as PrayerLocation | undefined
  );
  const postSalahEnabled = useSettingsStore(
    state => state.settings.postSalahEnabled as boolean | undefined
  );
  const now = useNow(60_000);

  const location = prayerLocation ?? null;
  const enabled = postSalahEnabled === true;
  const postSalah = useMemo(
    () => (location ? postSalahWindow(location, now) : null),
    [location, now]
  );

  return { location, enabled, window: postSalah };
}

export default usePostSalahWindow;
