import { describe, it, expect } from 'vitest';
import {
  emptyGroupPlanDraft,
  validateGroupPlanDraft,
  groupPlanToInput,
  GroupPlanDraft,
} from '../../../src/ui/components/GroupPlanBuilder';

// ---------- draft helper ----------

function draft(overrides: Partial<GroupPlanDraft> = {}, zikrs?: GroupPlanDraft['zikrs']): GroupPlanDraft {
  return {
    ...emptyGroupPlanDraft(),
    zikrs: zikrs ?? [{ name: 'Salawat', target: 33 }],
    ...overrides,
  };
}

function futureWindow(): { startDate: string; endDate: string } {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end) };
}

describe('validateGroupPlanDraft', () => {
  it('rejects an empty zikr selection', () => {
    expect(validateGroupPlanDraft(draft({}, []))).toBe('createRoom.chooseZikr');
  });

  it('rejects a selected zikr without a target (per-zikr is mandatory)', () => {
    expect(
      validateGroupPlanDraft(draft({}, [{ name: 'Salawat' }]))
    ).toBe('createRoom.invalidTarget');
  });

  it('rejects targets out of range', () => {
    expect(validateGroupPlanDraft(draft({}, [{ name: 'S', target: 0 }]))).toBe('createRoom.invalidTarget');
    expect(validateGroupPlanDraft(draft({}, [{ name: 'S', target: -5 }]))).toBe('createRoom.invalidTarget');
    expect(validateGroupPlanDraft(draft({}, [{ name: 'S', target: 100000001 }]))).toBe('createRoom.invalidTarget');
    expect(validateGroupPlanDraft(draft({}, [{ name: 'S', target: NaN }]))).toBe('createRoom.invalidTarget');
  });

  it('accepts a valid recurring plan with all targets set', () => {
    const d = draft({ period: 'daily' }, [
      { name: 'Salawat', target: 100 },
      { name: 'Astaghfirullah', target: 100000000 },
    ]);
    expect(validateGroupPlanDraft(d)).toBeNull();
  });

  it('rejects a one-time plan whose window is missing or empty', () => {
    // one-time is the draft default: presets other than 'custom' derive the
    // window, but a custom preset without dates cannot.
    expect(validateGroupPlanDraft(draft({ preset: 'custom' }))).toBe('createRoom.endInFuture');
  });

  it('accepts a one-time plan with a valid future custom window', () => {
    expect(validateGroupPlanDraft(draft({ preset: 'custom', ...futureWindow() }))).toBeNull();
  });

  it('rejects a custom window that ends before it starts', () => {
    const win = futureWindow();
    expect(
      validateGroupPlanDraft(draft({ preset: 'custom', startDate: win.endDate, endDate: win.startDate }))
    ).toBe('createRoom.endAfterStart');
  });
});

describe('groupPlanToInput', () => {
  it('always emits per-zikr mode with per-zikr targets', () => {
    const input = groupPlanToInput(draft({ title: '  Khatma  ', period: 'daily' }, [
      { name: 'Salawat', target: 100 },
    ]));
    expect(input.mode).toBe('per-zikr');
    expect(input.target).toBeUndefined();
    expect(input.title).toBe('Khatma');
    expect(input.timeZone).toBeTruthy();
    expect(input.zikrs).toEqual([{ name: 'Salawat', arabic: undefined, target: 100 }]);
  });

  it('omits timeZone for one-time windows (the window carries the clock)', () => {
    const input = groupPlanToInput(draft({ preset: 'custom', ...futureWindow() }));
    expect(input.timeZone).toBeUndefined();
    expect(input.startsAt).toBeTruthy();
    expect(input.endsAt).toBeTruthy();
  });
});
