// practiceDayStates (Noor 2.0 phase 3) — the 30-day dot strip reads the
// SAME walk as the streak badge:
//   - a practiced day is 'done', however old the streak story around it
//   - a single gap the walk forgave is 'grace' (the shield)
//   - a day before the walk's double-gap break is 'missed'
//   - today without a session is 'pending' (it breaks nothing, R3.0)
import { describe, it, expect } from 'vitest';
import { practiceDayStates } from '../../../src/core/utils/overallStreak';

const TODAY = new Date(2026, 10, 8); // fixed local midnight

/** Midnight date `offset` days from TODAY (negative = past). */
function day(offset: number): Date {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offset);
  return d;
}

function states(offsets: number[], days = 10) {
  return practiceDayStates(offsets.map(day), days, TODAY);
}

function byOffset(result: ReturnType<typeof states>, offset: number) {
  // result is oldest-first ending today: offset 0 = last entry
  return result[result.length - 1 + offset].state;
}

describe('practiceDayStates', () => {
  it('marks practiced days done, including today', () => {
    const result = states([-2, -1, 0], 5);
    expect(byOffset(result, 0)).toBe('done');
    expect(byOffset(result, -1)).toBe('done');
    expect(byOffset(result, -2)).toBe('done');
  });

  it('an interior single gap reads as grace (the walk forgave it)', () => {
    // practiced every day except one gap three days ago
    const result = states([-6, -5, -4, -2, -1, 0], 8);
    expect(byOffset(result, -3)).toBe('grace');
    expect(byOffset(result, -4)).toBe('done');
  });

  it('the trailing single gap (yesterday, nothing today) is grace too', () => {
    const result = states([-4, -3, -2], 6);
    expect(byOffset(result, -1)).toBe('grace');
    expect(byOffset(result, 0)).toBe('pending');
  });

  it('a double gap breaks the walk — both days are plain missed, today pending', () => {
    const result = states([-5, -4, -3], 7);
    expect(byOffset(result, -1)).toBe('missed');
    expect(byOffset(result, -2)).toBe('missed');
    expect(byOffset(result, 0)).toBe('pending');
    // days before the break keep their truth…
    expect(byOffset(result, -3)).toBe('done');
    // …including practiced days far off the walked chain.
    expect(byOffset(result, -5)).toBe('done');
  });

  it('a brand-new day with no history: all missed except a pending today', () => {
    const result = states([], 4);
    expect(result.map(d => d.state)).toEqual(['missed', 'missed', 'missed', 'pending']);
  });

  it('returns oldest-first over the requested window', () => {
    const result = states([0], 3);
    expect(result.map(d => d.state)).toEqual(['missed', 'missed', 'done']);
  });
});
