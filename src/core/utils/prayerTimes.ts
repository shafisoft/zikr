/**
 * Post-salah windows — R1 pure logic (docs/solution-design.md §4.4).
 *
 * Given a saved PrayerLocation and the device's `now`, computes the day's
 * five prayer times with adhan (Karachi method, Shafi Asr — the shipping
 * v1 defaults per §4.2), builds the fixed 30-minute post-prayer windows,
 * and returns the ACTIVE window or null. All comparisons are absolute UTC
 * instants, which is what makes DST, midnight-crossing Isha, and travel
 * degrade honestly:
 *
 * - DST — instants never move; wall-clock labels shift with the device
 *   automatically. A spring-forward can shorten a window; no error path.
 * - Midnight Isha — occurrences are gathered from the device's CURRENT
 *   local day PLUS the previous day's Isha, so a 23:50 → 00:20 window is
 *   still found at 00:10 (attributed to the correct occurrence; the
 *   sessions it reads carry their own timestamps and log to the new date).
 * - Travel — PrayerTimes for the device's local date with the saved
 *   coordinates yields the location's solar events as instants; the card
 *   appears at the device-clock instant of the location's sunset.
 * - Failure — extreme latitudes make adhan throw (polar circle): the
 *   computation is wrapped and returns null → the feature silently
 *   renders nothing (AC1.4.3). No geolocation, no network, ever.
 *
 * Done-attribution is derived, never persisted (AC1.2.5): an occurrence
 * is done iff each of the four set items reached its target from sessions
 * whose timestamp falls INSIDE the window (§2.3) — ordinary sessions
 * earlier the same day can never masquerade as the set (AC1.2.3).
 */

import {
  CalculationMethod,
  CalculationParameters,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PrayerTimes,
} from 'adhan';
import type { PrayerLocation } from '../db/types';
import type { Session, Zikr } from '../db/types';

// ---------- The fixed after-salah set (AC1.3.1; catalog 33/33/34/100) ----------

export type PrayerName = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

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

/** Fixed window length (AC1.2.2 — not user-configurable in v1). */
export const POST_SALAH_WINDOW_MS = 30 * 60 * 1000;

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

/** One 30-minute post-prayer window as absolute instants. */
export interface PrayerOccurrence {
  prayer: PrayerName;
  start: Date;
  end: Date;
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
export function gatherOccurrences(
  today: PrayerDayTimes,
  yesterday: PrayerDayTimes
): PrayerOccurrence[] {
  const occurrences: PrayerOccurrence[] = [];
  for (const prayer of PRAYER_FIELDS) {
    const start = today[prayer];
    occurrences.push({ prayer, start, end: new Date(start.getTime() + POST_SALAH_WINDOW_MS) });
  }
  const yIsha = yesterday.isha;
  occurrences.push({
    prayer: 'isha',
    start: yIsha,
    end: new Date(yIsha.getTime() + POST_SALAH_WINDOW_MS),
  });
  return occurrences.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** The window containing `now` (start inclusive, end exclusive), or null. */
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
  active: PrayerOccurrence | null;
  all: PrayerOccurrence[];
}

/**
 * The ACTIVE post-salah window for `now` (prayer key + bounds), or null
 * when the location is uncomputable — the silent-absence contract (AC1.4.3).
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

/** Per-zikr totals from sessions whose TIMESTAMP falls inside the window. */
export function windowCounts(occ: PrayerOccurrence, sessions: Session[]): Map<number, number> {
  const totals = new Map<number, number>();
  const start = occ.start.getTime();
  const end = occ.end.getTime();
  for (const session of sessions) {
    const t = new Date(session.timestamp).getTime();
    if (t < start || t >= end) continue;
    totals.set(session.zikrId, (totals.get(session.zikrId) ?? 0) + session.count);
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
 * target from in-window sessions only (AC1.2.3 — an item whose zikr is
 * missing can never be satisfied, mirroring the routine rule).
 */
export function occurrenceDone(
  occ: PrayerOccurrence,
  sessions: Session[],
  zikrs: Zikr[]
): boolean {
  const resolved = resolvePostSalahSet(zikrs);
  if (resolved.length === 0) return false;
  const counts = windowCounts(occ, sessions);
  return resolved.every(item => (counts.get(item.zikr.id!) ?? 0) >= item.target);
}

// ---------- The day tracker (one practice, five salah slots) ----------

/** One salah's slot of the day tracker — derived, never persisted. */
export interface PostSalahSlot {
  prayer: PrayerName;
  start: Date;
  end: Date;
  /** The 30-minute window contains `now` (start inclusive, end exclusive). */
  active: boolean;
  /** The set is complete for this occurrence (occurrenceDone). */
  done: boolean;
  /** 0..1 — reached fraction of the resolved set's total target. */
  progress: number;
  /** Window fully past and NOT done. */
  missed: boolean;
  /** Window has not opened yet. */
  upcoming: boolean;
}

/**
 * The day's five after-salah slots from a gathered occurrence list (the
 * `all` of postSalahWindow, which carries yesterday's midnight-crossing
 * Isha). One slot per prayer: the ACTIVE occurrence wins; otherwise the
 * latest (today's). At 00:10 the Isha slot therefore shows yesterday's
 * still-open window — the same moment the R1 card leads with — instead of
 * a confusing "upcoming" state for a prayer whose window is live.
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
    const counts = windowCounts(occ, sessions);
    const reached = resolved.reduce(
      (n, item) => n + Math.min(item.target, counts.get(item.zikr.id!) ?? 0),
      0
    );
    const done =
      resolved.length > 0 &&
      resolved.every(item => (counts.get(item.zikr.id!) ?? 0) >= item.target);
    const active = isInside(occ);
    slots.push({
      prayer,
      start: occ.start,
      end: occ.end,
      active,
      done,
      progress: totalTarget > 0 ? reached / totalTarget : 0,
      missed: !active && !done && occ.end.getTime() <= t,
      upcoming: occ.start.getTime() > t,
    });
  }
  return slots;
}

// ---------- The guided-flow sequence (§4.6/§16.4) ----------

/** One countable step of the post-salah flow. */
export interface PostSalahStep {
  itemIndex: number;
  /** Remaining count for this occurrence (target minus in-window credit). */
  target: number;
  zikr: Zikr;
}

/**
 * The 33 → 33 → 34 → 100 sequence resolved against the user's seeded rows
 * (§4.6). `inWindow` credits today's in-window sessions per zikr, so flow
 * position DERIVES from sessions (resume AC1.3.3; an Undo steps the
 * position back — OQ-3), exactly like the routine flow.
 */
export function postSalahSequence(
  zikrs: Zikr[],
  inWindow?: Map<number, number>
): PostSalahStep[] {
  return resolvePostSalahSet(zikrs).map((item, itemIndex) => ({
    itemIndex,
    target: Math.max(0, item.target - (inWindow?.get(item.zikr.id!) ?? 0)),
    zikr: item.zikr,
  }));
}
