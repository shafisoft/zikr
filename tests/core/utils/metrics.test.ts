import { describe, it, expect } from 'vitest';
import {
  todayTotal,
  totalDhikr,
  goalRingProgress,
  weeklyData,
} from '../../../src/core/utils/metrics';
import { Goal, Session } from '../../../src/core/db/types';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

function session(overrides: Partial<Session> = {}): Session {
  return {
    zikrId: 1,
    count: 10,
    source: 'app',
    timestamp: new Date(),
    date: daysAgo(0),
    editableUntil: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Session;
}

function goal(overrides: Partial<Goal> = {}): Goal {
  return {
    zikrIds: [1],
    target: 100,
    period: 'daily',
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  } as Goal;
}

describe('metrics', () => {
  it('todayTotal counts only today, across zikrs', () => {
    const sessions = [
      session({ count: 10 }),
      session({ count: 5, zikrId: 2 }),
      session({ count: 100, date: daysAgo(1) }),
    ];
    expect(todayTotal(sessions)).toBe(15);
  });

  it('totalDhikr sums everything', () => {
    expect(totalDhikr([session({ count: 10 }), session({ count: 7 })])).toBe(17);
    expect(totalDhikr([])).toBe(0);
  });

  it('goalRingProgress aggregates all active goals, overlapping zikrs once', () => {
    const goals = [
      goal({ zikrIds: [1, 2], target: 100 }),
      goal({ zikrIds: [2, 3], target: 100 }),
    ];
    const sessions = [
      session({ zikrId: 1, count: 50 }),
      session({ zikrId: 2, count: 50 }), // counts once even though covered twice
      session({ zikrId: 3, count: 25 }),
      session({ zikrId: 99, count: 999 }), // not covered by any goal
    ];
    const ring = goalRingProgress(goals, sessions, g => g.zikrIds);
    expect(ring.todayCount).toBe(125);
    expect(ring.target).toBe(200);
    expect(ring.percent).toBe(63); // 125/200
  });

  it('goalRingProgress ignores sessions with countsToGoals false', () => {
    const sessions = [
      session({ count: 50 }),
      session({ count: 50, countsToGoals: false }),
    ];
    const ring = goalRingProgress([goal({ target: 100 })], sessions, g => g.zikrIds);
    expect(ring.todayCount).toBe(50);
  });

  it('goalRingProgress ignores paused goals', () => {
    const ring = goalRingProgress(
      [goal({ status: 'paused', target: 100 })],
      [session({ count: 50 })],
      g => g.zikrIds
    );
    expect(ring.target).toBe(0);
    expect(ring.percent).toBe(0);
  });

  it('weeklyData is Monday-first, marks today, normalizes to busiest day', () => {
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    // Dates anchored to THIS week's Monday so the test is weekday-agnostic.
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    const tuesday = new Date(monday);
    tuesday.setDate(monday.getDate() + 1);
    // 2 today, 10 on this week's Tuesday
    const sessions = [
      session({ count: 2, date: now }),
      session({ count: 10, date: tuesday }),
    ];
    const week = weeklyData(sessions, labels);
    expect(week).toHaveLength(7);
    const todayPoint = week.find(p => p.isToday);
    const tuesdayPoint = week[1];
    expect(tuesdayPoint.value).toBe(100); // busiest day
    expect(todayPoint?.value).toBe(20); // 2/10 normalized
    // Labels pass through in order
    expect(week.map(p => p.day)).toEqual(labels);
  });

  it('weeklyData with no sessions returns zeroed week with one today flag', () => {
    const week = weeklyData([], ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(week.every(p => p.value === 0)).toBe(true);
    expect(week.filter(p => p.isToday)).toHaveLength(1);
  });
});
