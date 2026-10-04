/**
 * PostSalahTrackerContainer — the Home after-salah slot's day view (R1):
 * the five-salah tracker when the feature is enabled, or the single quiet
 * opt-in offer when it is not. Subscribes to settings (via
 * usePostSalahWindow) and the session/zikr stores, derives the slots
 * purely via postSalahSlots over the hook's gathered periods, and bubbles
 * taps up — the CURRENT prayer's chip starts the guided flow; a PAST
 * prayer's chip asks whether the set was completed offline and marks it
 * done (attributed sessions, so the slot reads complete).
 *
 * The offer follows the prayer period (from each prayer until the next);
 * a set the user never finished moves on silently — its chip stays
 * tappable (the offline ask) but is never labeled "missed".
 *
 * Render decisions (self-contained, like PostSalahCardContainer):
 *   no location or uncomputable · postSalahEnabled off → no tracker
 *   (AC1.1.1 / AC1.2.4); off + never dismissed + the set resolvable →
 *   the offer row instead (deferred while another quiet offer shows —
 *   never two quiet offers at once). Dismissal persists via the
 *   `postSalahOffer` settings KV; no nag.
 */

import React, { useCallback, useMemo } from 'react';
import AfterSalahTracker, { AfterSalahSlotView } from '../../components/prayer/AfterSalahTracker';
import MaterialIcon from '../../components/MaterialIcon';
import { showConfirm } from '../../components/ConfirmDialog';
import { useI18n } from '../../../core/i18n';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { useZikrStore } from '../../../core/stores/zikrStore';
import { useSettingsStore } from '../../../core/stores/settingsStore';
import usePostSalahWindow from '../../hooks/usePostSalahWindow';
import {
  POST_SALAH_SET,
  attributedCounts,
  postSalahSlots,
  postSalahWindow,
  resolvePostSalahSet,
} from '../../../core/utils/prayerTimes';
import type { PrayerLocation } from '../../../core/db/types';
import type { PrayerName } from '../../../core/utils/prayerTimes';

/** Shape of the `postSalahOffer` settings KV row. */
export interface PostSalahOfferSetting {
  dismissed: boolean;
}

interface PostSalahTrackerContainerProps {
  /**
   * Bubbled to the page, which navigates to /counter?postSalah=… for the
   * live prayer — the set's first zikr travels for the deep link.
   */
  onStartFlow: (prayer: PrayerName, firstZikrId: number | null) => void;
  /** Bubbled to the page, which navigates to Settings (prayer section). */
  onOpenSettings: () => void;
  /** Chrome bridge in (§16.1): another quiet offer is showing — defer. */
  deferOffer?: boolean;
}

const PostSalahTrackerContainer: React.FC<PostSalahTrackerContainerProps> = ({
  onStartFlow,
  onOpenSettings,
  deferOffer = false,
}) => {
  const { t } = useI18n();
  const { location, enabled, window: win } = usePostSalahWindow();
  const sessions = useSessionStore(state => state.sessions);
  const zikrs = useZikrStore(state => state.zikrs);
  const offer = useSettingsStore(
    state => state.settings.postSalahOffer as PostSalahOfferSetting | undefined
  );

  const firstZikrId = useMemo(
    () => resolvePostSalahSet(zikrs)[0]?.zikr.id ?? null,
    [zikrs]
  );

  const slots = useMemo(
    () => (win ? postSalahSlots(win.all, new Date(), sessions, zikrs) : []),
    // The hook re-derives `window` on the shared 60s tick, so this memo
    // recomputes whenever the window bounds could have changed; the fresh
    // `new Date()` reads the same tick's instant.
    [win, sessions, zikrs]
  );

  // The quiet offer: feature off, never dismissed, nothing else offering,
  // and the full set resolvable (a partial set would make a broken promise).
  const offerVisible =
    !enabled &&
    !offer?.dismissed &&
    !deferOffer &&
    zikrs.length > 0 &&
    resolvePostSalahSet(zikrs).length === POST_SALAH_SET.length;

  const handleDismiss = useCallback(() => {
    void useSettingsStore
      .getState()
      .saveSetting('postSalahOffer', { dismissed: true } satisfies PostSalahOfferSetting);
  }, []);

  // The enabled tracker needs the computed periods; without them (no
  // location, polar latitude) it silently renders nothing (AC1.4.3).
  const markOfflineDone = useCallback(
    async (prayer: PrayerName) => {
      const ok = await showConfirm({
        message: t('postSalah.ask.message', { prayer: t(`postSalah.prayer.${prayer}`) }),
        confirmLabel: t('postSalah.ask.confirm'),
        cancelLabel: t('common.cancel'),
      });
      if (!ok) return;
      // The prayer's current occurrence (usually today's; yesterday's Isha
      // before Fajr). Attribution matching is the same derivation the
      // card/tracker read, so the slot flips to done and stays consistent
      // with the guided flow's bookkeeping.
      const loc = useSettingsStore.getState().settings.prayerLocation as
        | PrayerLocation
        | undefined;
      const w = loc ? postSalahWindow(loc, new Date()) : null;
      const now = Date.now();
      const matching = w?.all.filter(o => o.prayer === prayer) ?? [];
      const occ =
        matching.find(o => o.start.getTime() <= now && now < o.end.getTime()) ??
        [...matching].reverse().find(o => o.start.getTime() <= now) ??
        null;
      if (!occ) return;
      const counts = attributedCounts(occ, useSessionStore.getState().sessions);
      for (const item of resolvePostSalahSet(useZikrStore.getState().zikrs)) {
        const remaining = item.target - (counts.get(item.zikr.id!) ?? 0);
        if (remaining <= 0) continue;
        await useSessionStore.getState().recordCount({
          zikrId: item.zikr.id!,
          count: remaining,
          postSalah: prayer,
        });
      }
    },
    [t]
  );

  if (enabled && location && win) {
    const doneCount = slots.filter(s => s.done).length;
    const views: AfterSalahSlotView[] = slots.map(slot => ({
      prayer: slot.prayer,
      label: t(`postSalah.prayer.${slot.prayer}`),
      state: slot.done
        ? 'done'
        : slot.current
          ? 'active'
          : slot.pending
            ? 'past'
            : 'upcoming',
      onPress:
        slot.current && !slot.done
          ? () => onStartFlow(slot.prayer, firstZikrId)
          : slot.pending
            ? () => void markOfflineDone(slot.prayer)
            : undefined,
    }));
    return (
      <AfterSalahTracker
        slots={views}
        progressLine={t('postSalah.tracker.progress', { done: doneCount, total: views.length })}
      />
    );
  }

  if (offerVisible) {
    return (
      <div className="w-full bg-surface-container-low border border-outline-variant/20 rounded-xl px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-label-md text-label-md text-on-surface flex items-center gap-1.5">
              <MaterialIcon icon="mosque" className="text-[18px] text-tertiary" />
              {t('postSalah.offer.title')}
            </p>
            <p className="font-caption text-caption text-on-surface-variant mt-0.5">
              {t('postSalah.offer.body')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="p-2 -mr-1 rounded-full text-on-surface-variant hover:bg-surface-variant/50 transition-colors shrink-0"
            aria-label={t('postSalah.offer.dismiss')}
          >
            <MaterialIcon icon="close" className="text-[18px]" />
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="mt-3 h-touch-target-min w-full bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
        >
          <MaterialIcon icon="location_on" className="text-[20px]" />
          {t('postSalah.offer.cta')}
        </button>
      </div>
    );
  }

  return null;
};

export default PostSalahTrackerContainer;
