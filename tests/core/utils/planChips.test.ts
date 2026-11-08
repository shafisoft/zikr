import { describe, it, expect } from 'vitest';
import { buildPlanChips } from '../../../src/core/utils/planUtils';
import { Plan } from '../../../src/core/db/types';

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'plan-1',
    mode: 'combined',
    period: 'one-time',
    target: 100,
    zikrs: [{ name: 'SubhanAllah', total: 0, periodTotal: 0 }],
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

const progressOf = () => ({ currentCount: 40, perZikr: [] });

describe('buildPlanChips', () => {
  it('personal chips read the owner progress against the plan target', () => {
    const chips = buildPlanChips({
      personalPlans: [plan()],
      groupPlans: [],
      sessions: [],
      progressOf,
    });
    expect(chips).toEqual([
      { key: 'personal-plan-1', title: 'SubhanAllah', percent: 40, group: false },
    ]);
  });

  it('caps at 100 — a won plan reads 100%, never more', () => {
    const chips = buildPlanChips({
      personalPlans: [plan()],
      groupPlans: [],
      sessions: [],
      progressOf: () => ({ currentCount: 140, perZikr: [] }),
    });
    expect(chips[0].percent).toBe(100);
  });

  it('completed plans stay visible; paused plans stay hidden', () => {
    const chips = buildPlanChips({
      personalPlans: [plan({ id: 'done', status: 'completed' }), plan({ id: 'paused', status: 'paused' })],
      groupPlans: [],
      sessions: [],
      progressOf,
    });
    expect(chips.map(c => c.key)).toEqual(['personal-done']);
  });

  it('group chips read the server mirror and carry group: true', () => {
    const group = plan({
      id: 'g1',
      title: 'Group khatma',
      mode: 'per-zikr',
      period: 'monthly',
      timeZone: 'UTC',
      roomCode: 'AB12',
      target: undefined,
      zikrs: [{ name: 'Ya Mufattih', target: 200, periodTotal: 50, total: 900 }],
    });
    const chips = buildPlanChips({
      personalPlans: [],
      groupPlans: [group],
      sessions: [],
      progressOf,
    });
    expect(chips).toEqual([
      { key: 'group-g1', title: 'Group khatma', percent: 25, group: true },
    ]);
  });

  it('group plans outside their active window stay hidden', () => {
    const upcoming = plan({
      id: 'g2',
      mode: 'per-zikr',
      period: 'one-time',
      target: undefined,
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-08-01'),
      roomCode: 'CD34',
      zikrs: [{ name: 'Ya Mufattih', target: 200, periodTotal: 50 }],
    });
    const chips = buildPlanChips({
      personalPlans: [],
      groupPlans: [upcoming],
      sessions: [],
      progressOf,
    });
    expect(chips).toEqual([]);
  });

  it('personal chips come first, then group chips', () => {
    const chips = buildPlanChips({
      personalPlans: [plan({ id: 'p1' })],
      groupPlans: [plan({ id: 'g1', title: 'Group', roomCode: 'AB12' })],
      sessions: [],
      progressOf,
    });
    expect(chips.map(c => c.key)).toEqual(['personal-p1', 'group-g1']);
  });

  it('zero-target plans read 0% rather than NaN', () => {
    const chips = buildPlanChips({
      personalPlans: [plan({ target: undefined })],
      groupPlans: [],
      sessions: [],
      progressOf,
    });
    expect(chips[0].percent).toBe(0);
  });
});
