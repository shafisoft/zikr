/**
 * Routines — pure logic (R2 "Routines as a first-class object",
 * docs/solution-design.md §2.3, §5). No backend or DB imports so every rule
 * stays trivially testable.
 *
 * The single counting truth: there are NO completion rows. An item's
 * done-state for a day is a day-scoped aggregation over `sessions`, SCOPED
 * to the routine (sessionCountsTowardRoutine): a routine's own guided-flow
 * sessions always count; free counting (plain counter, manual entry, group
 * row) counts when its part of day matches the routine's schedule window —
 * so completing the morning set no longer completes the evening preset's
 * identical items. A session saved with `countsToGoals: false` STILL counts
 * (a routine measures dhikr performed, not goal bookkeeping — §2.3).
 *
 * Duplicate zikr occurrences are positional, not keyed (AC2.2.2): each
 * zikr's day total is allocated across that routine's occurrences in
 * routine order, so every occurrence keeps its own independent count.
 *
 * A missing (soft-deleted) zikr is never complete — it BLOCKS done-today
 * and the routine's streak predicate while missing (§5.2, engineer review),
 * and renders from the denormalized item name with a gentle suffix.
 */

import { DayPart, Routine, RoutineItem, RoutineSchedule, RoutineSchedulePart, Session, Zikr } from '../db/types';
import { formatDate } from './dateUtils';
import { streakStatus, StreakStatus } from './overallStreak';

// ---------- Bounds (§5.1, OQ-4) ----------

/** Max items per routine (the preset is 6; twice that is generous headroom). */
export const MAX_ROUTINE_ITEMS = 12;
/** Max routines on Home (section legibility). */
export const MAX_ROUTINES = 5;

export type RoutineDraftIssue =
  | 'empty'
  | 'too-many-items'
  | 'too-many-routines';

/** Bounds for a draft (gently enforced as warnings in the UI, never crashes). */
export function routineDraftIssue(input: {
  itemCount: number;
  routineCount: number;
}): RoutineDraftIssue | null {
  if (input.routineCount >= MAX_ROUTINES) return 'too-many-routines';
  if (input.itemCount === 0) return 'empty';
  if (input.itemCount > MAX_ROUTINE_ITEMS) return 'too-many-items';
  return null;
}

// ---------- ids ----------

/** uuid for new routine rows (the newPlanId() idiom, planUtils.ts:11). */
export function newRoutineId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'routine-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ---------- Preset (Hisn-ul-Muslim order — engineer review binding) ----------

/**
 * The six-item morning/evening cluster in HISN-UL-MUSLIM liturgical order
 * (AC2.1.1 — NOT the catalog object's own order). Per-item counts resolve
 * from the catalog `defaultTarget` at creation time; this list is the ORDER.
 */
export const ROUTINE_PRESET_ORDER: ReadonlyArray<string> = [
  'Bismillahilladhi la Yadurru',                    // ×3
  'Radhitu Billahi Rabba',                          // ×3
  'Allahumma Ajirni Minan-Nar',                     // ×7
  'Hasbiyallahu La ilaha illa Huwa',                // ×7
  'Sayyidul Istighfar',                             // ×1
  "Allahumma A'inni ala Dhikrika",                  // ×10
];

/**
 * The BEFORE-SLEEP preset in the Hisn-ul-Muslim "أذكار النوم" order: the
 * three surahs pulled together (pooled into one chest, Bukhari), Tasbih
 * Fatimah, and the two bedtime duas — Quranic items reference the complete
 * catalog entries; SubhanAllah/Alhamdulillah/Allahu Akbar REUSE the
 * existing seeded rows (never duplicated).
 */
export const ROUTINE_PRESET_ORDER_NIGHT: ReadonlyArray<string> = [
  'Ayat al-Kursi',                              // ×1
  'Surah Al-Ikhlas',                            // ×3
  'Surah Al-Falaq',                             // ×3
  'Surah An-Nas',                               // ×3
  'Bismika Allahumma Amutu wa Ahya',            // ×1
  'SubhanAllah',                                // ×33 (Tasbih Fatimah)
  'Alhamdulillah',                              // ×33
  'Allahu Akbar',                               // ×34
  'Allahumma Aslamtu Nafsi Ilayk',              // ×1
];

/** The FRIDAY sunnahs (weekly): Kahf recitation, Salawat, istighfar. */
export const ROUTINE_PRESET_ORDER_FRIDAY: ReadonlyArray<string> = [
  'Surah Al-Kahf',                              // ×1 (recitation task)
  'Salawat',                                    // ×100
  'Astaghfirullah',                             // ×100
];

export type RoutinePresetKey = 'morning' | 'evening' | 'night' | 'friday';

/** Every preset key, in seeding order (boot ensurePresets walks this). */
export const ALL_ROUTINE_PRESET_KEYS: ReadonlyArray<RoutinePresetKey> = [
  'morning',
  'evening',
  'night',
  'friday',
];

/** The four presets' Hisn-ul-Muslim item orders, keyed by preset. */
export const ROUTINE_PRESETS: Readonly<
  Record<RoutinePresetKey, ReadonlyArray<string>>
> = {
  morning: ROUTINE_PRESET_ORDER,
  evening: ROUTINE_PRESET_ORDER,
  night: ROUTINE_PRESET_ORDER_NIGHT,
  friday: ROUTINE_PRESET_ORDER_FRIDAY,
};

/**
 * Each preset's day-part schedule (written onto the routine row at creation
 * — routineUtils owns the windows, the DB row just stores the key facts).
 */
export const ROUTINE_PRESET_SCHEDULES: Readonly<
  Record<RoutinePresetKey, RoutineSchedule>
> = {
  morning: { part: 'morning' },
  evening: { part: 'evening' },
  night: { part: 'night' },
  friday: { part: 'any', weekday: 5 },
};

/** Catalog fallback targets for the preset items (defaultTarget per entry). */
const PRESET_FALLBACK_TARGETS: Readonly<Record<string, number>> = {
  'Bismillahilladhi la Yadurru': 3,
  'Radhitu Billahi Rabba': 3,
  'Allahumma Ajirni Minan-Nar': 7,
  'Hasbiyallahu La ilaha illa Huwa': 7,
  'Sayyidul Istighfar': 1,
  "Allahumma A'inni ala Dhikrika": 10,
  'Ayat al-Kursi': 1,
  'Surah Al-Ikhlas': 3,
  'Surah Al-Falaq': 3,
  'Surah An-Nas': 3,
  'Bismika Allahumma Amutu wa Ahya': 1,
  'Allahumma Aslamtu Nafsi Ilayk': 1,
  'Surah Al-Kahf': 1,
};

/** The seeder's own key — case/whitespace-insensitive name match (seed.ts). */
function nameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Resolve ONE preset against the user's EXISTING seeded zikr rows
 * (AC2.1.3 — a routine must never duplicate catalog zikrs into new
 * records). Returns one unresolved entry per preset name that has no live
 * (non-deleted) row; the service refuses creation when any entry is
 * unresolved. Defaults to the morning/evening cluster (the historical
 * signature).
 */
export function resolveRoutinePreset(
  zikrs: Zikr[],
  key: RoutinePresetKey = 'morning'
): { items: RoutineItem[]; unresolved: string[] } {
  const liveByName = new Map<string, Zikr>();
  for (const zikr of zikrs) {
    if (zikr.deletedAt || zikr.id == null) continue;
    liveByName.set(nameKey(zikr.name), zikr);
  }

  const items: RoutineItem[] = [];
  const unresolved: string[] = [];
  for (const name of ROUTINE_PRESETS[key]) {
    const zikr = liveByName.get(nameKey(name));
    if (!zikr || zikr.id == null) {
      unresolved.push(name);
      continue;
    }
    items.push({
      zikrId: zikr.id,
      name: zikr.name,
      target: zikr.defaultTarget ?? PRESET_FALLBACK_TARGETS[name] ?? 33,
    });
  }
  return { items, unresolved };
}

/** Live zikr names that belong to the morning/evening cluster (quiet-offer gate). */
export function hasPresetClusterZikr(zikrs: Zikr[]): boolean {
  const cluster = new Set(ROUTINE_PRESET_ORDER.map(nameKey));
  return zikrs.some(z => !z.deletedAt && cluster.has(nameKey(z.name)));
}

// ---------- Schedule: "which part of the day" (civil, generous windows) ----------

/**
 * Civil day-part windows in MINUTES SINCE LOCAL MIDNIGHT (device clock) —
 * GENEROUS on purpose: this is dhikr, not salat precision. A routine is
 * "current" for most of its part of the day:
 *
 *   morning  03:30–11:29   (before dawn through late morning)
 *   evening  15:00–19:59   (afternoon lull through just before isha)
 *   night    20:00–03:29   (wraps midnight — ends before the fajr approach)
 *   friday   weekday 5, all day (00:00–23:59)
 *
 * The gaps (11:30–14:59 and nothing else) are intentionally unclaimed: no
 * card fires at midday. Wall-clock arithmetic on the device clock keeps the
 * windows correct across DST shifts and travel without any tz math.
 */
export interface RoutineWindow {
  startMinute: number;
  endMinute: number;
}

export const ROUTINE_WINDOWS: Readonly<
  Record<Exclude<RoutineSchedulePart, 'any'>, RoutineWindow>
> = {
  morning: { startMinute: 3 * 60 + 30, endMinute: 11 * 60 + 29 }, // 03:30–11:29
  evening: { startMinute: 15 * 60, endMinute: 19 * 60 + 59 },     // 15:00–19:59
  night: { startMinute: 20 * 60, endMinute: 3 * 60 + 29 },        // 20:00–03:29 (+1d)
};

function minuteOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Which civil part of day an instant belongs to. The three routine windows
 * plus the midday gap between them (11:30–14:59 = 'noon' — real dhikr, but
 * neither the morning nor the evening set).
 */
export function dayPartOfTime(now: Date): DayPart {
  const m = minuteOfDay(now);
  const evening = ROUTINE_WINDOWS.evening;
  const night = ROUTINE_WINDOWS.night;
  const morning = ROUTINE_WINDOWS.morning;
  if (m >= evening.startMinute && m <= evening.endMinute) return 'evening';
  // Night wraps midnight: 20:00–23:59 or 00:00–03:29.
  if (m >= night.startMinute || m <= night.endMinute) return 'night';
  if (m >= morning.startMinute && m <= morning.endMinute) return 'morning';
  return 'noon';
}

/**
 * Prayer-anchored part-of-day choice → the internal scoping part. The
 * manual-entry form offers these labels (localized like the post-salah
 * prayers); the session stores the mapped part. Evening adhkar begin after
 * Asr (Hisn-ul-Muslim), and 'night' exists so the before-sleep preset can
 * be credited — the five prayers alone would never map to it.
 */
export const PRAYER_DAY_PART: Readonly<Record<string, DayPart>> = {
  fajr: 'morning',
  dhuhr: 'noon',
  asr: 'evening',
  maghrib: 'evening',
  isha: 'evening',
  night: 'night',
};

/** Preselect for a known part (the form's default from the clock). */
export const DEFAULT_PRAYER_FOR_PART: Readonly<Record<DayPart, string>> = {
  morning: 'fajr',
  noon: 'dhuhr',
  evening: 'maghrib',
  night: 'night',
};

/**
 * Does one session count toward THIS routine's day-state? The scoping rule:
 *
 *   1. Guided-flow attribution wins — a session attributed to this routine
 *      always counts (the morning set done at noon is still morning's
 *      practice); one attributed to a sibling never does.
 *   2. Unattributed practice is scoped by part of day against the routine's
 *      schedule: explicit `dayPart` first (manual entries carry the user's
 *      prayer-anchored choice), else the session's clock time. Customs (no
 *      schedule) and 'any'-part schedules credit any part; a weekday-bound
 *      schedule (friday) also requires the DAY to match.
 *   3. Legacy rows carry neither field: app sessions derive from their real
 *      timestamp; old manual/physical entries are midnight-normalized (no
 *      time information exists) and stay any-time — history is never
 *      retroactively re-scoped.
 */
export function sessionCountsTowardRoutine(
  session: Session,
  routine: Routine,
  day: string
): boolean {
  if (session.routineId != null) return session.routineId === routine.id;
  if (!routine.schedule) return true;

  if (routine.schedule.weekday != null) {
    const [y, m, d] = day.split('-').map(Number);
    if (new Date(y, m - 1, d).getDay() !== routine.schedule.weekday) return false;
  }
  if (routine.schedule.part === 'any') return true;

  const part: DayPart | null =
    session.dayPart ??
    (session.source === 'app' ? dayPartOfTime(new Date(session.timestamp)) : null);
  return part === null || part === routine.schedule.part;
}

function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function windowStartOn(part: Exclude<RoutineSchedulePart, 'any'>, day: Date): Date {
  const w = ROUTINE_WINDOWS[part];
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, w.startMinute, 0, 0);
}

/**
 * Does the routine's schedule match this instant? Civil windows over the
 * DEVICE clock. A custom routine (no schedule) matches at ANY time. A
 * weekday-bound routine (friday) additionally requires `now.getDay()` to be
 * the bound weekday — and then its part ('any' = the whole day) applies.
 */
export function routineScheduleMatches(
  schedule: RoutineSchedule | undefined,
  now: Date
): boolean {
  if (!schedule) return true; // custom: any time
  if (schedule.weekday != null && now.getDay() !== schedule.weekday) return false;
  if (schedule.part === 'any') return true;
  const w = ROUTINE_WINDOWS[schedule.part];
  const m = minuteOfDay(now);
  // Night wraps midnight: open when at/after the start OR before its
  // next-morning end (03:29 inclusive).
  return w.startMinute <= w.endMinute
    ? m >= w.startMinute && m <= w.endMinute
    : m >= w.startMinute || m <= w.endMinute;
}

/**
 * The instant this schedule's window NEXT opens, at/after `now` (null for
 * always-matching customs). Purely local wall-clock arithmetic — walks at
 * most eight days, which covers every weekly recurrence.
 */
export function routineNextOccurrence(
  schedule: RoutineSchedule,
  now: Date
): Date | null {
  if (schedule.part === 'any' && schedule.weekday == null) return null;
  const day = startOfDay(now);
  for (let i = 0; i < 8; i++) {
    if (i > 0) day.setDate(day.getDate() + 1);
    if (schedule.weekday != null && day.getDay() !== schedule.weekday) continue;
    if (schedule.part === 'any') return new Date(day);
    const start = windowStartOn(schedule.part, day);
    // A window that already opened today either matches now (the caller
    // never asks) or has fully passed — move to the next day.
    if (start.getTime() > now.getTime()) return start;
  }
  return null;
}

/** Machine-readable "which window comes next" key the UI translates. */
export type RoutineNextPart = 'morning' | 'evening' | 'night' | 'friday';

function nextPartOf(schedule: RoutineSchedule): RoutineNextPart | null {
  if (schedule.weekday != null) return 'friday';
  if (schedule.part === 'any') return null;
  return schedule.part;
}

/**
 * Which schedule owns the moment, when several match at once. A time-bound
 * window (morning/evening/night) is fading — it must lead. A weekday-bound
 * all-day schedule (friday) can wait its turn; a custom routine matches
 * every instant, so it yields to both (it is never "going away").
 */
function momentRank(schedule: RoutineSchedule | undefined): number {
  if (!schedule) return 2;
  if (schedule.part === 'any') return 1;
  return 0;
}

/**
 * One entry of the Home "current ritual" derivation (Feature B): the
 * routine plus its today-progress and whether it is NOW or upcoming.
 */
export interface RoutineNowEntry {
  routine: Routine;
  /** 'now' = schedule matches this moment; 'next' = window opens later. */
  when: 'now' | 'next';
  /** Items fully completed today (allocated count at/over target). */
  doneCount: number;
  /** items.length. */
  total: number;
  /** Full done-today state — missing items block (§5.2). */
  doneToday: boolean;
  /** Items whose zikr is soft-deleted (block done-today). */
  missingCount: number;
  /** For 'next' entries: which window the UI's time label names. */
  nextPart?: RoutineNextPart;
}

/**
 * The NOW/NEXT derivation for Home's ritual card, as ONE ordered list:
 *
 *   1. routines whose schedule matches NOW and are NOT done-today,
 *   2. then the currently-matching ones that ARE done-today (kept visible —
 *      reinforcement matters for habit; rendered compactly),
 *   3. then the upcoming scheduled routines, ordered by window start.
 *
 * Tiers 1–2 rank by momentRank (momentRank in the schedule section): the
 * time-bound window leads, the weekday-bound all-day routine (friday)
 * follows, customs last — a friday row must never bury the morning set
 * just because both match at 09:00.
 *
 * Customs (no schedule) always match now, so they land in tiers 1–2 in
 * creation order. Done-state is the single counting truth (§2.3): a
 * day-scoped aggregation over sessions via routineTodayState.
 */
export function routineNowState(
  routines: Routine[],
  sessions: Session[],
  zikrs: Zikr[],
  now: Date
): RoutineNowEntry[] {
  const day = formatDate(now);
  const nowEntries: Array<RoutineNowEntry & { rank: number }> = [];
  const nextEntries: Array<RoutineNowEntry & { nextAt: number }> = [];

  for (const routine of routines) {
    const state = routineTodayState(routine, zikrs, sessions, day);
    const doneCount = state.counts.reduce(
      (n, count, i) => n + (count >= routine.items[i].target ? 1 : 0),
      0
    );
    const base: RoutineNowEntry = {
      routine,
      when: 'now',
      doneCount,
      total: state.total,
      doneToday: state.done,
      missingCount: state.missingCount,
    };
    if (routineScheduleMatches(routine.schedule, now)) {
      nowEntries.push({ ...base, rank: momentRank(routine.schedule) });
    } else if (routine.schedule) {
      const nextAt = routineNextOccurrence(routine.schedule, now);
      const nextPart = nextPartOf(routine.schedule);
      if (nextAt && nextPart) {
        nextEntries.push({ ...base, when: 'next', nextAt: nextAt.getTime(), nextPart });
      }
    }
  }

  // Stable: same-rank entries keep their input (creation) order.
  const byRank = (a: { rank: number }, b: { rank: number }) => a.rank - b.rank;
  const currentUndone = nowEntries.filter(e => !e.doneToday).sort(byRank);
  const currentDone = nowEntries.filter(e => e.doneToday).sort(byRank);
  const upcoming = nextEntries
    .sort((a, b) => a.nextAt - b.nextAt)
    .map(({ nextAt: _nextAt, ...entry }) => entry);
  return [...currentUndone, ...currentDone, ...upcoming];
}

// ---------- The day-context sections (Home routines list) ----------

/**
 * The Home routines section's context groups. Where routineNowState feeds
 * the ONE featured card, this buckets the WHOLE list so the section only
 * shows what the day makes relevant:
 *
 *   now     — schedule matches this moment, not done yet (actionable),
 *             moment-ranked like the ritual card;
 *   upNext  — the single nearest upcoming time-window routine (its label
 *             names the window; everything further out is noise);
 *   done    — completed today, whenever their window is;
 *   anytime — custom routines (no schedule): relevant all day.
 *
 * A weekday-bound all-day routine (friday) appears ONLY on its weekday —
 * on other days it is neither now, next, nor done, and disappears instead
 * of cluttering every other day of the week.
 */
export interface RoutineSections {
  now: Routine[];
  upNext: Array<{ routine: Routine; nextPart: RoutineNextPart; nextAt: Date }>;
  done: Routine[];
  anytime: Routine[];
}

export function routineSections(
  routines: Routine[],
  sessions: Session[],
  zikrs: Zikr[],
  now: Date
): RoutineSections {
  const day = formatDate(now);
  const sections: RoutineSections = { now: [], upNext: [], done: [], anytime: [] };
  const nowRanked: Array<{ routine: Routine; rank: number }> = [];
  const upcoming: Array<{ routine: Routine; nextPart: RoutineNextPart; nextAt: number }> = [];

  for (const routine of routines) {
    if (!routine.schedule) {
      sections.anytime.push(routine);
      continue;
    }
    const doneToday = routineTodayState(routine, zikrs, sessions, day).done;
    if (doneToday) {
      sections.done.push(routine);
    } else if (routineScheduleMatches(routine.schedule, now)) {
      nowRanked.push({ routine, rank: momentRank(routine.schedule) });
    } else if (routine.schedule.weekday != null) {
      // Weekday-bound all-day (friday): irrelevant until the day arrives.
      continue;
    } else {
      const nextAt = routineNextOccurrence(routine.schedule, now);
      const nextPart = nextPartOf(routine.schedule);
      if (nextAt && nextPart) {
        upcoming.push({ routine, nextPart, nextAt: nextAt.getTime() });
      }
    }
  }

  sections.now = nowRanked.sort((a, b) => a.rank - b.rank).map(e => e.routine);
  const nearest = upcoming.sort((a, b) => a.nextAt - b.nextAt)[0];
  if (nearest) {
    sections.upNext = [
      { routine: nearest.routine, nextPart: nearest.nextPart, nextAt: new Date(nearest.nextAt) },
    ];
  }
  return sections;
}

/** Display title: presets localize via presetKey; customs store a user title. */
export function routineDisplayName(
  routine: Pick<Routine, 'source' | 'presetKey' | 'title' | 'items'>
): string {
  if (routine.source === 'custom' && routine.title?.trim()) return routine.title.trim();
  if (routine.source === 'preset' && routine.presetKey) {
    // The caller translates `routine.preset.<key>`; here we can only fall
    // back to the first item's name (pure util — no i18n dependency).
    return routine.items[0]?.name ?? routine.presetKey;
  }
  return routine.items.map(z => z.name).join(' · ');
}

// ---------- Day-scoped derivation (the single counting truth) ----------

/**
 * Per-zikr totals for ONE calendar day that count toward `routine` (pass
 * null/undefined for the unscoped legacy aggregation — tests and callers
 * that mean "everything"). Scoping per sessionCountsTowardRoutine:
 * attributed siblings are excluded and free practice must match the
 * routine's part of day. `countsToGoals: false` sessions are deliberately
 * NOT filtered (§2.3 pin): routine progress is practice, not bookkeeping.
 */
export function routineDayTotals(
  sessions: Session[],
  day: string,
  routine?: Routine | null
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const session of sessions) {
    if (formatDate(new Date(session.date)) !== day) continue;
    if (routine && !sessionCountsTowardRoutine(session, routine, day)) continue;
    totals.set(session.zikrId, (totals.get(session.zikrId) ?? 0) + session.count);
  }
  return totals;
}

/**
 * Each item's count for the day: the item's zikr day-total allocated across
 * duplicate occurrences of the same zikr in routine order (positional, not
 * keyed — AC2.2.2).
 */
export function routineItemCounts(
  routine: Pick<Routine, 'items'>,
  dayTotals: Map<number, number>
): number[] {
  const claimed = new Map<number, number>();
  return routine.items.map(item => {
    const total = dayTotals.get(item.zikrId) ?? 0;
    const before = claimed.get(item.zikrId) ?? 0;
    claimed.set(item.zikrId, before + item.target);
    return Math.max(0, Math.min(item.target, total - before));
  });
}

/** Live (non-deleted) zikr ids — what "resolvable" means for an item. */
export function routineMissingCount(
  routine: Pick<Routine, 'items'>,
  zikrs: Zikr[]
): number {
  const live = new Set(zikrs.filter(z => !z.deletedAt && z.id != null).map(z => z.id!));
  return routine.items.filter(item => !live.has(item.zikrId)).length;
}

/** One glance row's worth of today-state for a routine. */
export interface RoutineTodayState {
  /** Per-item allocated counts for today (routine order). */
  counts: number[];
  /** Every resolvable item at target AND no item missing (missing blocks). */
  done: boolean;
  /** 1-based position: the first incomplete item; total when done. */
  current: number;
  /** items.length. */
  total: number;
  /** Items whose zikr record is soft-deleted (greyed + excluded). */
  missingCount: number;
}

export function routineTodayState(
  routine: Routine,
  zikrs: Zikr[],
  sessions: Session[],
  day: string
): RoutineTodayState {
  const dayTotals = routineDayTotals(sessions, day, routine);
  const counts = routineItemCounts(routine, dayTotals);
  const missingCount = routineMissingCount(routine, zikrs);
  const total = routine.items.length;
  const firstIncomplete = counts.findIndex((count, i) => count < routine.items[i].target);
  const done = total > 0 && missingCount === 0 && firstIncomplete === -1;
  const current = done ? total : firstIncomplete + 1;
  return { counts, done, current, total, missingCount };
}

/**
 * The routine's done predicate for one day (AC2.5.1) — the `hasDay` input
 * R3's shared walk expects. Missing items block while missing.
 */
export function routineDoneOn(
  routine: Routine,
  zikrs: Zikr[],
  sessions: Session[],
  day: string
): boolean {
  if (routine.items.length === 0) return false;
  if (routineMissingCount(routine, zikrs) > 0) return false;
  const dayTotals = routineDayTotals(sessions, day, routine);
  const counts = routineItemCounts(routine, dayTotals);
  return counts.every((count, i) => count >= routine.items[i].target);
}

/**
 * The routine's daily streak — the SAME walk the overall streak uses
 * (AC2.5.1 / AC3.4.2: literally `streakStatus` with a practiced-day
 * predicate over this routine's items). Partial days contribute sessions
 * to the overall streak but never to this number (AC2.5.2 — two separate
 * derivations).
 */
export function routineStreakStatus(
  routine: Routine,
  zikrs: Zikr[],
  sessions: Session[],
  today: Date
): StreakStatus {
  return streakStatus(day => routineDoneOn(routine, zikrs, sessions, day), today);
}

// ---------- The counter flow sequence (§5.2) ----------

/** One countable step of a routine flow (the routineSequence sibling of planSequence). */
export interface RoutineStep {
  /** Routine item index (positional — duplicates stay distinct steps). */
  itemIndex: number;
  target: number;
  zikr: Zikr;
}

/**
 * A routine's countable sequence, in routine order — only items whose zikr
 * record still resolves (a missing zikr cannot be counted; it greys out on
 * Home and BLOCKS done-today, but never enters the counting flow).
 * `todayCounts` is the per-zikr day-total map (routineDayTotals).
 */
export function routineSequence(
  routine: Routine | undefined,
  zikrs: Zikr[],
  todayCounts: Map<number, number>
): RoutineStep[] {
  if (!routine) return [];
  const byId = new Map(zikrs.filter(z => !z.deletedAt && z.id != null).map(z => [z.id!, z]));
  const steps: RoutineStep[] = [];
  const claimed = new Map<number, number>();
  routine.items.forEach((item, itemIndex) => {
    const zikr = byId.get(item.zikrId);
    if (!zikr) return;
    // Allocate the zikr's day total across duplicate occurrences in order,
    // exactly like routineItemCounts — the step's remaining count is what
    // the flow position keys on.
    const before = claimed.get(item.zikrId) ?? 0;
    claimed.set(item.zikrId, before + item.target);
    const allocated = Math.max(
      0,
      Math.min(item.target, (todayCounts.get(item.zikrId) ?? 0) - before)
    );
    steps.push({ itemIndex, target: Math.max(0, item.target - allocated), zikr });
  });
  return steps;
}
