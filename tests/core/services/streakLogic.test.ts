import { describe, it, expect } from 'vitest';
import { daysBetween } from '../../../src/core/utils/dateUtils';

// The streak algorithm in streakService.updateStreak operates on these rules:
//   - a session OLDER than lastProcessedDate never reaches this fold — it is
//     routed to a full recalculation (see streakBackdate.test.ts)
//   - same day (daysSince === 0):  no change to streak
//   - consecutive day (daysSince === 1): streak++
//   - gap > 1 day (daysSince > 1): streak resets to 0, then new session starts fresh
//   - longestStreak is updated whenever currentStreak exceeds it
//
// These tests mirror the algorithm WITHOUT hitting the DB so they stay pure and fast.

function applyStreakUpdate(
  existing: { currentStreak: number; longestStreak: number; lastProcessedDate: Date },
  sessionDate: Date
): { currentStreak: number; longestStreak: number; lastProcessedDate: Date } {
  let { currentStreak, longestStreak, lastProcessedDate } = existing;

  const lastFmt = `${lastProcessedDate.getFullYear()}-${lastProcessedDate.getMonth()}-${lastProcessedDate.getDate()}`;
  const sessFmt = `${sessionDate.getFullYear()}-${sessionDate.getMonth()}-${sessionDate.getDate()}`;

  if (lastFmt !== sessFmt) {
    const daysSince = daysBetween(lastProcessedDate, sessionDate);
    if (daysSince > 1) {
      currentStreak = 0;
    } else if (daysSince === 1) {
      currentStreak++;
    }
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }
    lastProcessedDate = sessionDate;
  }

  return { currentStreak, longestStreak, lastProcessedDate };
}

const day = (n: number) => new Date(2026, 5, n, 10, 0, 0); // June n 2026

describe('streak state machine', () => {
  it('starts with streak 0 (no prior activity)', () => {
    const initial = { currentStreak: 0, longestStreak: 0, lastProcessedDate: new Date(0) };
    // daysBetween(epoch, any-recent-date) >> 1 → streak resets to 0, stays 0
    const result = applyStreakUpdate(initial, day(10));
    expect(result.currentStreak).toBe(0);
  });

  it('increments streak on consecutive day', () => {
    const state = { currentStreak: 1, longestStreak: 1, lastProcessedDate: day(10) };
    const result = applyStreakUpdate(state, day(11));
    expect(result.currentStreak).toBe(2);
  });

  it('does not change streak for same-day session', () => {
    const state = { currentStreak: 3, longestStreak: 3, lastProcessedDate: new Date(2026, 5, 10, 8, 0, 0) };
    const laterSameDay = new Date(2026, 5, 10, 20, 0, 0);
    const result = applyStreakUpdate(state, laterSameDay);
    expect(result.currentStreak).toBe(3);
  });

  it('resets streak when gap is 2+ days', () => {
    const state = { currentStreak: 5, longestStreak: 5, lastProcessedDate: day(10) };
    const result = applyStreakUpdate(state, day(13)); // gap of 3 days
    expect(result.currentStreak).toBe(0);
  });

  it('preserves longestStreak after reset', () => {
    const state = { currentStreak: 5, longestStreak: 7, lastProcessedDate: day(10) };
    const result = applyStreakUpdate(state, day(13));
    expect(result.currentStreak).toBe(0);
    expect(result.longestStreak).toBe(7);
  });

  it('updates longestStreak when currentStreak exceeds it', () => {
    const state = { currentStreak: 4, longestStreak: 4, lastProcessedDate: day(10) };
    const result = applyStreakUpdate(state, day(11));
    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(5);
  });

  it('does not lower longestStreak when current is already below', () => {
    const state = { currentStreak: 3, longestStreak: 10, lastProcessedDate: day(10) };
    const result = applyStreakUpdate(state, day(11));
    expect(result.longestStreak).toBe(10);
  });

  it('builds streak correctly over a week of consecutive sessions', () => {
    let state = { currentStreak: 0, longestStreak: 0, lastProcessedDate: new Date(0) };
    for (let d = 1; d <= 7; d++) {
      state = applyStreakUpdate(state, day(d));
    }
    // day 1: gap from epoch >> 1 → reset to 0
    // days 2-7: 6 consecutive increments → currentStreak = 6
    expect(state.currentStreak).toBe(6);
    expect(state.longestStreak).toBe(6);
  });
});
