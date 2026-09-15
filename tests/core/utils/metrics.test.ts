import { describe, it, expect } from 'vitest';
import {
  todayTotal,
  totalDhikr,
  planRingProgress,
  weeklyData,
} from '../../../src/core/utils/metrics';
import { Plan, Session } from '../../../src/core/db/types';

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

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    mode: 'combined',
    zikrs: [{ zikrId: 1, name: 'SubhanAllah' }],
    target: 100,
    period: 'daily',
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  } as Plan;
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

  it('planRingProgress aggregates all active plans, overlapping zikrs once', () => {
    const plans = [
      plan({ id: 'plan-1', zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }], target: 100 }),
      plan({ id: 'plan-2', zikrs: [{ zikrId: 2, name: 'B' }, { zikrId: 3, name: 'C' }], target: 100 }),
    ];
    const sessions = [
      session({ zikrId: 1, count: 50 }),
      session({ zikrId: 2, count: 50 }), // counts once even though covered twice
      session({ zikrId: 3, count: 25 }),
      session({ zikrId: 99, count: 999 }), // not covered by any goal
    ];
    const ring = planRingProgress(plans, sessions);
    expect(ring.todayCount).toBe(125);
    expect(ring.target).toBe(200);
    expect(ring.percent).toBe(63); // 125/200
  });

  it('planRingProgress ignores sessions with countsToGoals false', () => {
    const sessions = [
      session({ count: 50 }),
      session({ count: 50, countsToGoals: false }),
    ];
    const ring = planRingProgress([plan({ target: 100 })], sessions);
    expect(ring.todayCount).toBe(50);
  });

  it('planRingProgress ignores paused plans', () => {
    const ring = planRingProgress(
      [plan({ status: 'paused', target: 100 })],
      [session({ count: 50 })]
    );
    expect(ring.target).toBe(0);
    expect(ring.percent).toBe(0);
  });

  it('planRingProgress sums per-zikr targets for per-zikr plans', () => {
    const perZikr = plan({
      mode: 'per-zikr',
      target: undefined,
      zikrs: [
        { zikrId: 1, name: 'A', target: 60 },
        { zikrId: 2, name: 'B', target: 40 },
      ],
    });
    const ring = planRingProgress([perZikr], [session({ zikrId: 1, count: 50 })]);
    expect(ring.target).toBe(100);
    expect(ring.todayCount).toBe(50);
  });

  it('weeklyData is Monday-first, marks today, normalizes to busiest day', () => {
    const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    // Dates anchored to THIS week's Monday so the test is weekday-agnostic.
    const now = new Date();
    const dow = now.getDay();
    const monday = new Date(now);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
    // A day in the current week that is guaranteed NOT today: Monday when
    // today isn't Monday, Wednesday otherwise (avoids same-day collisions).
    const otherDay = new Date(monday);
    otherDay.setDate(monday.getDate() + (dow === 1 ? 2 : 0));
    // 2 today, 10 on the other day
    const sessions = [
      session({ count: 2, date: now }),
      session({ count: 10, date: otherDay }),
    ];
    const week = weeklyData(sessions, labels);
    expect(week).toHaveLength(7);
    const todayPoint = week.find(p => p.isToday);
    const otherIndex = Math.round((otherDay.getTime() - monday.getTime()) / 86_400_000);
    expect(week[otherIndex].value).toBe(100); // busiest day
    expect(todayPoint?.value).toBe(20); // 2/10 normalized
    expect(week.filter(p => p.isToday)).toHaveLength(1);
    // Labels pass through in order
    expect(week.map(p => p.day)).toEqual(labels);
  });

  it('weeklyData with no sessions returns zeroed week with one today flag', () => {
    const week = weeklyData([], ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    expect(week.every(p => p.value === 0)).toBe(true);
    expect(week.filter(p => p.isToday)).toHaveLength(1);
  });
});
