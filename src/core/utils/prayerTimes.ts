/**
 * Post-salah periods — R1 pure logic (docs/solution-design.md §4.4).
 *
 * Given a saved PrayerLocation and the device's `now`, computes the day's
 * five prayer times with adhan (Karachi method, Shafi Asr — the shipping
 * v1 defaults per §4.2), builds the after-prayer PERIODS (each prayer's
 * run until the next; Isha overnight), and returns the CURRENT period.
 * All comparisons are absolute UTC instants, which is what makes DST,
 * midnight-crossing Isha, and travel degrade honestly:
 *
 * - DST — instants never move; wall-clock labels shift with the device
 *   automatically. A spring-forward can shorten a period; no error path.
 * - Midnight Isha — periods are gathered from the device's CURRENT
 *   local day PLUS the previous day's Isha, so a 23:50 → 05:15 overnight
 *   period is still found at 00:10 (attributed to the correct occurrence;
 *   the sessions it reads carry their own timestamps and log to the new date).
 * - Travel — PrayerTimes for the device's local date with the saved
 *   coordinates yields the location's solar events as instants; the card
 *   appears at the device-clock instant of the location's sunset.
 * - Failure — extreme latitudes make adhan throw (polar circle): the
 *   computation is wrapped and returns null → the feature silently
 *   renders nothing (AC1.4.3). No geolocation, no network, ever.
 *
 * The offer follows the prayer PERIOD, not a 30-minute window: from each
 * prayer until the next (Isha runs overnight until Fajr), the card offers
 * that prayer's set until it is done — then shows the quiet completed
 * state until the next prayer replaces it. A set the user never finished
 * moves on silently: no missed state, and its tracker chip stays tappable
 * to mark an offline completion.
 *
 * Done-attribution is derived, never persisted (AC1.2.5): an occurrence is
 * done iff each of the four set items reached its target from the sessions
 * the guided flow / offline mark attributed to that prayer — free counting
 * never completes a set by itself (AC1.2.3, as revised after field
 * feedback: all-day tasbeeh counting was completing every window's set).
 */

import {
  CalculationMethod,
  CalculationParameters,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PrayerTimes,
} from 'adhan';
import type { PrayerLocation, PostSalahPrayer } from '../db/types';
import { formatDate } from './dateUtils';
import type { Session, Zikr } from '../db/types';

/** The five prayers of the after-salah set (the union lives in db/types —
 * Session.postSalah carries it; aliased here for the util's public surface). */
export type PrayerName = PostSalahPrayer;

// ---------- The fixed after-salah set (AC1.3.1; catalog 33/33/34/100) ----------

export interface PostSalahSetItem {
  /** Catalog name — resolved against the user's seeded zikr rows. */
  name: string;
  target: number;
}

/** The four catalog items of the post-salah set, in order (zikrCatalog). */
export const POST_SALAH_SET: readonly PostSalahSetItem[] = [
  { name: 'SubhanAllah', target: 33 },
  { name: 'Alhamdulillah', target: 33 },
  { name: 'Allahu Akbar', target: 34 },
  { name: 'La ilaha illallah', target: 100 },
];

/** Fixed window length — REMOVED: the offer follows the prayer PERIOD
 * (from each prayer until the next), not a 30-minute window. */

// ---------- Window computation ----------

/** One day's adhan output as absolute instants. */
export interface PrayerDayTimes {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

/**
 * One after-prayer PERIOD: from a prayer's time until the NEXT prayer's
 * time (Isha runs until the following Fajr). The after-salah set for a
 * prayer is offered across its whole period — the `end` bounds attribution,
 * never visibility. `salatEnd` is when the prayer's OWN time runs out (the
 * fresh phase of the offer: Fajr ends at sunrise; the other prayers remain
 * valid until the next one, i.e. the period end) — past it the card trades
 * "It's Fajr" for the gentler "did you complete it?" phrasing.
 */
export interface PrayerOccurrence {
  prayer: PrayerName;
  start: Date;
  end: Date;
  salatEnd?: Date;
}

const PRAYER_FIELDS: readonly PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

/** Settings value → adhan parameters (Karachi + Shafi defaults, §4.2). */
function paramsFor(loc: PrayerLocation): CalculationParameters {
  let params: CalculationParameters;
  switch (loc.method) {
    case 'MuslimWorldLeague':
      params = CalculationMethod.MuslimWorldLeague();
      break;
    case 'Egyptian':
      params = CalculationMethod.Egyptian();
      break;
    case 'UmmAlQura':
      params = CalculationMethod.UmmAlQura();
      break;
    case 'MoonsightingCommittee':
      params = CalculationMethod.MoonsightingCommittee();
      break;
    case 'NorthAmerica':
      params = CalculationMethod.NorthAmerica();
      break;
    case 'Karachi':
    default:
      params = CalculationMethod.Karachi();
      break;
  }
  params.madhab = loc.madhab === 'Hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  if (loc.highLatitudeRule === 'SeventhOfTheNight') {
    params.highLatitudeRule = HighLatitudeRule.SeventhOfTheNight;
  } else if (loc.highLatitudeRule === 'TwilightAngle') {
    params.highLatitudeRule = HighLatitudeRule.TwilightAngle;
  } else if (loc.highLatitudeRule === 'MiddleOfTheNight') {
    params.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
  }
  return params;
}

/** Safe local noon of `date`'s calendar day (device clock = truth, §4.4). */
function localNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

/**
 * Adhan's times for one calendar day, or null when the location is
 * uncomputable (polar circle — adhan throws; AC1.4.3).
 */
export function dayPrayerTimes(loc: PrayerLocation, date: Date): PrayerDayTimes | null {
  try {
    const times = new PrayerTimes(
      new Coordinates(loc.lat, loc.lon),
      localNoon(date),
      paramsFor(loc)
    );
    const day: PrayerDayTimes = {
      fajr: times.fajr,
      sunrise: times.sunrise,
      dhuhr: times.dhuhr,
      asr: times.asr,
      maghrib: times.maghrib,
      isha: times.isha,
    };
    // A malformed result (NaN instant) is as useless as a throw.
    for (const field of Object.keys(day) as (keyof PrayerDayTimes)[]) {
      if (Number.isNaN(day[field].getTime())) return null;
    }
    return day;
  } catch {
    return null;
  }
}

/**
 * The occurrences of "now": the current local day's five windows plus the
 * PREVIOUS day's Isha window (the two-day gather that makes a window
 * crossing midnight still findable at 00:10, §4.4). Ordered by start.
 */
/**
 * The after-prayer PERIODS of "now": the current local day's five prayers
 * plus the PREVIOUS day's Isha (whose period runs until today's Fajr, so a
 * 23:50 → 05:15 overnight offer is still found at 00:10). Each period ends
 * at the next prayer's start; Isha's ends at Fajr + 24h. Ordered by start.
 */
export function gatherOccurrences(
  today: PrayerDayTimes,
  yesterday: PrayerDayTimes
): PrayerOccurrence[] {
  const ends: Record<PrayerName, Date> = {
    fajr: today.dhuhr,
    dhuhr: today.asr,
    asr: today.maghrib,
    maghrib: today.isha,
    // Tomorrow's Fajr ≈ today's Fajr + 24h — good enough for a period end.
    isha: new Date(today.fajr.getTime() + 24 * 60 * 60 * 1000),
  };
  const occurrences: PrayerOccurrence[] = PRAYER_FIELDS.map(prayer => ({
    prayer,
    start: today[prayer],
    end: ends[prayer],
    // Fajr's own time ends at sunrise — past it the offer softens. The
    // other prayers stay valid until the next one (= the period end).
    salatEnd: prayer === 'fajr' ? today.sunrise : ends[prayer],
  }));
  occurrences.push({
    prayer: 'isha',
    start: yesterday.isha,
    end: today.fajr,
  });
  return occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** The PERIOD containing `now` (start inclusive, end exclusive) — with
 * periods tiling the day there is always exactly one, except before the
 * earliest gathered prayer. */
export function activeOccurrence(
  occurrences: PrayerOccurrence[],
  now: Date
): PrayerOccurrence | null {
  const t = now.getTime();
  return (
    occurrences.find(o => o.start.getTime() <= t && t < o.end.getTime()) ?? null
  );
}

export interface PostSalahWindow {
  /** The CURRENT prayer period (the most recent prayer whose time passed). */
  active: PrayerOccurrence | null;
  all: PrayerOccurrence[];
}

/**
 * The CURRENT after-salah period for `now` — the offer follows the most
 * recent prayer (Fajr → Dhuhr, …, Isha → overnight) and stays until its
 * set is done or the next prayer replaces it. Null only when the location
 * is uncomputable (the silent-absence contract, AC1.4.3).
 */
export function postSalahWindow(loc: PrayerLocation, now: Date): PostSalahWindow | null {
  const today = dayPrayerTimes(loc, now);
  if (!today) return null;
  const yesterdayDate = new Date(
    now.getFullYear(), now.getMonth(), now.getDate() - 1, 12
  );
  const yesterday = dayPrayerTimes(loc, yesterdayDate);
  if (!yesterday) return null;
  const all = gatherOccurrences(today, yesterday);
  return { active: activeOccurrence(all, now), all };
}

// ---------- Done-attribution (derived, never persisted — §2.3) ----------

/**
 * Per-zikr totals for ONE prayer occurrence, from the sessions the guided
 * flow and the offline mark-done dialog attributed to that prayer
 * (session.postSalah). Attribution replaced the older "any session inside
 * the 30-minute window counts" rule: all-day free counting was completing
 * sets the user never ran. A session counts when it falls INSIDE the
 * prayer's period (the guided flow, even past midnight on Isha) OR was
 * logged later the same day after its start (an offline completion the
 * user marked once the period moved on). Unattributed sessions never
 * count.
 */
export function attributedCounts(occ: PrayerOccurrence, sessions: Session[]): Map<number, number> {
  const totals = new Map<number, number>();
  const start = occ.start.getTime();
  const end = occ.end.getTime();
  const day = formatDate(occ.start);
  for (const session of sessions) {
    if (session.postSalah !== occ.prayer) continue;
    const t = new Date(session.timestamp).getTime();
    const inPeriod = t >= start && t < end;
    const markedLaterSameDay =
      t >= start && formatDate(new Date(session.date)) === day;
    if (inPeriod || markedLaterSameDay) {
      totals.set(session.zikrId, (totals.get(session.zikrId) ?? 0) + session.count);
    }
  }
  return totals;
}

/** The seeder's own key — case/whitespace-insensitive (seed.ts idiom). */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/** Map the four set items onto the user's LIVE zikr rows, in set order. */
export function resolvePostSalahSet(zikrs: Zikr[]): Array<PostSalahSetItem & { zikr: Zikr }> {
  const live = new Map<string, Zikr>();
  for (const zikr of zikrs) {
    if (zikr.deletedAt || zikr.id == null) continue;
    live.set(nameKey(zikr.name), zikr);
  }
  const resolved: Array<PostSalahSetItem & { zikr: Zikr }> = [];
  for (const item of POST_SALAH_SET) {
    const zikr = live.get(nameKey(item.name));
    if (zikr && zikr.id != null) resolved.push({ ...item, zikr });
  }
  return resolved;
}

/**
 * Is the set complete for this occurrence? Every resolved set item at
 * target from ATTRIBUTED sessions only (AC1.2.3 — an item whose zikr is
 * missing can never be satisfied, mirroring the routine rule).
 */
export function occurrenceDone(
  occ: PrayerOccurrence,
  sessions: Session[],
  zikrs: Zikr[]
): boolean {
  const resolved = resolvePostSalahSet(zikrs);
  if (resolved.length === 0) return false;
  const counts = attributedCounts(occ, sessions);
  return resolved.every(item => (counts.get(item.zikr.id!) ?? 0) >= item.target);
}

// ---------- The day tracker (one practice, five salah slots) ----------

/** One salah's slot of the day tracker — derived, never persisted. */
export interface PostSalahSlot {
  prayer: PrayerName;
  start: Date;
  end: Date;
  /** This prayer is the CURRENT period (its set is the live offer). */
  current: boolean;
  /** The set is complete for this occurrence (occurrenceDone). */
  done: boolean;
  /** 0..1 — reached fraction of the resolved set's total target. */
  progress: number;
  /**
   * The period began, has already been replaced by a later prayer, and the
   * set is NOT done — move-on-silently: no missed stigma, but the chip
   * stays tappable so the user can mark an offline completion.
   */
  pending: boolean;
  /** Today's prayer time has not arrived yet. */
  upcoming: boolean;
}

/**
 * The day's five after-salah slots from a gathered PERIOD list (the `all`
 * of postSalahWindow, which carries yesterday's midnight-crossing Isha).
 * One slot per prayer: the CURRENT period wins; otherwise the latest
 * (today's). At 00:10 the Isha slot therefore shows yesterday's still-open
 * overnight period — the same moment the R1 card leads with. A prayer the
 * user never completed simply moves on when the next prayer arrives: its
 * slot reads pending (tappable, mark offline completion) — never "missed".
 */
export function postSalahSlots(
  occurrences: PrayerOccurrence[],
  now: Date,
  sessions: Session[],
  zikrs: Zikr[]
): PostSalahSlot[] {
  const resolved = resolvePostSalahSet(zikrs);
  const totalTarget = resolved.reduce((n, item) => n + item.target, 0);
  const t = now.getTime();

  const isInside = (o: PrayerOccurrence) =>
    o.start.getTime() <= t && t < o.end.getTime();
  const byPrayer = new Map<PrayerName, PrayerOccurrence>();
  for (const occ of occurrences) {
    const existing = byPrayer.get(occ.prayer);
    if (!existing) {
      byPrayer.set(occ.prayer, occ);
      continue;
    }
    if (isInside(occ) || (!isInside(existing) && occ.start.getTime() > existing.start.getTime())) {
      byPrayer.set(occ.prayer, occ);
    }
  }

  const slots: PostSalahSlot[] = [];
  for (const prayer of PRAYER_FIELDS) {
    const occ = byPrayer.get(prayer);
    if (!occ) continue;
    const counts = attributedCounts(occ, sessions);
    const reached = resolved.reduce(
      (n, item) => n + Math.min(item.target, counts.get(item.zikr.id!) ?? 0),
      0
    );
    const done =
      resolved.length > 0 &&
      resolved.every(item => (counts.get(item.zikr.id!) ?? 0) >= item.target);
    const current = isInside(occ);
    const upcoming = occ.start.getTime() > t;
    slots.push({
      prayer,
      start: occ.start,
      end: occ.end,
      current,
      done,
      progress: totalTarget > 0 ? reached / totalTarget : 0,
      pending: !current && !upcoming && !done,
      upcoming,
    });
  }
  return slots;
}

// ---------- The guided-flow sequence (§4.6/§16.4) ----------

/** One countable step of the post-salah flow. */
export interface PostSalahStep {
  itemIndex: number;
  /** Remaining count for this occurrence (target minus attributed credit). */
  target: number;
  zikr: Zikr;
}

/**
 * The 33 → 33 → 34 → 100 sequence resolved against the user's seeded rows
 * (§4.6). `attributed` credits the prayer's attributed sessions per zikr,
 * so flow position DERIVES from sessions (resume AC1.3.3; an Undo steps the
 * position back — OQ-3), exactly like the routine flow.
 */
export function postSalahSequence(
  zikrs: Zikr[],
  attributed?: Map<number, number>
): Array<PostSalahStep> {
  return resolvePostSalahSet(zikrs).map((item, itemIndex) => ({
    itemIndex,
    target: Math.max(0, item.target - (attributed?.get(item.zikr.id!) ?? 0)),
    zikr: item.zikr,
  }));
}
