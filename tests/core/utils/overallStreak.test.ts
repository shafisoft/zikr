import { describe, it, expect } from 'vitest';
import {
  calculateOverallStreak,
  gracePromptVisible,
  streakStatus,
  streakStatusOf,
  StreakStatus,
} from '../../../src/core/utils/overallStreak';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

/**
 * Deterministic "today" + day-set builder for the §6.2 vectors (P = practiced,
 * − = none; rightmost day = today unless the vector says otherwise).
 */
const TODAY = new Date(2026, 8, 27); // 2026-09-27, midnight
const d = (n: number) => {
  const date = new Date(TODAY);
  date.setDate(date.getDate() - n);
  return date;
};
const statusOver = (offsets: number[]): StreakStatus => {
  const set = new Set(offsets.map(n => {
    const date = d(n);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }));
  return streakStatus(day => set.has(day), TODAY);
};

describe('calculateOverallStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(calculateOverallStreak([daysAgo(0), daysAgo(1), daysAgo(2)])).toBe(3);
  });

  it('does not break the streak before today has a session (grace rule)', () => {
    // Practiced yesterday and before, nothing yet today — streak survives.
    expect(calculateOverallStreak([daysAgo(1), daysAgo(2)])).toBe(2);
  });

  it('forgives a single missed day at the trailing edge (P−P → 2)', () => {
    // §6.2 vector row 5 / R3.1 — this test previously asserted the old
    // "breaks on a full missed day" behavior ([today, 2-days-ago] → 1).
    // One flipped expectation BY DESIGN: the approved solution design
    // (docs/solution-design.md §6.2 row 5 and §17 engineer review) makes a
    // single skipped day survive the streak; the old value 1 is now exactly
    // vector row 7 (P−−P → 1), the true double-gap break.
    expect(calculateOverallStreak([daysAgo(0), daysAgo(2)])).toBe(2);
  });

  it('returns 0 with no recent practice', () => {
    expect(calculateOverallStreak([daysAgo(5)])).toBe(0);
  });

  it('ignores future sessions and duplicates', () => {
    const future = new Date(Date.now() + DAY);
    expect(calculateOverallStreak([daysAgo(0), daysAgo(0), future])).toBe(1);
  });

  it('returns 0 for empty input', () => {
    expect(calculateOverallStreak([])).toBe(0);
  });
});

describe('streakStatus — §6.2 worked-example vectors (normative numbers)', () => {
  it('row 1: P P − (open on day 3, nothing today yet) → 2', () => {
    // The number is the binding part of the vector. The table annotates the
    // row "grace state", but the §3.1 algorithm's own mode rule ("grace when
    // today ∧ yesterday are both unpracticed"), AC3.2.2 (the prompt must not
    // fire when yesterday has a session — it targets yesterday), and §6.5
    // (current-scenario behavior stays identical) all pin this state to the
    // plain held badge: yesterday was practiced, nothing is missed.
    expect(statusOver([1, 2])).toEqual({ value: 2, mode: 'normal' });
  });

  it('row 2: P P − P → 3 (forgiveness applied silently, no special state)', () => {
    expect(statusOver([3, 2, 0])).toEqual({ value: 3, mode: 'normal' });
  });

  it('row 3: P P − with yesterday logged backdated → 3, normal state', () => {
    // Same walk as row 2 after the backdated log fills the gap (AC3.2.3).
    expect(statusOver([3, 2, 1])).toEqual({ value: 3, mode: 'normal' });
  });

  it('row 4: P P − − (opens after two consecutive misses) → 0, fresh-start framing', () => {
    expect(statusOver([4, 3])).toEqual({ value: 0, mode: 'fresh-break' });
  });

  it('row 5: P − P → 2 (single gap forgiven silently)', () => {
    expect(statusOver([2, 0])).toEqual({ value: 2, mode: 'normal' });
  });

  it('row 6: P P − P − P → 4 (each gap forgiven at its own trailing edge)', () => {
    expect(statusOver([5, 4, 2, 0])).toEqual({ value: 4, mode: 'normal' });
  });

  it('row 7: P − − P → 1 (streak broke; fresh run)', () => {
    expect(statusOver([3, 0])).toEqual({ value: 1, mode: 'normal' });
  });
});

describe('streakStatus — grace vs regular distinction (AC3.1.1, R3.0)', () => {
  it('return day after exactly one missed day: held value in grace state', () => {
    // Practiced 3 and 2 days ago, missed yesterday, opens today before
    // practicing — the held 2-day streak shows in grace (prompt conditions
    // key off this mode; yesterday is empty so the prompt may fire).
    expect(statusOver([3, 2])).toEqual({ value: 2, mode: 'grace' });
  });

  it('same sessions as the grace case but yesterday practiced: plain held badge', () => {
    // R3.0 held state — no missed day exists, so nothing is framed as grace
    // (and the "log yesterday?" prompt must not fire, AC3.2.2).
    expect(statusOver([2, 1])).toEqual({ value: 2, mode: 'normal' });
  });

  it('grace self-resolves when yesterday gains a backdated session', () => {
    expect(statusOver([3, 2, 1])).toEqual({ value: 3, mode: 'normal' });
  });

  it('grace resolves when the user practices on the return day (AC3.1.4)', () => {
    expect(statusOver([3, 2, 0])).toEqual({ value: 3, mode: 'normal' });
  });

  it('a second consecutive missed day never reads as grace (R3.2)', () => {
    expect(statusOver([4, 3])).toEqual({ value: 0, mode: 'fresh-break' });
  });
});

describe('streakStatus — break + history edges', () => {
  it('an old mid-chain double gap still ends the streak (never retroactive)', () => {
    // P P − − P: the double gap broke the streak back then; today starts a
    // fresh run of 1, and old single/double gaps are not repaired.
    expect(statusOver([4, 3, 0])).toEqual({ value: 1, mode: 'normal' });
  });

  it('long streaks get the same one-day trailing grace', () => {
    // 200 practiced days ending 2 days ago, missed yesterday, today pending.
    const offsets = Array.from({ length: 200 }, (_, i) => i + 2);
    expect(statusOver(offsets)).toEqual({ value: 200, mode: 'grace' });
  });

  it('fresh-break requires prior history: no history at all stays normal (AC3.1.3)', () => {
    expect(streakStatus(() => false, TODAY)).toEqual({ value: 0, mode: 'normal' });
  });

  it('ancient history (older than the probe window) keeps current no-badge behavior', () => {
    expect(statusOver([400])).toEqual({ value: 0, mode: 'normal' });
  });

  it('streakStatusOf: empty sessions are normal, raw dates derive fully', () => {
    expect(streakStatusOf([])).toEqual({ value: 0, mode: 'normal' });
    // streakStatusOf anchors "today" to the real clock, so the raw dates must
    // be built relative to it too — fixed-calendar dates read as grace (or
    // worse) once the real day moves past the fixture.
    expect(
      streakStatusOf([daysAgo(2), daysAgo(0)])
    ).toEqual({ value: 2, mode: 'normal' });
  });
});

describe('gracePromptVisible — "Log yesterday?" once-per-return-day rule (AC3.2.2)', () => {
  const base = { mode: 'grace' as const, framingEnabled: true, today: '2026-09-27' };

  it('shows on the return day in grace mode', () => {
    expect(gracePromptVisible(base)).toBe(true);
  });

  it('never shows twice on the same return day after dismissal', () => {
    expect(gracePromptVisible({ ...base, dismissedFor: '2026-09-27' })).toBe(false);
  });

  it('shows again on a NEW return day (a fresh missed day)', () => {
    expect(gracePromptVisible({ ...base, dismissedFor: '2026-09-26' })).toBe(true);
  });

  it('never fires when yesterday has a session (mode is not grace)', () => {
    expect(gracePromptVisible({ ...base, mode: 'normal' })).toBe(false);
    expect(gracePromptVisible({ ...base, mode: 'fresh-break' })).toBe(false);
  });

  it('is framing-gated (graceFramingEnabled off renders the plain badge only)', () => {
    expect(gracePromptVisible({ ...base, framingEnabled: false })).toBe(false);
  });
});
