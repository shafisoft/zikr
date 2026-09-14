import { describe, it, expect } from 'vitest';
import { getPeriodStart, getPeriodEnd, isDateInPeriod, isPeriodComplete } from '../../../src/core/utils/goalPeriod';

// Pin a stable Wednesday to make week-start assertions deterministic
// 2026-06-10 is a Wednesday
const WED_JUNE_10 = new Date(2026, 5, 10, 12, 0, 0);

describe('getPeriodStart', () => {
  it('daily: returns midnight of the base date', () => {
    const start = getPeriodStart('daily', WED_JUNE_10);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(10);
  });

  it('weekly: returns the preceding Monday at midnight', () => {
    const start = getPeriodStart('weekly', WED_JUNE_10);
    expect(start.getDay()).toBe(1); // 1 = Monday
    expect(start.getHours()).toBe(0);
  });

  it('weekly: Monday input returns itself at midnight', () => {
    const monday = new Date(2026, 5, 8, 15, 0, 0); // 2026-06-08 is Monday
    const start = getPeriodStart('weekly', monday);
    expect(start.getDate()).toBe(8);
    expect(start.getDay()).toBe(1);
  });

  it('monthly: returns the 1st of the month at midnight', () => {
    const start = getPeriodStart('monthly', WED_JUNE_10);
    expect(start.getDate()).toBe(1);
    expect(start.getMonth()).toBe(5); // June (0-indexed)
    expect(start.getHours()).toBe(0);
  });
});

describe('getPeriodEnd', () => {
  it('daily: returns 23:59:59.999 of the base date', () => {
    const end = getPeriodEnd('daily', WED_JUNE_10);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getDate()).toBe(10);
  });

  it('weekly: returns Sunday 23:59:59.999', () => {
    const end = getPeriodEnd('weekly', WED_JUNE_10);
    expect(end.getDay()).toBe(0); // 0 = Sunday
    expect(end.getHours()).toBe(23);
  });

  it('monthly: returns the last day of the month at 23:59:59.999', () => {
    const end = getPeriodEnd('monthly', WED_JUNE_10);
    expect(end.getMonth()).toBe(5); // June
    expect(end.getDate()).toBe(30); // June has 30 days
  });
});

describe('isDateInPeriod', () => {
  it('returns true for a date that falls within the daily period', () => {
    const midday = new Date(2026, 5, 10, 12, 0, 0);
    expect(isDateInPeriod(midday, 'daily', WED_JUNE_10)).toBe(true);
  });

  it('returns false for a date outside the daily period', () => {
    const yesterday = new Date(2026, 5, 9, 23, 59, 0);
    expect(isDateInPeriod(yesterday, 'daily', WED_JUNE_10)).toBe(false);
  });

  it('returns true for a date within the same week', () => {
    const thursday = new Date(2026, 5, 11, 10, 0, 0);
    expect(isDateInPeriod(thursday, 'weekly', WED_JUNE_10)).toBe(true);
  });

  it('returns false for a date in the previous week', () => {
    const lastSunday = new Date(2026, 5, 7, 23, 0, 0);
    expect(isDateInPeriod(lastSunday, 'weekly', WED_JUNE_10)).toBe(false);
  });
});

describe('isPeriodComplete', () => {
  it('returns false for daily period (rolling, never complete)', () => {
    expect(isPeriodComplete({ period: 'daily' }, WED_JUNE_10)).toBe(false);
  });

  it('returns false for weekly period (rolling, never complete)', () => {
    expect(isPeriodComplete({ period: 'weekly' }, WED_JUNE_10)).toBe(false);
  });

  it('returns true for a custom period whose end date is in the past', () => {
    const goal = {
      period: 'custom' as const,
      startDate: new Date(2026, 4, 1),
      endDate: new Date(2026, 4, 31),
    };
    expect(isPeriodComplete(goal, WED_JUNE_10)).toBe(true);
  });

  it('returns false for a custom period still in progress', () => {
    const goal = {
      period: 'custom' as const,
      startDate: new Date(2026, 5, 1),
      endDate: new Date(2026, 5, 30),
    };
    expect(isPeriodComplete(goal, WED_JUNE_10)).toBe(false);
  });
});
