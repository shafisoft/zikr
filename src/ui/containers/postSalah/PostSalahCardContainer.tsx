/**
 * PostSalahCardContainer — the one ambient R1 card on Home (§16.2/§4.5):
 * period detection, done state, and the start hand-off. Subscribes to
 * settings (via usePostSalahWindow) and the session/zikr stores, derives
 * the current period + occurrence-done purely via useMemo, and renders
 * the presentational PostSalahCard.
 *
 * The offer follows the PRAYER PERIOD (from each prayer until the next;
 * Isha overnight): the card shows the current prayer's set until it is
 * done — then the quiet completed state, until the next prayer replaces
 * it. Render decisions (all self-contained — the page only hosts the
 * slot): no location · postSalahEnabled off · computation unavailable →
 * null (AC1.1.1 / AC1.2.4); current period's set done → the quiet
 * completed state (AC1.2.3).
 *
 * While an active, not-done card exists it reports onActiveChange(true)
 * — the §16.1 chrome bridge by which the page suppresses the hero line
 * (§16.6.3); the page subscribes to nothing to acquire the fact.
 */

import React, { useEffect, useMemo } from 'react';
import PostSalahCard from '../../components/prayer/PostSalahCard';
import { useI18n } from '../../../core/i18n';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { useZikrStore } from '../../../core/stores/zikrStore';
import usePostSalahWindow from '../../hooks/usePostSalahWindow';
import useNow from '../../hooks/useNow';
import {
  occurrenceDone,
  resolvePostSalahSet,
} from '../../../core/utils/prayerTimes';
import type { PrayerName } from '../../../core/utils/prayerTimes';

interface PostSalahCardContainerProps {
  /**
   * Bubbled to the page, which navigates to /counter?postSalah=… — with
   * the set's first zikr resolved here so the deep link opens the flow
   * on its first item.
   */
  onStartFlow: (prayer: PrayerName, firstZikrId: number | null) => void;
  /** §16.1 chrome bridge: an active, not-done card suppresses the hero. */
  onActiveChange: (active: boolean) => void;
}

const PostSalahCardContainer: React.FC<PostSalahCardContainerProps> = ({
  onStartFlow,
  onActiveChange,
}) => {
  const { t } = useI18n();
  const { location, enabled, window: win } = usePostSalahWindow();
  // The same shared 60s tick the window derivation rides — "now" must come
  // from it (never the bare clock) so the phase flip lands with the tick.
  const tick = useNow(60_000);
  const sessions = useSessionStore(state => state.sessions);
  const zikrs = useZikrStore(state => state.zikrs);

  const active = win?.active ?? null;
  const done = useMemo(
    () => (active ? occurrenceDone(active, sessions, zikrs) : false),
    [active, sessions, zikrs]
  );
  // The set's first item, for the deep link's zikrId (flows re-derive on
  // arrival — the param is a convenience, not state).
  const firstZikrId = useMemo(
    () => resolvePostSalahSet(zikrs)[0]?.zikr.id ?? null,
    [zikrs]
  );

  // The card leads ONLY while the moment is live and not yet observed.
  const showing = enabled && active != null && !done;

  useEffect(() => {
    onActiveChange(showing);
  }, [showing, onActiveChange]);

  if (!location || !enabled || !win || !active) return null;

  const prayerLabel = t(`postSalah.prayer.${active.prayer}`);
  // Two voices: while the prayer's OWN time is still valid — Fajr until
  // sunrise, the others until the next prayer — the card says "It's
  // Fajr"; past that, mid-period, the same offer softens into the ask.
  const salatFresh = (active.salatEnd?.getTime() ?? Infinity) > tick.getTime();
  const titleLine = salatFresh
    ? t('postSalah.card.title', { prayer: prayerLabel })
    : t('postSalah.card.askTitle', { prayer: prayerLabel });
  const bodyLine = salatFresh
    ? t('postSalah.card.body')
    : t('postSalah.card.askBody');

  return (
    <PostSalahCard
      prayerLabel={prayerLabel}
      titleLine={titleLine}
      bodyLine={bodyLine}
      done={done}
      onStart={() => onStartFlow(active.prayer, firstZikrId)}
    />
  );
};

export default PostSalahCardContainer;
