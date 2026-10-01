// R2 routine pure logic (docs/solution-design.md §2.3, §5; AC2.x):
//   - done-today = day-scoped aggregation over sessions, SCOPED per routine
//     (own guided-flow saves always count; free practice must match the
//     routine's part of day — so the morning preset never completes the
//     evening preset's identical items)
//   - the countsToGoals=false PIN (routine progress ≠ goal bookkeeping)
//   - duplicate zikr occurrences allocate the day total positionally
//   - a soft-deleted zikr is excluded from counting and BLOCKS done-today
//   - the Hisn-ul-Muslim preset order + counts
//   - bounds; routine streak via the R3 walk (streakStatus parity)
import { describe, it, expect } from 'vitest';

import {
  MAX_ROUTINES,
  MAX_ROUTINE_ITEMS,
  dayPartOfTime,
  hasPresetClusterZikr,
  resolveRoutinePreset,
  ROUTINE_PRESETS,
  ROUTINE_PRESET_SCHEDULES,
  ROUTINE_WINDOWS,
  PRAYER_DAY_PART,
  routineDayTotals,
  routineDraftIssue,
  routineDoneOn,
  routineItemCounts,
  routineMissingCount,
  routineNextOccurrence,
  routineNowState,
  routineScheduleMatches,
  routineSections,
  routineSequence,
  routineStreakStatus,
  routineTodayState,
  sessionCountsTowardRoutine,
} from '../../../src/core/utils/routineUtils';
import { formatDate } from '../../../src/core/utils/dateUtils';
import { Routine, Session, Zikr } from '../../../src/core/db/types';

function zikr(id: number, name = `Zikr ${id}`, deletedAt?: Date): Zikr {
  return { id, name, custom: false, createdAt: new Date(), deletedAt };
}

function session(
  zikrId: number,
  count: number,
  date: Date,
  extra: Partial<Session> = {}
): Session {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return {
    id: Math.floor(Math.random() * 1e9),
    zikrId,
    count,
    source: 'app',
    timestamp: date,
    date: midnight,
    editableUntil: new Date(),
    createdAt: date,
    updatedAt: date,
    ...extra,
  };
}

function routine(items: Array<{ zikrId: number; target: number }>): Routine {
  return {
    id: 'r1',
    source: 'custom',
    title: 'Test routine',
    items: items.map(i => ({ ...i, name: `Zikr ${i.zikrId}` })),
    createdAt: new Date(),
  };
}

const TODAY = new Date('2026-09-20T10:00:00');
const TODAY_STR = '2026-09-20';
const YESTERDAY = new Date('2026-09-19T10:00:00');

describe('routineDayTotals — day-scoped, all sources (AC2.3.5)', () => {
  it('aggregates every source of the same zikr on the same day only', () => {
    const sessions = [
      session(1, 20, TODAY, { source: 'app' }),
      session(1, 10, TODAY, { source: 'manual' }),
      session(1, 3, TODAY, { source: 'physical' }),
      session(1, 100, YESTERDAY), // other day — excluded
      session(2, 50, TODAY), // other zikr — separate key
    ];
    const totals = routineDayTotals(sessions, TODAY_STR);
    expect(totals.get(1)).toBe(33);
    expect(totals.get(2)).toBe(50);
    expect(totals.get(3)).toBeUndefined();
  });

  it('PIN: countsToGoals=false sessions still count toward a routine', () => {
    // §2.3: a routine measures dhikr performed, not goal bookkeeping —
    // deliberately asymmetric with planRingProgress's filter. Flipping this
    // (§13.3) must be a one-line change here, caught by this vector.
    const sessions = [
      session(1, 33, TODAY, { countsToGoals: false }),
      session(1, 33, TODAY, { countsToGoals: true }),
    ];
    expect(routineDayTotals(sessions, TODAY_STR).get(1)).toBe(66);
  });
});

describe('routineItemCounts — duplicate zikrs are positional (AC2.2.2)', () => {
  it('allocates a zikr day total across occurrences in routine order', () => {
    const r = routine([
      { zikrId: 1, target: 33 },
      { zikrId: 2, target: 10 },
      { zikrId: 1, target: 33 }, // same zikr again, independent count
    ]);
    const totals = routineDayTotals([session(1, 40, TODAY)], TODAY_STR);
    // First occurrence claims up to its target; the second gets the rest.
    expect(routineItemCounts(r, totals)).toEqual([33, 0, 7]);
  });

  it('under-allocates when the day total is below the first target', () => {
    const r = routine([
      { zikrId: 1, target: 33 },
      { zikrId: 1, target: 33 },
    ]);
    const totals = routineDayTotals([session(1, 20, TODAY)], TODAY_STR);
    expect(routineItemCounts(r, totals)).toEqual([20, 0]);
  });
});

describe('routineTodayState / routineDoneOn', () => {
  it('is done only when EVERY item reached its count (partial day is not done, AC2.5.2)', () => {
    const r = routine([
      { zikrId: 1, target: 33 },
      { zikrId: 2, target: 10 },
    ]);
    const zikrs = [zikr(1), zikr(2)];
    const partial = [session(1, 33, TODAY)];
    const state = routineTodayState(r, zikrs, partial, TODAY_STR);
    expect(state.done).toBe(false);
    expect(state.current).toBe(2); // first incomplete is item 2
    expect(routineDoneOn(r, zikrs, partial, TODAY_STR)).toBe(false);

    const full = [...partial, session(2, 10, TODAY)];
    expect(routineTodayState(r, zikrs, full, TODAY_STR).done).toBe(true);
    expect(routineDoneOn(r, zikrs, full, TODAY_STR)).toBe(true);
  });

  it('a soft-deleted zikr is excluded from counting and BLOCKS done (§5.2)', () => {
    const r = routine([
      { zikrId: 1, target: 33 },
      { zikrId: 2, target: 10 }, // this zikr gets soft-deleted
    ]);
    const zikrs = [zikr(1), zikr(2, 'Zikr 2', new Date())];
    const sessions = [session(1, 100, TODAY), session(2, 100, TODAY)];
    const state = routineTodayState(r, zikrs, sessions, TODAY_STR);
    expect(state.missingCount).toBe(1);
    expect(state.done).toBe(false); // never done while an item is missing
    expect(routineMissingCount(r, zikrs)).toBe(1);
  });

  it('counts the same zikr counted outside the routine (plain counter, manual, group row)', () => {
    const r = routine([{ zikrId: 1, target: 33 }]);
    const zikrs = [zikr(1)];
    const sessions = [
      session(1, 20, TODAY, { source: 'app' }),
      session(1, 10, TODAY, { source: 'manual' }),
      session(1, 3, TODAY, { source: 'physical' }),
    ];
    const state = routineTodayState(r, zikrs, sessions, TODAY_STR);
    expect(state.done).toBe(true);
    expect(state.current).toBe(1); // total when done
    expect(state.total).toBe(1);
  });
});

describe('routine scoping — attribution + part of day (the morning/evening fix)', () => {
  // The presets share one item set resolved to the SAME zikr rows; a custom
  // fixture stands in for each side.
  const morningRoutine: Routine = {
    ...routine([{ zikrId: 1, target: 33 }]),
    id: 'morning',
    schedule: { part: 'morning' },
  };
  const eveningRoutine: Routine = {
    ...routine([{ zikrId: 1, target: 33 }]),
    id: 'evening',
    schedule: { part: 'evening' },
  };
  const zikrs = [zikr(1)];

  it('a guided morning save completes morning — and never the evening preset', () => {
    // One session, attributed to the morning flow (this is what completing
    // the morning routine writes). Morning is done; evening stays pending.
    const sessions = [session(1, 33, TODAY, { routineId: 'morning' })];
    expect(routineTodayState(morningRoutine, zikrs, sessions, TODAY_STR).done).toBe(true);
    expect(routineTodayState(eveningRoutine, zikrs, sessions, TODAY_STR).done).toBe(false);
    expect(routineDayTotals(sessions, TODAY_STR, eveningRoutine).get(1)).toBeUndefined();
  });

  it('a guided save counts toward its own routine regardless of wall clock', () => {
    // Morning set completed at 13:00 (outside its window) still credits
    // morning — attribution outranks the clock.
    const atNoon = session(1, 33, TODAY, { routineId: 'morning', timestamp: new Date('2026-09-20T13:00:00') });
    expect(sessionCountsTowardRoutine(atNoon, morningRoutine, TODAY_STR)).toBe(true);
  });

  it('free practice scopes by explicit dayPart: a Fajr entry credits morning, not evening', () => {
    const sessions = [session(1, 33, TODAY, { source: 'manual', dayPart: 'morning' })];
    expect(routineTodayState(morningRoutine, zikrs, sessions, TODAY_STR).done).toBe(true);
    expect(routineTodayState(eveningRoutine, zikrs, sessions, TODAY_STR).done).toBe(false);
  });

  it('an Isha entry (dayPart evening) credits evening, not the night preset', () => {
    const nightRoutine: Routine = {
      ...routine([{ zikrId: 1, target: 33 }]),
      id: 'night',
      schedule: { part: 'night' },
    };
    const sessions = [session(1, 33, TODAY, { source: 'manual', dayPart: 'evening' })];
    expect(routineTodayState(eveningRoutine, zikrs, sessions, TODAY_STR).done).toBe(true);
    expect(routineTodayState(nightRoutine, zikrs, sessions, TODAY_STR).done).toBe(false);
  });

  it('a Dhuhr entry (dayPart noon) credits no scheduled preset — but customs stay any-time', () => {
    const custom = routine([{ zikrId: 1, target: 33 }]);
    const sessions = [session(1, 33, TODAY, { source: 'manual', dayPart: 'noon' })];
    expect(routineTodayState(morningRoutine, zikrs, sessions, TODAY_STR).done).toBe(false);
    expect(routineTodayState(eveningRoutine, zikrs, sessions, TODAY_STR).done).toBe(false);
    expect(routineTodayState(custom, zikrs, sessions, TODAY_STR).done).toBe(true);
  });

  it('unattributed app sessions derive the part from their clock time', () => {
    // 16:00 is inside the evening window (15:00–19:59): counts toward
    // evening, not morning.
    const atFour = session(1, 33, TODAY, { timestamp: new Date('2026-09-20T16:00:00') });
    expect(sessionCountsTowardRoutine(atFour, eveningRoutine, TODAY_STR)).toBe(true);
    expect(sessionCountsTowardRoutine(atFour, morningRoutine, TODAY_STR)).toBe(false);
  });

  it('legacy manual rows (no dayPart, midnight-normalized) stay any-time', () => {
    const sessions = [session(1, 33, TODAY, { source: 'manual' })]; // timestamp at midnight
    expect(routineTodayState(morningRoutine, zikrs, sessions, TODAY_STR).done).toBe(true);
    expect(routineTodayState(eveningRoutine, zikrs, sessions, TODAY_STR).done).toBe(true);
  });

  it('an explicit dayPart can always be re-scoped later (history edit)', () => {
    const legacy = session(1, 33, TODAY, { source: 'manual' });
    expect(sessionCountsTowardRoutine(legacy, eveningRoutine, TODAY_STR)).toBe(true);
    const scoped = { ...legacy, dayPart: 'morning' as const };
    expect(sessionCountsTowardRoutine(scoped, eveningRoutine, TODAY_STR)).toBe(false);
    expect(sessionCountsTowardRoutine(scoped, morningRoutine, TODAY_STR)).toBe(true);
  });

  it('the friday preset checks the weekday, then credits any part that day', () => {
    const friday: Routine = {
      ...routine([{ zikrId: 1, target: 100 }]),
      id: 'friday',
      schedule: { part: 'any', weekday: 5 },
    };
    const fridaySession = session(1, 100, new Date('2026-09-25T11:00:00'), { dayPart: 'noon' });
    expect(sessionCountsTowardRoutine(fridaySession, friday, '2026-09-25')).toBe(true);
    // Same instant one day earlier (Thursday): weekday gate excludes it.
    const thursdaySession = session(1, 100, new Date('2026-09-24T11:00:00'), { dayPart: 'noon' });
    expect(sessionCountsTowardRoutine(thursdaySession, friday, '2026-09-24')).toBe(false);
  });
});

describe('dayPartOfTime — the civil parts tile the day (windows + the noon gap)', () => {
  it('maps the windows and the midday gap', () => {
    expect(dayPartOfTime(new Date('2026-09-20T04:00:00'))).toBe('morning');
    expect(dayPartOfTime(new Date('2026-09-20T11:29:00'))).toBe('morning');
    expect(dayPartOfTime(new Date('2026-09-20T11:30:00'))).toBe('noon');
    expect(dayPartOfTime(new Date('2026-09-20T14:59:00'))).toBe('noon');
    expect(dayPartOfTime(new Date('2026-09-20T15:00:00'))).toBe('evening');
    expect(dayPartOfTime(new Date('2026-09-20T19:59:00'))).toBe('evening');
    expect(dayPartOfTime(new Date('2026-09-20T20:00:00'))).toBe('night');
    // Night wraps midnight.
    expect(dayPartOfTime(new Date('2026-09-20T23:59:00'))).toBe('night');
    expect(dayPartOfTime(new Date('2026-09-20T01:00:00'))).toBe('night');
  });

  it('the manual-entry prayer mapping lands on the scoping parts', () => {
    expect(PRAYER_DAY_PART.fajr).toBe('morning');
    expect(PRAYER_DAY_PART.dhuhr).toBe('noon');
    expect(PRAYER_DAY_PART.asr).toBe('evening');
    expect(PRAYER_DAY_PART.maghrib).toBe('evening');
    expect(PRAYER_DAY_PART.isha).toBe('evening');
    expect(PRAYER_DAY_PART.night).toBe('night');
  });
});

describe('routineStreakStatus — the R3 walk over a practiced-day predicate (AC2.5.1/AC3.4.2)', () => {
  const r = routine([{ zikrId: 1, target: 33 }]);
  const zikrs = [zikr(1)];

  it('counts consecutive done days; a partial day never counts as done', () => {
    const sessions = [
      session(1, 33, new Date('2026-09-18T10:00:00')),
      // 19th: only partial (10 of 33) — counts for the overall streak,
      // NOT as a done routine day (AC2.5.2)…
      session(1, 10, YESTERDAY),
      session(1, 33, TODAY),
    ];
    const status = routineStreakStatus(r, zikrs, sessions, TODAY);
    // …and as an interior single gap it is forgiven by the shared walk
    // (18th done → the 19th miss is skipped → today + 18th = 2).
    expect(status.value).toBe(2);
    expect(status.mode).toBe('normal');
  });

  it('applies the trailing-edge single-gap grace identically (P−P → 2)', () => {
    // Today unpracticed; yesterday done; the day before yesterday missed;
    // the 17th done — the walk anchors at yesterday and skips the one gap.
    const sessions = [
      session(1, 33, new Date('2026-09-17T10:00:00')),
      session(1, 33, YESTERDAY),
    ];
    const status = routineStreakStatus(r, zikrs, sessions, TODAY);
    expect(status.value).toBe(2);
  });

  it('a double gap ends the routine streak with fresh-break framing', () => {
    const sessions = [
      session(1, 33, new Date('2026-09-15T10:00:00')),
      // 16th–today all missed → the trailing double gap stops the walk at 0.
    ];
    const status = routineStreakStatus(r, zikrs, sessions, TODAY);
    expect(status.value).toBe(0);
    expect(status.mode).toBe('fresh-break');
  });

  it('a missing item blocks the day predicate while missing', () => {
    const liveZikrs = [zikr(1)];
    const sessions = [
      session(1, 33, YESTERDAY),
      session(1, 33, TODAY),
    ];
    expect(routineDoneOn(r, liveZikrs, sessions, TODAY_STR)).toBe(true);

    // Item zikr soft-deleted → done-today blocks (AC §5.4 failure state).
    const deleted = [zikr(1, 'Zikr 1', new Date())];
    expect(routineDoneOn(r, deleted, sessions, TODAY_STR)).toBe(false);
  });
});

describe('resolveRoutinePreset — Hisn-ul-Muslim order, catalog counts (AC2.1.1/2.1.3)', () => {
  const seeded: Zikr[] = [
    // Deliberately NOT in liturgical order, names padded to prove the
    // case/whitespace-insensitive match (the seeder's own key).
    { id: 10, name: 'Sayyidul Istighfar', custom: false, createdAt: new Date(), defaultTarget: 1 },
    { id: 11, name: '  bismillahilladhi la yadurru ', custom: false, createdAt: new Date(), defaultTarget: 3 },
    { id: 12, name: 'Radhitu Billahi Rabba', custom: false, createdAt: new Date(), defaultTarget: 3 },
    { id: 13, name: 'Allahumma Ajirni Minan-Nar', custom: false, createdAt: new Date(), defaultTarget: 7 },
    { id: 14, name: 'Hasbiyallahu La ilaha illa Huwa', custom: false, createdAt: new Date(), defaultTarget: 7 },
    { id: 15, name: "Allahumma A'inni ala Dhikrika", custom: false, createdAt: new Date(), defaultTarget: 10 },
  ];

  it('resolves the six items in Hisn-ul-Muslim order with defaultTarget counts', () => {
    const { items, unresolved } = resolveRoutinePreset(seeded);
    expect(unresolved).toEqual([]);
    // Denormalized names are the matched rows' own names — compare
    // case/whitespace-insensitively (the seeder's key).
    expect(items.map(i => i.name.trim().toLowerCase())).toEqual(
      [
        'Bismillahilladhi la Yadurru',
        'Radhitu Billahi Rabba',
        'Allahumma Ajirni Minan-Nar',
        'Hasbiyallahu La ilaha illa Huwa',
        'Sayyidul Istighfar',
        "Allahumma A'inni ala Dhikrika",
      ].map(n => n.toLowerCase())
    );
    expect(items.map(i => i.target)).toEqual([3, 3, 7, 7, 1, 10]);
    expect(items.map(i => i.zikrId)).toEqual([11, 12, 13, 14, 10, 15]);
  });

  it('reports unresolved names instead of silently shortening the liturgy', () => {
    // Only Sayyidul Istighfar, Bismillahilladhi and Radhitu rows exist.
    const { items, unresolved } = resolveRoutinePreset(seeded.slice(0, 3));
    expect(items).toHaveLength(3);
    expect(unresolved).toEqual([
      'Allahumma Ajirni Minan-Nar',
      'Hasbiyallahu La ilaha illa Huwa',
      "Allahumma A'inni ala Dhikrika",
    ]);
  });

  it('ignores soft-deleted rows (a deleted zikr cannot anchor the preset)', () => {
    const withDeleted = [
      ...seeded.slice(0, 5),
      { ...seeded[5], deletedAt: new Date() },
    ];
    const { unresolved } = resolveRoutinePreset(withDeleted);
    expect(unresolved).toContain("Allahumma A'inni ala Dhikrika");
  });

  it('detects cluster zikrs for the quiet offer gate', () => {
    expect(hasPresetClusterZikr(seeded)).toBe(true);
    expect(hasPresetClusterZikr([zikr(1, 'SubhanAllah')])).toBe(false);
  });
});

describe('routineDraftIssue — bounds (OQ-4)', () => {
  it('accepts up to 12 items and 5 routines', () => {
    expect(routineDraftIssue({ itemCount: 12, routineCount: 5 })).toBe('too-many-routines');
    expect(routineDraftIssue({ itemCount: 12, routineCount: 4 })).toBeNull();
    expect(routineDraftIssue({ itemCount: 6, routineCount: MAX_ROUTINES - 1 })).toBeNull();
  });

  it('rejects beyond the bounds and empty drafts', () => {
    expect(routineDraftIssue({ itemCount: MAX_ROUTINE_ITEMS + 1, routineCount: 0 })).toBe('too-many-items');
    expect(routineDraftIssue({ itemCount: 1, routineCount: MAX_ROUTINES })).toBe('too-many-routines');
    expect(routineDraftIssue({ itemCount: 0, routineCount: 0 })).toBe('empty');
  });
});

describe('routineSequence — the flow steps (§5.2)', () => {
  it('excludes missing zikrs and carries the REMAINING count as the step target', () => {
    const r = routine([
      { zikrId: 1, target: 33 },
      { zikrId: 2, target: 10 }, // soft-deleted
      { zikrId: 3, target: 7 },
    ]);
    const zikrs = [zikr(1), zikr(2, 'Zikr 2', new Date()), zikr(3)];
    const sessions = [session(1, 20, TODAY)];
    const totals = routineDayTotals(sessions, TODAY_STR);

    const steps = routineSequence(r, zikrs, totals);
    expect(steps).toHaveLength(2); // missing zikr 2 excluded from counting
    expect(steps[0].zikr.id).toBe(1);
    expect(steps[0].target).toBe(13); // 33 − 20 already logged today
    expect(steps[1].zikr.id).toBe(3);
    expect(steps[1].target).toBe(7);
  });

  it('a completed item leaves the flow position past it (resume, AC2.3.2)', () => {
    const r = routine([
      { zikrId: 1, target: 33 },
      { zikrId: 2, target: 10 },
    ]);
    const zikrs = [zikr(1), zikr(2)];
    const sessions = [session(1, 33, TODAY)];
    const steps = routineSequence(r, zikrs, routineDayTotals(sessions, TODAY_STR));
    const position = steps.findIndex(step => step.target > 0);
    expect(steps[position].zikr.id).toBe(2); // next incomplete
  });

  it('respects today from formatDate conventions', () => {
    expect(formatDate(TODAY)).toBe(TODAY_STR);
  });
});

// ---------- Schedule: civil windows + the NOW/NEXT derivation ----------

/** Sunday 2026-09-20 (getDay()=0); Friday is 2026-09-25, Thursday 09-24. */
function at(day: number, hour: number, minute: number, month = 8): Date {
  return new Date(2026, month, day, hour, minute, 0, 0);
}

function presetRoutine(key: 'morning' | 'evening' | 'night' | 'friday', items: Array<{ zikrId: number; target: number }>): Routine {
  return {
    id: `routine-${key}`,
    source: 'preset',
    presetKey: key,
    schedule: ROUTINE_PRESET_SCHEDULES[key],
    items: items.map(i => ({ ...i, name: `Zikr ${i.zikrId}` })),
    createdAt: new Date(),
  };
}

describe('routineScheduleMatches — civil window boundaries (documented constants)', () => {
  const morning = ROUTINE_PRESET_SCHEDULES.morning;
  const evening = ROUTINE_PRESET_SCHEDULES.evening;
  const night = ROUTINE_PRESET_SCHEDULES.night;
  const friday = ROUTINE_PRESET_SCHEDULES.friday;
  const SUNDAY = 20; // 2026-09-20

  it('morning: opens at 03:30 (not 03:29), closes after 11:29 (not 11:30)', () => {
    expect(ROUTINE_WINDOWS.morning).toEqual({ startMinute: 3 * 60 + 30, endMinute: 11 * 60 + 29 });
    expect(routineScheduleMatches(morning, at(SUNDAY, 3, 29))).toBe(false);
    expect(routineScheduleMatches(morning, at(SUNDAY, 3, 30))).toBe(true);
    expect(routineScheduleMatches(morning, at(SUNDAY, 11, 29))).toBe(true);
    expect(routineScheduleMatches(morning, at(SUNDAY, 11, 30))).toBe(false);
  });

  it('evening: opens at 15:00 (not 14:59), closes after 19:59 (not 20:00)', () => {
    expect(routineScheduleMatches(evening, at(SUNDAY, 14, 59))).toBe(false);
    expect(routineScheduleMatches(evening, at(SUNDAY, 15, 0))).toBe(true);
    expect(routineScheduleMatches(evening, at(SUNDAY, 19, 59))).toBe(true);
    expect(routineScheduleMatches(evening, at(SUNDAY, 20, 0))).toBe(false);
  });

  it('night: opens at 20:00 and WRAPS midnight to 03:29 next morning', () => {
    expect(routineScheduleMatches(night, at(SUNDAY, 19, 59))).toBe(false);
    expect(routineScheduleMatches(night, at(SUNDAY, 20, 0))).toBe(true);
    expect(routineScheduleMatches(night, at(SUNDAY, 23, 59))).toBe(true);
    expect(routineScheduleMatches(night, at(SUNDAY + 1, 0, 0))).toBe(true); // past-midnight wrap
    expect(routineScheduleMatches(night, at(SUNDAY + 1, 3, 29))).toBe(true);
    expect(routineScheduleMatches(night, at(SUNDAY + 1, 3, 30))).toBe(false);
  });

  it('friday: weekday-bound (5) and part any — all day Friday, never other days', () => {
    expect(routineScheduleMatches(friday, at(25, 0, 0))).toBe(true);   // Friday 00:00
    expect(routineScheduleMatches(friday, at(25, 12, 0))).toBe(true);  // Friday noon
    expect(routineScheduleMatches(friday, at(25, 23, 59))).toBe(true); // Friday end
    expect(routineScheduleMatches(friday, at(24, 10, 0))).toBe(false); // Thursday
    expect(routineScheduleMatches(friday, at(26, 10, 0))).toBe(false); // Saturday
  });

  it('a custom routine (no schedule) matches at ANY time', () => {
    expect(routineScheduleMatches(undefined, at(SUNDAY, 2, 0))).toBe(true);
    expect(routineScheduleMatches(undefined, at(SUNDAY, 13, 0))).toBe(true);
  });

  it('the midday gap (11:30–14:59) matches nothing scheduled', () => {
    expect(routineScheduleMatches(morning, at(SUNDAY, 13, 0))).toBe(false);
    expect(routineScheduleMatches(evening, at(SUNDAY, 13, 0))).toBe(false);
    expect(routineScheduleMatches(night, at(SUNDAY, 13, 0))).toBe(false);
  });
});

describe('routineNextOccurrence — upcoming window starts', () => {
  it('a passed window rolls to tomorrow (morning at 13:00 → tomorrow 03:30)', () => {
    const next = routineNextOccurrence(ROUTINE_PRESET_SCHEDULES.morning, at(20, 13, 0))!;
    expect(formatDate(next)).toBe('2026-09-21');
    expect(next.getHours()).toBe(3);
    expect(next.getMinutes()).toBe(30);
  });

  it('a not-yet-open window starts today (evening at 13:00 → today 15:00)', () => {
    const next = routineNextOccurrence(ROUTINE_PRESET_SCHEDULES.evening, at(20, 13, 0))!;
    expect(formatDate(next)).toBe('2026-09-20');
    expect(next.getHours()).toBe(15);
  });

  it('night at 13:00 → today 20:00', () => {
    const next = routineNextOccurrence(ROUTINE_PRESET_SCHEDULES.night, at(20, 13, 0))!;
    expect(next.getHours()).toBe(20);
  });

  it('a weekday-bound routine rolls to the next matching weekday at 00:00', () => {
    // Sunday 22:00 → next Friday (2026-09-25) 00:00.
    const next = routineNextOccurrence(ROUTINE_PRESET_SCHEDULES.friday, at(20, 22, 0))!;
    expect(next.getDay()).toBe(5);
    expect(formatDate(next)).toBe('2026-09-25');
    expect(next.getHours()).toBe(0);
  });
});

describe('routineNowState — now / done / next ordering', () => {
  const zikrs = [zikr(1), zikr(2), zikr(3)];

  const morningRoutine = presetRoutine('morning', [
    { zikrId: 1, target: 3 },
    { zikrId: 2, target: 3 },
  ]);
  const eveningRoutine = presetRoutine('evening', [{ zikrId: 3, target: 7 }]);
  const customRoutine: Routine = {
    id: 'routine-custom',
    source: 'custom',
    title: 'My set',
    items: [{ zikrId: 2, name: 'Zikr 2', target: 10 }],
    createdAt: new Date(),
  };

  it('orders current-undone, then current-done, then next-upcoming', () => {
    // Sunday 07:00: morning matches (undone); custom matches (done); evening is next.
    const sessions = [session(2, 10, at(20, 7, 0))]; // custom's item complete today
    const entries = routineNowState(
      [morningRoutine, customRoutine, eveningRoutine],
      sessions,
      zikrs,
      at(20, 7, 0)
    );
    expect(entries.map(e => e.routine.id)).toEqual([
      'routine-morning', // now, undone first
      'routine-custom',  // now, done-today second (still visible — reinforcement)
      'routine-evening', // next-upcoming last
    ]);
    expect(entries[0].when).toBe('now');
    expect(entries[1].when).toBe('now');
    expect(entries[1].doneToday).toBe(true);
    expect(entries[2].when).toBe('next');
    expect(entries[2].nextPart).toBe('evening');
  });

  it('carries done count / total items ("3/9" progress)', () => {
    // Nine-item night routine, first two items complete (3×3).
    const nightRoutine = presetRoutine('night', [
      { zikrId: 1, target: 3 },
      { zikrId: 1, target: 3 },
      { zikrId: 2, target: 3 },
    ]);
    const sessions = [session(1, 6, at(20, 21, 0))];
    const entries = routineNowState([nightRoutine], sessions, zikrs, at(20, 21, 0));
    expect(entries).toHaveLength(1);
    expect(entries[0].doneCount).toBe(2);
    expect(entries[0].total).toBe(3);
    expect(entries[0].doneToday).toBe(false);
  });

  it('upcoming routines sort by window start (evening 15:00 < night 20:00 < passed morning)', () => {
    const entries = routineNowState(
      [morningRoutine, eveningRoutine, presetRoutine('night', [{ zikrId: 3, target: 1 }])],
      [],
      zikrs,
      at(20, 13, 0) // midday gap — nothing is current
    );
    expect(entries.map(e => e.nextPart)).toEqual(['evening', 'night', 'morning']);
    expect(entries.every(e => e.when === 'next')).toBe(true);
  });

  it('a done-today routine that is current still renders (compact done), morning next-up', () => {
    // Night done today at 23:00; morning next at 03:30 — the DONE night
    // routine is current (tier 2), morning is upcoming.
    const sessions = [session(1, 10, at(20, 23, 0)), session(2, 10, at(20, 23, 0))];
    const entries = routineNowState(
      [morningRoutine, nightDone],
      sessions,
      zikrs,
      at(20, 23, 0)
    );
    expect(entries[0].routine.id).toBe('routine-night');
    expect(entries[0].doneToday).toBe(true);
    // Morning is next-up (tomorrow's fajr approach).
    expect(entries[1].nextPart).toBe('morning');
  });

  const nightDone = presetRoutine('night', [
    { zikrId: 1, target: 10 },
    { zikrId: 2, target: 10 },
  ]);

  it('friday appears as current all Friday and as next before it', () => {
    const fridayRoutine = presetRoutine('friday', [{ zikrId: 1, target: 100 }]);
    // Thursday 22:00 → friday is next (Friday 00:00, before morning 03:30).
    const entries = routineNowState(
      [morningRoutine, fridayRoutine],
      [],
      zikrs,
      at(24, 22, 0)
    );
    expect(entries.map(e => e.nextPart)).toEqual(['friday', 'morning']);

    // Friday itself → friday is current (all-day window). At 22:00 morning
    // is no longer current (its window passed) — it shows as upcoming.
    const onFriday = routineNowState([morningRoutine, fridayRoutine], [], zikrs, at(25, 22, 0));
    expect(onFriday).toHaveLength(2);
    expect(onFriday[0].routine.id).toBe('routine-friday');
    expect(onFriday[0].when).toBe('now');
    expect(onFriday[1].when).toBe('next');
  });

  it('a time-bound window outranks the friday all-day match, whatever the creation order', () => {
    // Friday 09:00: both morning and friday match and are undone. The
    // fading morning window owns the moment; friday (all day) follows —
    // even though friday comes FIRST in the list here.
    const fridayRoutine = presetRoutine('friday', [{ zikrId: 1, target: 100 }]);
    const entries = routineNowState([fridayRoutine, morningRoutine], [], zikrs, at(25, 9, 0));
    expect(entries.map(e => e.routine.id)).toEqual(['routine-morning', 'routine-friday']);
    expect(entries.every(e => e.when === 'now')).toBe(true);
  });
});

describe('routineSections — the day-context groups (Now / Up next / Done / Anytime)', () => {
  const zikrs = [zikr(1), zikr(2), zikr(3)];
  const morningRoutine = presetRoutine('morning', [{ zikrId: 1, target: 3 }]);
  const eveningRoutine = presetRoutine('evening', [{ zikrId: 2, target: 7 }]);
  const nightRoutine = presetRoutine('night', [{ zikrId: 3, target: 1 }]);
  const fridayRoutine = presetRoutine('friday', [{ zikrId: 1, target: 100 }]);
  const customRoutine: Routine = {
    id: 'routine-custom',
    source: 'custom',
    title: 'My set',
    items: [{ zikrId: 2, name: 'Zikr 2', target: 10 }],
    createdAt: new Date(),
  };

  it('Wednesday morning: morning is Now, evening is the single Up next, friday hides', () => {
    const sections = routineSections(
      [morningRoutine, eveningRoutine, nightRoutine, fridayRoutine],
      [],
      zikrs,
      at(23, 10, 0) // Wednesday 10:00
    );
    expect(sections.now.map(r => r.id)).toEqual(['routine-morning']);
    expect(sections.upNext).toHaveLength(1);
    expect(sections.upNext[0].routine.id).toBe('routine-evening');
    expect(sections.upNext[0].nextPart).toBe('evening');
    expect(formatDate(sections.upNext[0].nextAt)).toBe('2026-09-23');
    expect(sections.upNext[0].nextAt.getHours()).toBe(15);
    expect(sections.done).toEqual([]);
    expect(sections.anytime).toEqual([]);
    // The weekday-bound all-day routine vanishes on non-Friday days.
    const ids = [
      ...sections.now,
      ...sections.upNext.map(u => u.routine),
      ...sections.done,
      ...sections.anytime,
    ].map(r => r.id);
    expect(ids).not.toContain('routine-friday');
  });

  it('Friday morning: friday matches too, but the fading morning window ranks first', () => {
    const sections = routineSections(
      [fridayRoutine, morningRoutine, eveningRoutine],
      [],
      zikrs,
      at(25, 9, 0)
    );
    expect(sections.now.map(r => r.id)).toEqual(['routine-morning', 'routine-friday']);
  });

  it('Friday midday gap: only friday owns the moment (evening is Up next)', () => {
    const sections = routineSections(
      [morningRoutine, eveningRoutine, fridayRoutine],
      [],
      zikrs,
      at(25, 13, 0)
    );
    expect(sections.now.map(r => r.id)).toEqual(['routine-friday']);
    expect(sections.upNext[0].routine.id).toBe('routine-evening');
  });

  it('night at 21:30 is Now; the nearest Up next is tomorrow morning, not evening', () => {
    const sections = routineSections(
      [morningRoutine, eveningRoutine, nightRoutine],
      [],
      zikrs,
      at(23, 21, 30)
    );
    expect(sections.now.map(r => r.id)).toEqual(['routine-night']);
    expect(sections.upNext).toHaveLength(1);
    expect(sections.upNext[0].nextPart).toBe('morning');
    expect(formatDate(sections.upNext[0].nextAt)).toBe('2026-09-24');
  });

  it('a completed scheduled routine lands in Done whatever its window', () => {
    const sessions = [session(1, 3, at(23, 7, 0))]; // morning item complete
    const sections = routineSections(
      [morningRoutine, eveningRoutine, customRoutine],
      sessions,
      zikrs,
      at(23, 10, 0)
    );
    expect(sections.done.map(r => r.id)).toEqual(['routine-morning']);
    expect(sections.now).toEqual([]);
    // Customs never leave Anytime — their row shows its own done state.
    expect(sections.anytime.map(r => r.id)).toEqual(['routine-custom']);
    expect(sections.upNext[0].routine.id).toBe('routine-evening');
  });
});

describe('ROUTINE_PRESETS — the four Hisn-ul-Muslim preset sets', () => {
  it('keeps the four presets with their day-part schedules', () => {
    expect(ROUTINE_PRESETS.morning).toHaveLength(6);
    expect(ROUTINE_PRESETS.evening).toHaveLength(6);
    expect(ROUTINE_PRESETS.night).toHaveLength(9);
    expect(ROUTINE_PRESETS.friday).toHaveLength(3);
    expect(ROUTINE_PRESET_SCHEDULES.morning).toEqual({ part: 'morning' });
    expect(ROUTINE_PRESET_SCHEDULES.evening).toEqual({ part: 'evening' });
    expect(ROUTINE_PRESET_SCHEDULES.night).toEqual({ part: 'night' });
    expect(ROUTINE_PRESET_SCHEDULES.friday).toEqual({ part: 'any', weekday: 5 });
  });

  it('resolves the night preset (Tasbih Fatimah reuses existing catalog rows)', () => {
    const catalog: Zikr[] = [
      'Ayat al-Kursi',
      'Surah Al-Ikhlas',
      'Surah Al-Falaq',
      'Surah An-Nas',
      'Bismika Allahumma Amutu wa Ahya',
      'SubhanAllah',
      'Alhamdulillah',
      'Allahu Akbar',
      'Allahumma Aslamtu Nafsi Ilayk',
    ].map((name, i) => ({
      id: i + 1,
      name,
      custom: false,
      createdAt: new Date(),
      defaultTarget: [1, 3, 3, 3, 1, 33, 33, 34, 1][i],
    }));
    const { items, unresolved } = resolveRoutinePreset(catalog, 'night');
    expect(unresolved).toEqual([]);
    expect(items.map(i => i.target)).toEqual([1, 3, 3, 3, 1, 33, 33, 34, 1]);
    expect(items.map(i => i.name)).toEqual([
      'Ayat al-Kursi',
      'Surah Al-Ikhlas',
      'Surah Al-Falaq',
      'Surah An-Nas',
      'Bismika Allahumma Amutu wa Ahya',
      'SubhanAllah',
      'Alhamdulillah',
      'Allahu Akbar',
      'Allahumma Aslamtu Nafsi Ilayk',
    ]);
  });

  it('resolves the friday preset with its counts (1/100/100)', () => {
    const catalog: Zikr[] = ['Surah Al-Kahf', 'Salawat', 'Astaghfirullah'].map((name, i) => ({
      id: i + 1,
      name,
      custom: false,
      createdAt: new Date(),
      defaultTarget: [1, 100, 100][i],
    }));
    const { items, unresolved } = resolveRoutinePreset(catalog, 'friday');
    expect(unresolved).toEqual([]);
    expect(items.map(i => i.target)).toEqual([1, 100, 100]);
  });

  it('reports unresolved names for the new presets too (never shortens the liturgy)', () => {
    const { unresolved } = resolveRoutinePreset([zikr(1, 'SubhanAllah')], 'night');
    expect(unresolved.length).toBeGreaterThan(0);
    expect(unresolved).toContain('Ayat al-Kursi');
  });
});
