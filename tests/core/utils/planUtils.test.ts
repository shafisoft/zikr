import { describe, it, expect } from 'vitest';
import {
  getPlanPhase,
  canContribute,
  planTargetTotal,
  sharedPlanProgress,
  currentPeriodStart,
  nextPeriodStart,
  formatResetsIn,
} from '../../../src/core/utils/planUtils';
import { Plan } from '../../../src/core/db/types';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    mode: 'combined',
    period: 'one-time',
    target: 100,
    zikrs: [{ name: 'SubhanAllah', total: 0, periodTotal: 0 }],
    startDate: new Date('2026-09-10'),
    endDate: new Date('2026-09-20'),
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

describe('getPlanPhase / canContribute', () => {
  const now = new Date('2026-09-11T12:00:00');

  it('classifies one-time windows as upcoming / active / ended', () => {
    expect(getPlanPhase(plan({ startDate: new Date('2026-09-12'), endDate: new Date('2026-09-20') }), now)).toBe('upcoming');
    expect(getPlanPhase(plan(), now)).toBe('active');
    expect(getPlanPhase(plan({ startDate: new Date('2026-09-01'), endDate: new Date('2026-09-10') }), now)).toBe('ended');
  });

  it('recurring plans are always active until ended by the owner', () => {
    const daily = plan({ period: 'daily', startDate: undefined, endDate: undefined, timeZone: 'UTC' });
    expect(getPlanPhase(daily, now)).toBe('active');
    expect(canContribute(daily, now)).toBe(true);

    const ended = plan({ period: 'weekly', status: 'ended', startDate: undefined, endDate: undefined, timeZone: 'UTC' });
    expect(getPlanPhase(ended, now)).toBe('ended');
    expect(canContribute(ended, now)).toBe(false);
  });

  it('personal statuses do not gate the window', () => {
    // paused personal plans still have a live window; the toggle only
    // pauses tracking.
    expect(getPlanPhase(plan({ status: 'paused' }), now)).toBe('active');
    expect(getPlanPhase(plan({ status: 'completed' }), now)).toBe('active');
  });
});

describe('planTargetTotal', () => {
  it('uses the combined target for combined plans', () => {
    expect(planTargetTotal(plan({ target: 500 }))).toBe(500);
  });

  it('sums per-zikr targets for per-zikr plans', () => {
    const perZikr = plan({
      mode: 'per-zikr',
      target: undefined,
      zikrs: [
        { name: 'A', target: 300 },
        { name: 'B', target: 200 },
      ],
    });
    expect(planTargetTotal(perZikr)).toBe(500);
  });
});

describe('sharedPlanProgress', () => {
  it('one-time combined plans read the lifetime total', () => {
    const p = plan({ total: 60, periodTotal: 999, zikrs: [{ name: 'A', total: 60, periodTotal: 999 }] });
    const progress = sharedPlanProgress(p);
    expect(progress.combined).toBe(60);
    expect(progress.percent).toBe(60);
    expect(progress.done).toBe(false);
  });

  it('recurring combined plans read the current period total', () => {
    const p = plan({
      period: 'weekly',
      timeZone: 'UTC',
      startDate: undefined,
      endDate: undefined,
      total: 500,          // lifetime
      periodTotal: 120,    // this week
      target: 200,
      zikrs: [{ name: 'A', total: 500, periodTotal: 120 }],
    });
    const progress = sharedPlanProgress(p);
    expect(progress.combined).toBe(120);
    expect(progress.percent).toBe(60);
    expect(progress.done).toBe(false);
  });

  it('per-zikr plans complete only when EVERY zikr hits its target', () => {
    const p = plan({
      mode: 'per-zikr',
      target: undefined,
      zikrs: [
        { name: 'A', target: 100, total: 150 },
        { name: 'B', target: 100, total: 80 },
      ],
    });
    const progress = sharedPlanProgress(p);
    expect(progress.combined).toBe(230);
    expect(progress.target).toBe(200);
    // min(100%, 80%) = 80 — the weakest zikr is the plan's progress
    expect(progress.percent).toBe(80);
    expect(progress.done).toBe(false);

    const done = sharedPlanProgress(plan({
      mode: 'per-zikr',
      target: undefined,
      zikrs: [
        { name: 'A', target: 100, total: 100 },
        { name: 'B', target: 100, total: 140 },
      ],
    }));
    expect(done.percent).toBe(100);
    expect(done.done).toBe(true);
  });
});

describe('currentPeriodStart', () => {
  it('daily starts at today midnight in the plan timezone', () => {
    const now = new Date('2026-09-11T18:30:00Z'); // Sep 12 00:30 in Dhaka
    const start = currentPeriodStart('daily', 'Asia/Dhaka', now);
    expect(start.toISOString()).toBe('2026-09-11T18:00:00.000Z'); // Sep 12 00:00 Dhaka
  });

  it('weekly starts at this Monday midnight', () => {
    // 2026-09-11 is a Friday; Monday was 2026-09-07. 12:00Z = 08:00 NY.
    const now = new Date('2026-09-11T12:00:00Z');
    const start = currentPeriodStart('weekly', 'America/New_York', now);
    expect(start.toISOString()).toBe('2026-09-07T04:00:00.000Z'); // NY midnight Monday
  });

  it('monthly starts on the 1st', () => {
    const now = new Date('2026-09-11T12:00:00Z');
    const start = currentPeriodStart('monthly', 'UTC', now);
    expect(start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('contributions exactly at the start belong to the period', () => {
    const start = currentPeriodStart('daily', 'UTC', new Date('2026-09-11T12:00:00Z'));
    expect(start.getTime()).toBeLessThanOrEqual(new Date('2026-09-11T12:00:00Z').getTime());
  });
});

describe('nextPeriodStart', () => {
  it('daily resets at the next midnight in the plan timezone', () => {
    // 2026-09-11 17:00 UTC == 2026-09-11 23:00 in Dhaka (UTC+6, no DST) —
    // the next Dhaka midnight is 2026-09-12 00:00 there = 18:00Z same day.
    const now = new Date('2026-09-11T17:00:00Z');
    const next = nextPeriodStart('daily', 'Asia/Dhaka', now);
    expect(next.toISOString()).toBe('2026-09-11T18:00:00.000Z'); // Dhaka midnight
  });

  it('at exactly the boundary the next reset is a full period away', () => {
    // 18:00Z IS Dhaka midnight — the reset already happened; next is tomorrow.
    const now = new Date('2026-09-11T18:00:00Z');
    const next = nextPeriodStart('daily', 'Asia/Dhaka', now);
    expect(next.toISOString()).toBe('2026-09-12T18:00:00.000Z');
  });

  it('weekly resets at next Monday midnight in the plan timezone', () => {
    // 2026-09-11 is a Friday; next Monday is 2026-09-14. 12:00 UTC = 08:00 New York (EDT, UTC-4)
    const now = new Date('2026-09-11T12:00:00Z');
    const next = nextPeriodStart('weekly', 'America/New_York', now);
    expect(next.toISOString()).toBe('2026-09-14T04:00:00.000Z'); // NY midnight Monday
  });

  it('monthly resets on the 1st of the next month', () => {
    const now = new Date('2026-09-11T12:00:00Z');
    const next = nextPeriodStart('monthly', 'UTC', now);
    expect(next.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('handles a time already in the same UTC day across zones', () => {
    // 2026-09-11T02:00Z is still 2026-09-10 in New York — daily reset is
    // NY midnight on 09-11 = 04:00Z that day.
    const now = new Date('2026-09-11T02:00:00Z');
    const next = nextPeriodStart('daily', 'America/New_York', now);
    expect(next.toISOString()).toBe('2026-09-11T04:00:00.000Z');
  });
});

describe('formatResetsIn', () => {
  it('formats the time until the reset', () => {
    const now = new Date('2026-09-11T12:00:00Z');
    const text = formatResetsIn('daily', 'UTC', now);
    expect(text).toBe('12h 0m');
  });
});
