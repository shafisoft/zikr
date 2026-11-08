// Quiet insights (Noor 2.0 phase 3): bestPracticeHour buckets session
// timestamps by device-local hour; topZikr sums lifetime counts per zikr.
import { describe, it, expect } from 'vitest';
import { bestPracticeHour, topZikr } from '../../../src/core/utils/metrics';
import type { Session } from '../../../src/core/db/types';

function session(zikrId: number, count: number, hour: number): Session {
  const timestamp = new Date(2026, 10, 8, hour, 15);
  const date = new Date(2026, 10, 8);
  return {
    zikrId,
    count,
    source: 'app',
    timestamp,
    date,
    editableUntil: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

describe('bestPracticeHour', () => {
  it('returns the hour bucket with the most counted dhikr', () => {
    const sessions = [
      session(1, 33, 5),
      session(1, 33, 5),
      session(2, 100, 5),
      session(1, 10, 21),
    ];
    expect(bestPracticeHour(sessions)).toEqual({ hour: 5, count: 166 });
  });

  it('returns null with no sessions', () => {
    expect(bestPracticeHour([])).toBeNull();
  });
});

describe('topZikr', () => {
  it('sums lifetime counts per zikr and returns the leader', () => {
    const sessions = [
      session(1, 33, 5),
      session(1, 33, 6),
      session(2, 100, 7),
      session(3, 99, 8),
    ];
    expect(topZikr(sessions)).toEqual({ zikrId: 2, count: 100 });
  });

  it('returns null with no sessions', () => {
    expect(topZikr([])).toBeNull();
  });
});
