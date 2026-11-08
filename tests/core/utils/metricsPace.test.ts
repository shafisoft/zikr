import { describe, it, expect } from 'vitest';
import { recentDailyAverage } from '../../../src/core/utils/metrics';
import type { Session } from '../../../src/core/db/types';

const NOW = new Date(2026, 10, 8, 15, 30);

/** A session whose civil `date` sits `offsetDays` from NOW (0 = today). */
function sessionOn(offsetDays: number, count: number): Session {
  const date = new Date(NOW);
  date.setDate(date.getDate() + offsetDays);
  date.setHours(0, 0, 0, 0);
  const timestamp = new Date(date);
  timestamp.setHours(10);
  return {
    zikrId: 1,
    count,
    source: 'app',
    timestamp,
    date,
    editableUntil: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('recentDailyAverage', () => {
  it('averages the full days before today and never includes today', () => {
    const sessions = [
      sessionOn(-1, 100),
      sessionOn(-2, 50),
      sessionOn(-3, 40),
      sessionOn(0, 999), // today — an in-progress day never joins its own rhythm
      sessionOn(-9, 1000), // outside the window — excluded
    ];
    // (100 + 50 + 40) / 7 → round(27.14)
    expect(recentDailyAverage(sessions, 7, NOW)).toBe(27);
  });

  it('returns 0 when the window has no history', () => {
    expect(recentDailyAverage([], 7, NOW)).toBe(0);
    expect(recentDailyAverage([sessionOn(0, 500)], 7, NOW)).toBe(0);
  });

  it('honors a custom window length', () => {
    const sessions = [sessionOn(-1, 100), sessionOn(-2, 100)];
    expect(recentDailyAverage(sessions, 2, NOW)).toBe(100);
  });
});
