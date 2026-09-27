/**
 * R1 prayer-time windows — the §10 spike kept as a permanent gate plus
 * unit vectors (solution-design §4.4, §9).
 *
 * SPIKE (hard gate): an INDEPENDENT minimal solar calculation — the
 * NOAA/Spencer series (declination + equation of time, ~30 lines below)
 * — cross-checks adhan's Dhaka output across six dates spread through
 * the year (both solstices + both equinoxes + two middling dates).
 * Agreement must be within ±5 minutes for Fajr/Sunrise/Dhuhr/Maghrib/
 * Isha. Karachi's Fajr/Isha are 18° twilight, which the independent
 * calc mirrors; Sunrise/Sunset use the standard −0.833° horizon.
 *
 * UNIT VECTORS: window edges (start inclusive / end exclusive), the
 * midnight-crossing Isha window (23:50 → 00:20 attributed at 00:10),
 * DST spring-forward wall-clock mapping (Europe/London with a diaspora
 * location), the traveler rule (London coords, New York device clock),
 * and computation failure → null (extreme latitude, silent absence).
 */

import { describe, it, expect, afterAll } from 'vitest';
import {
  POST_SALAH_SET,
  POST_SALAH_WINDOW_MS,
  activeOccurrence,
  dayPrayerTimes,
  gatherOccurrences,
  occurrenceDone,
  postSalahSequence,
  postSalahWindow,
  windowCounts,
  resolvePostSalahSet,
} from '../../../src/core/utils/prayerTimes';
import type { PrayerLocation, Session, Zikr } from '../../../src/core/db/types';

function loc(overrides: Partial<PrayerLocation> = {}): PrayerLocation {
  return {
    lat: 23.81,
    lon: 90.41,
    label: 'Dhaka',
    method: 'Karachi',
    madhab: 'Shafi',
    ...overrides,
  };
}

function zikr(id: number, name: string, deletedAt?: Date): Zikr {
  return { id, name, custom: false, createdAt: new Date(), deletedAt };
}

/** A session with an absolute timestamp (the only thing attribution reads). */
function session(zikrId: number, count: number, timestamp: Date): Session {
  const midnight = new Date(timestamp);
  midnight.setHours(0, 0, 0, 0);
  return {
    id: zikrId * 100 + count,
    zikrId,
    count,
    source: 'app',
    timestamp,
    date: midnight,
    editableUntil: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

// ============================================================
// The independent solar calculation (test-only, NOAA/Spencer series)
// ============================================================

const RAD = Math.PI / 180;

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((day - start) / 86_400_000);
}

/** Solar declination (radians), Spencer (1971) Fourier series. */
function declination(date: Date): number {
  const G = (2 * Math.PI * (dayOfYear(date) - 1)) / 365;
  return (
    0.006918 -
    0.399912 * Math.cos(G) +
    0.070257 * Math.sin(G) -
    0.006758 * Math.cos(2 * G) +
    0.000907 * Math.sin(2 * G) -
    0.002697 * Math.cos(3 * G) +
    0.00148 * Math.sin(3 * G)
  );
}

/** Equation of time in minutes, Spencer (1971). */
function equationOfTimeMinutes(date: Date): number {
  const G = (2 * Math.PI * (dayOfYear(date) - 1)) / 365;
  return (
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(G) -
      0.032077 * Math.sin(G) -
      0.014615 * Math.cos(2 * G) -
      0.040849 * Math.sin(2 * G))
  );
}

/** Solar transit as minutes after UTC-midnight of the date's UTC day. */
function solarNoonUTCMinutes(date: Date, lng: number): number {
  return 720 - 4 * lng - equationOfTimeMinutes(date);
}

/** Hour angle (degrees) at which the solar altitude reaches h0° (≤ 0). */
function hourAngleDeg(lat: number, delta: number, h0: number): number {
  const cosH =
    (Math.sin(h0 * RAD) - Math.sin(lat * RAD) * Math.sin(delta)) /
    (Math.cos(lat * RAD) * Math.cos(delta));
  return Math.acos(cosH) / RAD;
}

/** The independent event instant for a local (device) calendar date. */
function makeIndependentCalc(lat: number, lng: number) {
  return (localDate: Date, kind: 'fajr' | 'sunrise' | 'dhuhr' | 'maghrib' | 'isha'): Date => {
    const delta = declination(localDate);
    const noon = solarNoonUTCMinutes(localDate, lng);
    const h0 =
      kind === 'fajr' || kind === 'isha' ? -18 : kind === 'dhuhr' ? 0 : -0.833;
    const haMinutes =
      kind === 'dhuhr' ? 0 : (hourAngleDeg(lat, delta, h0) / 15) * 60;
    const minutes = kind === 'maghrib' || kind === 'isha' ? noon + haMinutes : noon - haMinutes;
    const utcMidnight = Date.UTC(
      localDate.getFullYear(),
      localDate.getMonth(),
      localDate.getDate()
    );
    return new Date(utcMidnight + minutes * 60_000);
  };
}

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

// ============================================================
// THE SPIKE — adhan vs. the independent calculation (±5 min)
// ============================================================

describe('SPIKE — adhan vs independent NOAA/Spencer calculation (Dhaka)', () => {
  const dhaka = loc();
  const calc = makeIndependentCalc(23.81, 90.41);

  // Solstices + equinoxes + two middling dates of 2026.
  const dates = [
    new Date(2026, 0, 15),
    new Date(2026, 2, 20), // equinox
    new Date(2026, 5, 21), // solstice
    new Date(2026, 6, 15),
    new Date(2026, 8, 23), // equinox
    new Date(2026, 11, 21), // solstice
  ];

  const events = ['fajr', 'sunrise', 'dhuhr', 'maghrib', 'isha'] as const;

  for (const date of dates) {
    it(`agrees within ±5 min on ${date.toDateString()}`, () => {
      const times = dayPrayerTimes(dhaka, date);
      expect(times).not.toBeNull();
      for (const event of events) {
        const expected = calc(date, event);
        const actual = times![event];
        const delta = minutesBetween(expected, actual);
        expect(
          delta,
          `${event}: expected ~${expected.toISOString()}, got ${actual.toISOString()} (${delta.toFixed(1)} min)`
        ).toBeLessThanOrEqual(5);
      }
    });
  }
});

// ============================================================
// Unit vectors — pure window math (timezone-independent instants)
// ============================================================

describe('gatherOccurrences — the two-day Isha gather (§4.4)', () => {
  const t = (h: number, m: number) => new Date(Date.UTC(2026, 2, 20, h, m));
  const today = {
    fajr: t(2, 0),
    sunrise: t(4, 0),
    dhuhr: t(6, 0),
    asr: t(9, 0),
    maghrib: t(12, 0),
    isha: t(13, 30),
  };
  const yesterday = {
    fajr: t(2, 0),
    sunrise: t(4, 0),
    dhuhr: t(6, 0),
    asr: t(9, 0),
    maghrib: t(12, 0),
    isha: t(13, 30),
  };

  it('yields today’s five windows plus yesterday’s Isha, sorted, each 30 min', () => {
    const all = gatherOccurrences(today, yesterday);
    expect(all).toHaveLength(6);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].start.getTime()).toBeGreaterThanOrEqual(all[i - 1].start.getTime());
    }
    for (const occ of all) {
      expect(occ.end.getTime() - occ.start.getTime()).toBe(POST_SALAH_WINDOW_MS);
    }
    // Yesterday's Isha is present exactly once…
    expect(all.filter(o => o.prayer === 'isha')).toHaveLength(2);
    // …and its window ends 30 minutes after yesterday's Isha instant.
    const yIsha = all.find(o => o.prayer === 'isha' && o.start.getTime() === yesterday.isha.getTime());
    expect(yIsha).toBeDefined();
    expect(yIsha!.end.getTime()).toBe(yesterday.isha.getTime() + POST_SALAH_WINDOW_MS);
  });
});

describe('activeOccurrence — window edges (AC1.2.2)', () => {
  const start = new Date(Date.UTC(2026, 2, 20, 12, 9));
  const end = new Date(start.getTime() + POST_SALAH_WINDOW_MS);
  const all = [{ prayer: 'maghrib' as const, start, end }];

  it('start is inclusive', () => {
    expect(activeOccurrence(all, start)?.prayer).toBe('maghrib');
  });
  it('end is exclusive', () => {
    expect(activeOccurrence(all, end)).toBeNull();
  });
  it('one millisecond before the end is still inside', () => {
    expect(activeOccurrence(all, new Date(end.getTime() - 1))?.prayer).toBe('maghrib');
  });
  it('outside any window → null', () => {
    expect(activeOccurrence(all, new Date(end.getTime() + 60_000))).toBeNull();
    expect(activeOccurrence(all, new Date(start.getTime() - 60_000))).toBeNull();
  });
});

describe('midnight-crossing Isha window (AC edge: Isha 23:50, set at 00:10)', () => {
  // Synthetic instants: yesterday's Isha at 23:50, today's at 23:50 again.
  // The window [23:50, 00:20] must still be found at 00:10 the NEW day.
  const yesterdayIsha = new Date(Date.UTC(2026, 2, 20, 23, 50));
  const todayIsha = new Date(Date.UTC(2026, 2, 21, 23, 50)); // 24h later
  const now0050 = new Date(yesterdayIsha.getTime() + 20 * 60_000); // 00:10 next day

  it('attributes 00:10 to the YESTERDAY occurrence still open', () => {
    const midnight = new Date(yesterdayIsha.getTime() + 10 * 60_000);
    const today = {
      fajr: new Date(midnight.getTime() + 3 * 3_600_000),
      sunrise: new Date(midnight.getTime() + 5 * 3_600_000),
      dhuhr: new Date(midnight.getTime() + 8 * 3_600_000),
      asr: new Date(midnight.getTime() + 11 * 3_600_000),
      maghrib: new Date(midnight.getTime() + 14 * 3_600_000),
      isha: todayIsha,
    };
    const yesterday = {
      fajr: new Date(yesterdayIsha.getTime() - 21 * 3_600_000),
      sunrise: new Date(yesterdayIsha.getTime() - 19 * 3_600_000),
      dhuhr: new Date(yesterdayIsha.getTime() - 16 * 3_600_000),
      asr: new Date(yesterdayIsha.getTime() - 13 * 3_600_000),
      maghrib: new Date(yesterdayIsha.getTime() - 10 * 3_600_000),
      isha: yesterdayIsha,
    };
    const active = activeOccurrence(gatherOccurrences(today, yesterday), now0050);
    expect(active?.prayer).toBe('isha');
    expect(active!.start.getTime()).toBe(yesterdayIsha.getTime());
  });
});

// ============================================================
// Real-computation integration vectors (device-clock independent:
// assertions use the computed instants themselves, never wall clocks)
// ============================================================

describe('postSalahWindow — Dhaka integration', () => {
  const dhaka = loc();

  it('is active at maghrib+ε, expired at maghrib+30min', () => {
    const times = dayPrayerTimes(dhaka, new Date(2026, 2, 20, 12))!;
    const at = (offsetMs: number) => postSalahWindow(dhaka, new Date(times.maghrib.getTime() + offsetMs));
    expect(at(0)!.active?.prayer).toBe('maghrib');
    expect(at(1)!.active?.prayer).toBe('maghrib');
    // Maghrib+30min must be outside ANY window (isha is ~75 min later).
    expect(at(POST_SALAH_WINDOW_MS)!.active).toBeNull();
  });

  it('finds the Isha window and the active bounds match adhan’s isha instant', () => {
    const times = dayPrayerTimes(dhaka, new Date(2026, 2, 20, 12))!;
    const win = postSalahWindow(dhaka, new Date(times.isha.getTime() + 5 * 60_000))!;
    expect(win.active?.prayer).toBe('isha');
    expect(win.active!.start.getTime()).toBe(times.isha.getTime());
  });

  it('returns all five windows of the day for a noon query', () => {
    const win = postSalahWindow(dhaka, new Date(2026, 2, 20, 12, 0))!;
    expect(win.active).toBeNull(); // noon between fajr and dhuhr windows
    const prayers = win.all.map(o => o.prayer);
    expect(prayers.filter(p => p === 'isha')).toHaveLength(2); // yesterday + today
    for (const p of ['fajr', 'dhuhr', 'asr', 'maghrib'] as const) {
      expect(prayers.filter(x => x === p)).toHaveLength(1);
    }
  });
});

// ============================================================
// DST + traveler (device clock = truth; TZ set per-block, restored after)
// ============================================================

const REAL_TZ = process.env.TZ;

describe('DST spring-forward — Europe/London (AC edge)', () => {
  const london = loc({ lat: 51.5072, lon: -0.1276, label: 'London' });

  it('maghrib’s wall clock shifts with the clock change (no evaporation, no duplication)', () => {
    process.env.TZ = 'Europe/London';
    try {
      const before = dayPrayerTimes(london, new Date(2026, 2, 28, 12))!; // GMT day
      const during = dayPrayerTimes(london, new Date(2026, 2, 29, 12))!; // spring-forward day
      const wallOf = (d: Date) => d.getHours() * 60 + d.getMinutes();
      const shift = wallOf(during.maghrib) - wallOf(before.maghrib);
      // Solar drift over one day is ~±2 min; the clock jump is +60 → ~+60.
      expect(shift).toBeGreaterThanOrEqual(55);
      expect(shift).toBeLessThanOrEqual(65);

      // The window bounds on the transition day stay well-formed instants.
      const win = postSalahWindow(london, new Date(during.maghrib.getTime() + 60_000))!;
      expect(win.active?.prayer).toBe('maghrib');
      expect(win.active!.end.getTime()).toBe(win.active!.start.getTime() + POST_SALAH_WINDOW_MS);
      for (const occ of win.all) {
        expect(occ.end.getTime()).toBeGreaterThan(occ.start.getTime());
      }
    } finally {
      process.env.TZ = REAL_TZ;
    }
  });
});

describe('Traveler — London saved, device in New York (AC edge)', () => {
  const london = loc({ lat: 51.5072, lon: -0.1276, label: 'London' });

  it('the card appears at the NY wall-clock instant of London’s sunset', () => {
    process.env.TZ = 'Europe/London';
    let londonMaghrib: Date;
    try {
      londonMaghrib = dayPrayerTimes(london, new Date(2026, 7, 15, 12))!.maghrib;
    } finally {
      process.env.TZ = 'America/New_York';
    }
    try {
      // Device clock is now NY; the instant corresponds to London sunset.
      const win = postSalahWindow(london, new Date(londonMaghrib.getTime() + 60_000))!;
      expect(win.active?.prayer).toBe('maghrib');
      // And the wall clock the user sees is NY's afternoon/evening.
      const nyHour = new Date(londonMaghrib).getHours();
      expect(nyHour).toBeLessThan(19); // London 20:0x BST = 15:0x EDT
    } finally {
      process.env.TZ = REAL_TZ;
    }
  });
});

describe('Uncomputable location — silent absence (AC1.4.3)', () => {
  it('extreme latitude in polar summer → null, never a throw', () => {
    const svalbard = loc({ lat: 78.22, lon: 15.65, label: 'Longyearbyen' });
    expect(dayPrayerTimes(svalbard, new Date(2026, 5, 21, 12))).toBeNull();
    expect(postSalahWindow(svalbard, new Date(2026, 5, 21, 12, 0))).toBeNull();
  });
});

// ============================================================
// Done-attribution + the guided sequence (§2.3 / §4.6)
// ============================================================

describe('windowCounts / occurrenceDone — window-scoped truth (AC1.2.3)', () => {
  const setZikrs: Zikr[] = [
    zikr(1, 'SubhanAllah'),
    zikr(2, 'Alhamdulillah'),
    zikr(3, 'Allahu Akbar'),
    zikr(4, 'La ilaha illallah'),
  ];
  const occ = {
    prayer: 'maghrib' as const,
    start: new Date(Date.UTC(2026, 2, 20, 12, 9)),
    end: new Date(Date.UTC(2026, 2, 20, 12, 39)),
  };

  it('counts only sessions whose timestamp falls INSIDE the window', () => {
    const sessions: Session[] = [
      session(1, 500, new Date(Date.UTC(2026, 2, 20, 9, 0))), // morning — ignored
      session(1, 30, new Date(Date.UTC(2026, 2, 20, 12, 10))), // in-window
      session(2, 33, new Date(Date.UTC(2026, 2, 20, 12, 20))), // in-window
      session(3, 34, new Date(Date.UTC(2026, 2, 20, 12, 30))), // in-window
      session(4, 100, new Date(Date.UTC(2026, 2, 20, 13, 0))), // after end — ignored
    ];
    const counts = windowCounts(occ, sessions);
    expect(counts.get(1)).toBe(30);
    expect(counts.get(2)).toBe(33);
    expect(counts.get(3)).toBe(34);
    expect(counts.has(4)).toBe(false);

    expect(occurrenceDone(occ, sessions, setZikrs)).toBe(false);
  });

  it('the complete in-window set IS done — regardless of source', () => {
    const sessions: Session[] = [
      session(1, 33, new Date(Date.UTC(2026, 2, 20, 12, 10))),
      session(2, 33, new Date(Date.UTC(2026, 2, 20, 12, 15))),
      session(3, 34, new Date(Date.UTC(2026, 2, 20, 12, 20))),
      session(4, 100, new Date(Date.UTC(2026, 2, 20, 12, 38))),
    ];
    expect(occurrenceDone(occ, sessions, setZikrs)).toBe(true);
  });

  it('name matching is case/whitespace-insensitive; soft-deleted zikrs vanish', () => {
    const oddNames: Zikr[] = [
      zikr(1, '  subhanallah '),
      zikr(2, 'ALHAMDULILLAH'),
      zikr(3, 'Allahu  Akbar'),
      zikr(4, 'la ilaha illallah'),
    ];
    const sessions: Session[] = [
      session(1, 33, new Date(occ.start.getTime() + 60_000)),
      session(2, 33, new Date(occ.start.getTime() + 60_000)),
      session(3, 34, new Date(occ.start.getTime() + 60_000)),
      session(4, 100, new Date(occ.start.getTime() + 60_000)),
    ];
    expect(occurrenceDone(occ, sessions, oddNames)).toBe(true);

    const deleted = setZikrs.map(z => zikr(z.id!, z.name, new Date()));
    expect(occurrenceDone(occ, sessions, deleted)).toBe(false);
    expect(resolvePostSalahSet(deleted)).toHaveLength(0);
  });
});

describe('postSalahSequence — the 33 → 33 → 34 → 100 flow source (AC1.3.1)', () => {
  const setZikrs: Zikr[] = [
    zikr(1, 'SubhanAllah'),
    zikr(2, 'Alhamdulillah'),
    zikr(3, 'Allahu Akbar'),
    zikr(4, 'La ilaha illallah'),
  ];

  it('resolves the four catalog items in order with catalog targets', () => {
    const steps = postSalahSequence(setZikrs);
    expect(steps.map(s => s.target)).toEqual([33, 33, 34, 100]);
    expect(steps.map(s => s.itemIndex)).toEqual([0, 1, 2, 3]);
  });

  it('in-window credit reduces the remaining target; an item at target is finished', () => {
    const credit = new Map([
      [1, 12], // mid-item — the durable-checkpoint resume shows its remainder
      [2, 33], // already complete this occurrence
    ]);
    const steps = postSalahSequence(setZikrs, credit);
    expect(steps.map(s => s.target)).toEqual([21, 0, 34, 100]);
  });

  it('a set item whose zikr is missing is skipped, like the routine flow', () => {
    const partial: Zikr[] = [zikr(1, 'SubhanAllah'), zikr(4, 'La ilaha illallah')];
    const steps = postSalahSequence(partial);
    expect(steps.map(s => s.target)).toEqual([33, 100]);
  });

  it('the catalog set itself is 33/33/34/100', () => {
    expect(POST_SALAH_SET.map(i => i.target)).toEqual([33, 33, 34, 100]);
  });
});

afterAll(() => {
  process.env.TZ = REAL_TZ;
});
