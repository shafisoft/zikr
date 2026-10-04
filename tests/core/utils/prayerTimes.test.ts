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
  activeOccurrence,
  attributedCounts,
  dayPrayerTimes,
  gatherOccurrences,
  occurrenceDone,
  postSalahSequence,
  postSalahSlots,
  postSalahWindow,
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
function session(
  zikrId: number,
  count: number,
  timestamp: Date,
  postSalah?: Session['postSalah']
): Session {
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
    postSalah,
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

describe('gatherOccurrences — periods, two-day Isha (§4.4)', () => {
  const t = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 2, day, h, m));
  const today = {
    fajr: t(20, 2),
    sunrise: t(20, 4),
    dhuhr: t(20, 6),
    asr: t(20, 9),
    maghrib: t(20, 12),
    isha: t(20, 13, 30),
  };
  const yesterday = {
    fajr: t(19, 2),
    sunrise: t(19, 4),
    dhuhr: t(19, 6),
    asr: t(19, 9),
    maghrib: t(19, 12),
    isha: t(19, 13, 30),
  };

  it('each period ends at the NEXT prayer; Isha runs until Fajr + 24h', () => {
    const all = gatherOccurrences(today, yesterday);
    expect(all).toHaveLength(6);
    for (let i = 1; i < all.length; i++) {
      expect(all[i].start.getTime()).toBeGreaterThanOrEqual(all[i - 1].start.getTime());
    }
    const byKey = (prayer: string, start: Date) =>
      all.find(o => o.prayer === prayer && o.start.getTime() === start.getTime())!;
    expect(byKey('fajr', today.fajr).end.getTime()).toBe(today.dhuhr.getTime());
    expect(byKey('dhuhr', today.dhuhr).end.getTime()).toBe(today.asr.getTime());
    expect(byKey('asr', today.asr).end.getTime()).toBe(today.maghrib.getTime());
    expect(byKey('maghrib', today.maghrib).end.getTime()).toBe(today.isha.getTime());
    expect(byKey('isha', today.isha).end.getTime()).toBe(today.fajr.getTime() + 24 * 3_600_000);
    // Yesterday's Isha is present exactly once…
    expect(all.filter(o => o.prayer === 'isha')).toHaveLength(2);
    // …and its period runs until TODAY's Fajr (the overnight offer).
    const yIsha = byKey('isha', yesterday.isha);
    expect(yIsha.end.getTime()).toBe(today.fajr.getTime());
  });
});

describe('activeOccurrence — period edges', () => {
  const start = new Date(Date.UTC(2026, 2, 20, 12, 9));
  const end = new Date(Date.UTC(2026, 2, 20, 13, 30));
  const all = [{ prayer: 'maghrib' as const, start, end }];

  it('start is inclusive', () => {
    expect(activeOccurrence(all, start)?.prayer).toBe('maghrib');
  });
  it('end is exclusive (the next prayer replaces the offer)', () => {
    expect(activeOccurrence(all, end)).toBeNull();
  });
  it('one millisecond before the end is still inside', () => {
    expect(activeOccurrence(all, new Date(end.getTime() - 1))?.prayer).toBe('maghrib');
  });
  it('outside every period → null', () => {
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

  it('the offer follows the prayer period: maghrib+30min is STILL maghrib', () => {
    const times = dayPrayerTimes(dhaka, new Date(2026, 2, 20, 12))!;
    const at = (offsetMs: number) => postSalahWindow(dhaka, new Date(times.maghrib.getTime() + offsetMs));
    expect(at(0)!.active?.prayer).toBe('maghrib');
    expect(at(1)!.active?.prayer).toBe('maghrib');
    // Half an hour later the offer has not moved on — the period runs
    // until Isha, not 30 minutes.
    expect(at(30 * 60_000)!.active?.prayer).toBe('maghrib');
    // The next prayer replaces it.
    expect(at(times.isha.getTime() - times.maghrib.getTime())!.active?.prayer).toBe('isha');
  });

  it('finds the Isha period and the bounds match adhan’s instants', () => {
    const times = dayPrayerTimes(dhaka, new Date(2026, 2, 20, 12))!;
    const win = postSalahWindow(dhaka, new Date(times.isha.getTime() + 5 * 60_000))!;
    expect(win.active?.prayer).toBe('isha');
    expect(win.active!.start.getTime()).toBe(times.isha.getTime());
    // Overnight: Isha's period ends at tomorrow's Fajr (≈ today's + 24h).
    expect(win.active!.end.getTime()).toBe(times.fajr.getTime() + 24 * 3_600_000);
  });

  it('the current period is the most recent prayer for a noon query', () => {
    const times = dayPrayerTimes(dhaka, new Date(2026, 2, 20, 12, 0))!;
    const noon = new Date(2026, 2, 20, 12, 0);
    const win = postSalahWindow(dhaka, noon)!;
    // Derived from the computed instants, never the wall clock: the last
    // prayer at/before noon owns the moment (before Fajr it would be
    // yesterday's Isha).
    const elapsed = (['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).filter(
      p => times[p].getTime() <= noon.getTime()
    );
    const expected = elapsed[elapsed.length - 1];
    expect(win.active!.prayer).toBe(expected);
    expect(win.active!.start.getTime()).toBe(times[expected].getTime());
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

      // The period bounds on the transition day stay well-formed instants.
      const win = postSalahWindow(london, new Date(during.maghrib.getTime() + 60_000))!;
      expect(win.active?.prayer).toBe('maghrib');
      expect(win.active!.end.getTime()).toBe(during.isha.getTime());
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

describe('attributedCounts / occurrenceDone — flow-attributed truth (AC1.2.3, revised)', () => {
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

  it('counts ONLY sessions the guided flow attributed to this prayer', () => {
    const sessions: Session[] = [
      // Free counting INSIDE the period never completes a set by itself —
      // all-day tasbeeh users were completing every prayer's set that way.
      session(1, 30, new Date(Date.UTC(2026, 2, 20, 12, 10))),
      // Guided-flow saves for the same prayer count while the period runs.
      session(2, 33, new Date(Date.UTC(2026, 2, 20, 12, 20)), 'maghrib'),
      session(1, 33, new Date(Date.UTC(2026, 2, 20, 12, 41)), 'maghrib'),
      // A different prayer's attribution never masquerades.
      session(3, 34, new Date(Date.UTC(2026, 2, 20, 12, 15)), 'fajr'),
      // Yesterday's maghrib set stays on its own occurrence.
      session(4, 100, new Date(Date.UTC(2026, 2, 19, 12, 30)), 'maghrib'),
    ];
    const counts = attributedCounts(occ, sessions);
    expect(counts.get(1)).toBe(33);
    expect(counts.get(2)).toBe(33);
    expect(counts.has(3)).toBe(false);
    expect(counts.has(4)).toBe(false);

    // 66 of 200 — short of done.
    expect(occurrenceDone(occ, sessions, setZikrs)).toBe(false);
  });

  it('the attributed complete set IS done', () => {
    const sessions: Session[] = [
      session(1, 33, new Date(occ.start.getTime() + 60_000), 'maghrib'),
      session(2, 33, new Date(occ.start.getTime() + 60_000), 'maghrib'),
      session(3, 34, new Date(occ.start.getTime() + 60_000), 'maghrib'),
      session(4, 100, new Date(occ.end.getTime() + 60_000), 'maghrib'),
    ];
    expect(occurrenceDone(occ, sessions, setZikrs)).toBe(true);
  });

  it('an offline completion marked AFTER the period moved on still counts', () => {
    // The user taps the past chip at 18:00 and marks the set done — the
    // same-day mark counts even though the period ended at 12:39.
    const sessions: Session[] = [
      session(1, 33, new Date(Date.UTC(2026, 2, 20, 18, 0)), 'maghrib'),
      session(2, 33, new Date(Date.UTC(2026, 2, 20, 18, 0)), 'maghrib'),
      session(3, 34, new Date(Date.UTC(2026, 2, 20, 18, 0)), 'maghrib'),
      session(4, 100, new Date(Date.UTC(2026, 2, 20, 18, 0)), 'maghrib'),
    ];
    expect(occurrenceDone(occ, sessions, setZikrs)).toBe(true);
  });

  it('a mark logged before the prayer ever began never counts', () => {
    const sessions: Session[] = [
      session(1, 33, new Date(Date.UTC(2026, 2, 20, 9, 0)), 'maghrib'),
      session(2, 33, new Date(Date.UTC(2026, 2, 20, 9, 0)), 'maghrib'),
      session(3, 34, new Date(Date.UTC(2026, 2, 20, 9, 0)), 'maghrib'),
      session(4, 100, new Date(Date.UTC(2026, 2, 20, 9, 0)), 'maghrib'),
    ];
    expect(occurrenceDone(occ, sessions, setZikrs)).toBe(false);
  });

  it('unattributed (legacy) sessions leave the occurrence undone', () => {
    const sessions: Session[] = [
      session(1, 33, new Date(occ.start.getTime() + 60_000)),
      session(2, 33, new Date(occ.start.getTime() + 60_000)),
      session(3, 34, new Date(occ.start.getTime() + 60_000)),
      session(4, 100, new Date(occ.start.getTime() + 60_000)),
    ];
    expect(occurrenceDone(occ, sessions, setZikrs)).toBe(false);
  });

  it('name matching is case/whitespace-insensitive; soft-deleted zikrs vanish', () => {
    const oddNames: Zikr[] = [
      zikr(1, '  subhanallah '),
      zikr(2, 'ALHAMDULILLAH'),
      zikr(3, 'Allahu  Akbar'),
      zikr(4, 'la ilaha illallah'),
    ];
    const sessions: Session[] = [
      session(1, 33, new Date(occ.start.getTime() + 60_000), 'maghrib'),
      session(2, 33, new Date(occ.start.getTime() + 60_000), 'maghrib'),
      session(3, 34, new Date(occ.start.getTime() + 60_000), 'maghrib'),
      session(4, 100, new Date(occ.start.getTime() + 60_000), 'maghrib'),
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
describe('postSalahSlots — the day tracker (five salah, one set)', () => {
  const setZikrs: Zikr[] = [
    zikr(1, 'SubhanAllah'),
    zikr(2, 'Alhamdulillah'),
    zikr(3, 'Allahu Akbar'),
    zikr(4, 'La ilaha illallah'),
  ];
  // A synthetic day of PERIODS: fajr 03:00 (until dhuhr), dhuhr 06:00,
  // asr 09:00, maghrib 12:00, isha 13:30 (until fajr + 24h) — with
  // yesterday's isha running until today's fajr.
  const t = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 2, day, h, m));
  const starts = { fajr: 3, dhuhr: 6, asr: 9, maghrib: 12, isha: 13 } as const;
  const nextOf = { fajr: t(20, 6), dhuhr: t(20, 9), asr: t(20, 12), maghrib: t(20, 13, 30) };
  const occurrences = [
    ...(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const).map(prayer => ({
      prayer,
      start: t(20, starts[prayer], prayer === 'isha' ? 30 : 0),
      end:
        prayer === 'isha'
          ? new Date(t(20, 2).getTime() + 24 * 3_600_000)
          : nextOf[prayer],
    })),
    { prayer: 'isha' as const, start: t(19, 13, 30), end: t(20, 2) },
  ];

  it('yields exactly five slots in prayer order with the right coarse states', () => {
    const slots = postSalahSlots(occurrences, t(20, 9, 10), [], setZikrs);
    expect(slots.map(s => s.prayer)).toEqual(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']);
    expect(slots.map(s => s.done)).toEqual([false, false, false, false, false]);
    // At 09:10: fajr/dhuhr moved on (pending, no missed stigma), asr is
    // the CURRENT offer, maghrib/isha upcoming.
    expect(slots.map(s => s.current)).toEqual([false, false, true, false, false]);
    expect(slots.map(s => s.pending)).toEqual([true, true, false, false, false]);
    expect(slots.filter(s => s.upcoming).map(s => s.prayer)).toEqual(['maghrib', 'isha']);
  });

  it('attributed sessions drive progress and done per slot, never across slots', () => {
    const sessions: Session[] = [
      session(1, 33, new Date(t(20, 9).getTime() + 60_000), 'asr'), // asr period
      session(2, 33, new Date(t(20, 9).getTime() + 60_000), 'asr'),
      session(3, 34, new Date(t(20, 12).getTime() + 60_000), 'maghrib'), // maghrib period
    ];
    const slots = postSalahSlots(occurrences, t(20, 12, 1), sessions, setZikrs);
    const asr = slots.find(s => s.prayer === 'asr')!;
    const maghrib = slots.find(s => s.prayer === 'maghrib')!;
    // Asr: 2 of 4 items complete → (33+33)/(33+33+34+100).
    expect(asr.done).toBe(false);
    expect(asr.progress).toBeCloseTo(66 / 200, 10);
    // Maghrib: only Allahu Akbar so far → 34/200; NOT credited to asr.
    expect(maghrib.progress).toBeCloseTo(34 / 200, 10);
    expect(maghrib.done).toBe(false);

    // Completing the set for maghrib flips exactly that slot.
    const complete = [
      ...sessions,
      session(1, 33, new Date(t(20, 12).getTime() + 120_000), 'maghrib'),
      session(2, 33, new Date(t(20, 12).getTime() + 120_000), 'maghrib'),
      session(4, 100, new Date(t(20, 12).getTime() + 120_000), 'maghrib'),
    ];
    const after = postSalahSlots(occurrences, t(20, 12, 5), complete, setZikrs);
    expect(after.find(s => s.prayer === 'maghrib')!.done).toBe(true);
    expect(after.find(s => s.prayer === 'maghrib')!.current).toBe(true);
    // Asr stays undone — the day moved on; pending, never "missed".
    expect(after.find(s => s.prayer === 'asr')!.pending).toBe(true);
  });

  it('collapses the midnight-crossing isha: the live yesterday period wins at 00:10', () => {
    const yIsha = t(19, 13, 30); // yesterday's isha — its period runs to fajr
    const now0010 = new Date(t(20, 0, 10).getTime());
    const slots = postSalahSlots(occurrences, now0010, [], setZikrs);
    const isha = slots.find(s => s.prayer === 'isha')!;
    expect(isha.current).toBe(true);
    expect(isha.start.getTime()).toBe(yIsha.getTime()); // NOT today's 13:30
    expect(isha.upcoming).toBe(false);
  });

  it('an unresolved set (empty library match) never reports done and progress stays 0', () => {
    const slots = postSalahSlots(occurrences, t(20, 12, 1), [], [zikr(9, 'Something else')]);
    expect(slots.every(s => !s.done)).toBe(true);
    expect(slots.every(s => s.progress === 0)).toBe(true);
  });
});

afterAll(() => {
  process.env.TZ = REAL_TZ;
});
