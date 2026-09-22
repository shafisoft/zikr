import { describe, it, expect } from 'vitest';
import {
  getPlanPhase,
  canContribute,
  planTargetTotal,
  sharedPlanProgress,
  currentPeriodStart,
  nextPeriodStart,
  formatResetsIn,
  planDisplayName,
  matchLocalZikr,
  sharedZikrTotal,
  planZikrTarget,
  planSequence,
  buildGoalRows,
} from '../../../src/core/utils/planUtils';
import { Plan, Zikr } from '../../../src/core/db/types';

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

// ---------- Countable surfaces (counter entry points) ----------

function zikr(id: number, name = `Zikr ${id}`): Zikr {
  return { id, name, custom: false, createdAt: new Date() };
}

describe('planDisplayName', () => {
  it('prefers the plan title and trims it', () => {
    expect(planDisplayName(plan({ title: '  Morning azkar  ' }))).toBe('Morning azkar');
  });

  it('falls back to the covered zikrs names', () => {
    expect(planDisplayName(plan({ title: '   ' }))).toBe('SubhanAllah');
  });
});

describe('matchLocalZikr', () => {
  const zikrs = [zikr(1, 'SubhanAllah'), zikr(2, 'Alhamdulillah')];

  it('binds personal entries by id, even against a different name', () => {
    expect(matchLocalZikr(zikrs, { name: 'Alhamdulillah', zikrId: 1 })).toEqual(zikrs[0]);
  });

  it('binds group entries by exact name', () => {
    expect(matchLocalZikr(zikrs, { name: 'Alhamdulillah' })).toEqual(zikrs[1]);
  });

  it('returns undefined when nothing matches', () => {
    expect(matchLocalZikr(zikrs, { name: 'Allahu Akbar' })).toBeUndefined();
  });
});

describe('sharedZikrTotal', () => {
  it('reads the current-period total for recurring plans', () => {
    expect(sharedZikrTotal({ total: 999, periodTotal: 7 }, true)).toBe(7);
  });

  it('reads the lifetime total for one-time plans', () => {
    expect(sharedZikrTotal({ total: 999, periodTotal: 7 }, false)).toBe(999);
  });

  it('treats a missing entry as zero', () => {
    expect(sharedZikrTotal(undefined, true)).toBe(0);
  });
});

describe('planZikrTarget', () => {
  it('uses the combined target regardless of zikr', () => {
    expect(planZikrTarget(plan({ target: 500 }), 1)).toBe(500);
  });

  it('uses the matching per-zikr target', () => {
    const p = plan({
      mode: 'per-zikr',
      target: undefined,
      zikrs: [
        { name: 'SubhanAllah', zikrId: 1, target: 100 },
        { name: 'Alhamdulillah', zikrId: 2, target: 200 },
      ],
    });
    expect(planZikrTarget(p, 2)).toBe(200);
    expect(planZikrTarget(p, 3)).toBeUndefined();
  });
});

describe('planSequence', () => {
  const zikrs = [zikr(1, 'SubhanAllah'), zikr(2, 'Alhamdulillah'), zikr(3, 'Allahu Akbar')];

  it('lists countable steps in plan order, skipping zikrs missing locally', () => {
    const p = plan({
      mode: 'per-zikr',
      zikrs: [
        { name: 'SubhanAllah', zikrId: 1, target: 33 },
        { name: 'Missing locally', zikrId: 9, target: 10 },
        { name: 'Alhamdulillah', zikrId: 2, target: 34 },
      ],
    });
    expect(planSequence(p, zikrs)).toEqual([
      { target: 33, zikr: zikrs[0] },
      { target: 34, zikr: zikrs[1] },
    ]);
  });

  it('does not sequence combined plans or a missing plan', () => {
    expect(planSequence(plan(), zikrs)).toEqual([]);
    expect(planSequence(undefined, zikrs)).toEqual([]);
  });
});

describe('buildGoalRows', () => {
  const zikrs = [zikr(1, 'SubhanAllah'), zikr(2, 'Alhamdulillah')];
  const now = new Date('2026-09-11T12:00:00');
  const activeRoom = { code: 'ABC123', title: 'Fajr Group', status: 'active' as const };
  const closedRoom = { code: 'OLD123', title: 'Old Group', status: 'closed' as const };

  const progressOf = (p: Plan) => {
    if (p.mode !== 'per-zikr') return { currentCount: 40, perZikr: [] };
    return {
      currentCount: 60,
      perZikr: p.zikrs.map((z, i) => ({
        name: z.name,
        zikrId: z.zikrId,
        currentCount: (i + 1) * 10,
        target: z.target ?? 0,
      })),
    };
  };

  const build = (overrides: Partial<Parameters<typeof buildGoalRows>[0]> = {}) =>
    buildGoalRows({
      personalPlans: [],
      groupPlans: [],
      rooms: [],
      zikrs,
      sessions: [],
      progressOf,
      now,
      ...overrides,
    });

  it('lists personal per-zikr rows, skipping unbound zikrs and zero targets', () => {
    const p = plan({
      mode: 'per-zikr',
      zikrs: [
        { name: 'SubhanAllah', zikrId: 1, target: 50 },
        { name: 'Missing locally', zikrId: 9, target: 25 },
        { name: 'No target', zikrId: 2 },
      ],
    });
    expect(build({ personalPlans: [p] })).toEqual([
      {
        key: `p:${p.id}:1`,
        zikrId: 1,
        title: 'SubhanAllah',
        current: 10,
        target: 50,
        planId: p.id,
      },
    ]);
  });

  it('hides paused and completed personal plans even inside a live window', () => {
    expect(build({ personalPlans: [plan({ status: 'paused' })] })).toEqual([]);
    expect(build({ personalPlans: [plan({ status: 'completed' })] })).toEqual([]);
  });

  it('hides personal plans whose one-time window has ended', () => {
    expect(
      build({
        personalPlans: [
          plan({ startDate: new Date('2026-09-01'), endDate: new Date('2026-09-10') }),
        ],
      })
    ).toEqual([]);
  });

  it('shows a personal combined plan as one row toward the combined target', () => {
    const p = plan({
      title: 'Morning azkar',
      target: 500,
      zikrs: [{ name: 'SubhanAllah', zikrId: 1 }],
    });
    expect(build({ personalPlans: [p] })).toEqual([
      {
        key: `p:${p.id}`,
        zikrId: 1,
        title: 'Morning azkar',
        current: 40,
        target: 500,
        planId: p.id,
      },
    ]);
  });

  it('lists group per-zikr rows from mirror fields with the room as subtitle', () => {
    const g = plan({
      mode: 'per-zikr',
      period: 'daily',
      startDate: undefined,
      endDate: undefined,
      timeZone: 'UTC',
      roomCode: 'ABC123',
      zikrs: [{ name: 'SubhanAllah', target: 100, total: 999, periodTotal: 33 }],
    });
    expect(build({ groupPlans: [g], rooms: [activeRoom] })).toEqual([
      {
        key: `g:${g.id}:SubhanAllah`,
        zikrId: 1,
        title: 'SubhanAllah',
        subtitle: 'Fajr Group',
        current: 33,
        target: 100,
      },
    ]);
  });

  it('skips group rows whose room is closed or zikr is not in the local library', () => {
    const closed = plan({
      mode: 'per-zikr',
      period: 'daily',
      startDate: undefined,
      endDate: undefined,
      timeZone: 'UTC',
      roomCode: 'OLD123',
      zikrs: [{ name: 'SubhanAllah', target: 100 }],
    });
    expect(build({ groupPlans: [closed], rooms: [closedRoom] })).toEqual([]);

    const unmatched = plan({
      mode: 'per-zikr',
      period: 'daily',
      startDate: undefined,
      endDate: undefined,
      timeZone: 'UTC',
      roomCode: 'ABC123',
      zikrs: [{ name: 'Not in my library', target: 100 }],
    });
    expect(build({ groupPlans: [unmatched], rooms: [activeRoom] })).toEqual([]);
  });

  it('reads one-time group progress from lifetime totals', () => {
    const g = plan({
      roomCode: 'ABC123',
      total: 250,
      zikrs: [{ name: 'SubhanAllah', target: 100, total: 250, periodTotal: 5 }],
    });
    expect(build({ groupPlans: [g], rooms: [activeRoom] })).toEqual([
      {
        key: `g:${g.id}`,
        zikrId: 1,
        title: 'SubhanAllah',
        subtitle: 'Fajr Group',
        current: 250,
        target: 100,
      },
    ]);
  });

  it('hides group plans without a usable combined target', () => {
    const g = plan({ roomCode: 'ABC123', target: undefined });
    expect(build({ groupPlans: [g], rooms: [activeRoom] })).toEqual([]);
  });
});
