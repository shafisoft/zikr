import { describe, it, expect } from 'vitest';
import { computePlanProgress, getPlanZikrIds } from '../../../src/core/services/planService';
import { Plan, Session } from '../../../src/core/db/types';

// Helpers to build minimal fixture objects without touching the DB
function makePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    mode: 'combined',
    zikrs: [{ zikrId: 1, name: 'SubhanAllah' }],
    target: 100,
    period: 'daily',
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSession(zikrId: number, date: Date, count: number): Session {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return {
    id: zikrId * 1000 + count,
    zikrId,
    count,
    source: 'app',
    timestamp: date,
    date: midnight,
    editableUntil: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('getPlanZikrIds', () => {
  it('returns the local zikr ids the plan binds', () => {
    const plan = makePlan({
      zikrs: [
        { zikrId: 3, name: 'A' },
        { zikrId: 7, name: 'B' },
      ],
    });
    expect(getPlanZikrIds(plan)).toEqual([3, 7]);
  });

  it('is defensive against rows missing the field', () => {
    expect(getPlanZikrIds({ ...makePlan(), zikrs: undefined as any })).toEqual([]);
  });
});

describe('computePlanProgress — combined mode', () => {
  const today = new Date();

  it('combines counts across every zikr the plan covers', () => {
    const plan = makePlan({
      zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }],
    });
    const sessions = [
      makeSession(1, today, 30),
      makeSession(2, today, 45),
    ];
    expect(computePlanProgress(plan, sessions).currentCount).toBe(75);
  });

  it('ignores sessions of zikrs outside the plan', () => {
    const plan = makePlan({
      zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }],
    });
    const sessions = [
      makeSession(1, today, 30),
      makeSession(2, today, 45),
      makeSession(9, today, 500), // unrelated zikr
    ];
    expect(computePlanProgress(plan, sessions).currentCount).toBe(75);
  });

  it('caps the percentage at 100 across combined zikrs', () => {
    const plan = makePlan({
      zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }],
    });
    const sessions = [
      makeSession(1, today, 80),
      makeSession(2, today, 80),
    ];
    expect(computePlanProgress(plan, sessions).percentage).toBe(100);
  });

  it('counts only the current daily period', () => {
    const plan = makePlan({
      zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }],
    });
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const sessions = [
      makeSession(1, today, 30),
      makeSession(2, yesterday, 70), // yesterday — outside today's period
    ];
    expect(computePlanProgress(plan, sessions).currentCount).toBe(30);
  });

  it('respects the one-time date range across zikrs', () => {
    const plan = makePlan({
      mode: 'combined',
      zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }],
      period: 'one-time',
      startDate: new Date(2026, 8, 1),
      endDate: new Date(2026, 8, 10, 23, 59, 59, 999),
    });
    const within = new Date(2026, 8, 5);
    const before = new Date(2026, 7, 31);
    const sessions = [
      makeSession(1, within, 40),
      makeSession(2, within, 20),
      makeSession(1, before, 90), // before the window
    ];
    expect(computePlanProgress(plan, sessions).currentCount).toBe(60);
  });

  it('excludes sessions saved while "count towards goals" was off', () => {
    const plan = makePlan();
    const sessions = [
      { ...makeSession(1, today, 30), countsToGoals: false },
      makeSession(1, today, 10),
    ];
    expect(computePlanProgress(plan, sessions).currentCount).toBe(10);
  });
});

describe('computePlanProgress — per-zikr mode', () => {
  const today = new Date();

  const perZikrPlan = (): Plan =>
    makePlan({
      mode: 'per-zikr',
      target: undefined,
      zikrs: [
        { zikrId: 1, name: 'Salawat', target: 100 },
        { zikrId: 2, name: 'Istighfar', target: 200 },
      ],
    });

  it('tracks each zikr against its own target', () => {
    const progress = computePlanProgress(perZikrPlan(), [
      makeSession(1, today, 50),
      makeSession(2, today, 100),
    ]);
    expect(progress.perZikr).toHaveLength(2);
    expect(progress.perZikr[0]).toMatchObject({ name: 'Salawat', currentCount: 50, target: 100 });
    expect(progress.perZikr[1]).toMatchObject({ name: 'Istighfar', currentCount: 100, target: 200 });
  });

  it('overall progress is the WEAKEST zikr (min percentage)', () => {
    const progress = computePlanProgress(perZikrPlan(), [
      makeSession(1, today, 100), // 100%
      makeSession(2, today, 100), // 50%
    ]);
    expect(progress.percentage).toBe(50);
    expect(progress.target).toBe(300);
    expect(progress.currentCount).toBe(200);
  });

  it('reaches 100% only when every zikr hits its target', () => {
    const almost = computePlanProgress(perZikrPlan(), [
      makeSession(1, today, 100),
      makeSession(2, today, 199),
    ]);
    expect(almost.percentage).toBeLessThan(100);

    const done = computePlanProgress(perZikrPlan(), [
      makeSession(1, today, 100),
      makeSession(2, today, 200),
    ]);
    expect(done.percentage).toBe(100);
  });
});
