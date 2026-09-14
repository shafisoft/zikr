import { describe, it, expect } from 'vitest';
import { calculateOverallStreak } from '../../../src/core/utils/overallStreak';

const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

describe('calculateOverallStreak', () => {
  it('counts consecutive days ending today', () => {
    expect(calculateOverallStreak([daysAgo(0), daysAgo(1), daysAgo(2)])).toBe(3);
  });

  it('does not break the streak before today has a session (grace rule)', () => {
    // Practiced yesterday and before, nothing yet today — streak survives.
    expect(calculateOverallStreak([daysAgo(1), daysAgo(2)])).toBe(2);
  });

  it('breaks on a full missed day', () => {
    // Gap at daysAgo(1): streak is only today.
    expect(calculateOverallStreak([daysAgo(0), daysAgo(2)])).toBe(1);
  });

  it('returns 0 with no recent practice', () => {
    expect(calculateOverallStreak([daysAgo(5)])).toBe(0);
  });

  it('ignores future sessions and duplicates', () => {
    const future = new Date(Date.now() + DAY);
    expect(calculateOverallStreak([daysAgo(0), daysAgo(0), future])).toBe(1);
  });

  it('returns 0 for empty input', () => {
    expect(calculateOverallStreak([])).toBe(0);
  });
});
