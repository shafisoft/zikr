import { describe, it, expect } from 'vitest';
import {
  normalizeRoomCode,
  isValidDelta,
  progressPercent,
  formatTimeRemaining,
  backoffDelayMs,
  windowPreset,
} from '../../../src/core/utils/sharedRoomUtils';

describe('normalizeRoomCode', () => {
  it('trims, uppercases, and strips separators', () => {
    expect(normalizeRoomCode('  abc-234 ')).toBe('ABC234');
    expect(normalizeRoomCode('xyz789')).toBe('XYZ789');
  });

  it('rejects codes that are not 6 unambiguous characters', () => {
    expect(normalizeRoomCode('abc23')).toBeNull(); // too short
    expect(normalizeRoomCode('abc2345')).toBeNull(); // too long
    expect(normalizeRoomCode('ABC2O4')).toBeNull(); // O not in alphabet
    expect(normalizeRoomCode('ABC2I4')).toBeNull(); // I not in alphabet
    expect(normalizeRoomCode('ABC2L4')).toBeNull(); // L not in alphabet
    expect(normalizeRoomCode('ABC204')).toBeNull(); // 0 not in alphabet
    expect(normalizeRoomCode('')).toBeNull();
  });

  it('accepts the full server alphabet', () => {
    expect(normalizeRoomCode('ABCDEG')).toBe('ABCDEG');
    expect(normalizeRoomCode('JKMNPZ')).toBe('JKMNPZ');
    expect(normalizeRoomCode('234567')).toBe('234567');
  });
});

describe('isValidDelta', () => {
  it('accepts integers 1..10000', () => {
    expect(isValidDelta(1)).toBe(true);
    expect(isValidDelta(33)).toBe(true);
    expect(isValidDelta(10000)).toBe(true);
  });

  it('rejects out-of-range and non-integers', () => {
    expect(isValidDelta(0)).toBe(false);
    expect(isValidDelta(-5)).toBe(false);
    expect(isValidDelta(10001)).toBe(false);
    expect(isValidDelta(3.5)).toBe(false);
    expect(isValidDelta(NaN)).toBe(false);
  });
});

describe('progressPercent', () => {
  it('computes and caps the combined percentage', () => {
    expect(progressPercent(0, 1000)).toBe(0);
    expect(progressPercent(333, 1000)).toBe(33);
    expect(progressPercent(1000, 1000)).toBe(100);
    expect(progressPercent(1500, 1000)).toBe(100); // overshoot capped
    expect(progressPercent(100, 0)).toBe(0); // degenerate target
  });
});

describe('formatTimeRemaining', () => {
  const now = new Date('2026-09-11T12:00:00');

  it('formats days, hours, minutes', () => {
    expect(formatTimeRemaining(new Date('2026-09-15T17:00:00'), now)).toBe('4d 5h');
    expect(formatTimeRemaining(new Date('2026-09-11T14:30:00'), now)).toBe('2h 30m');
    expect(formatTimeRemaining(new Date('2026-09-11T12:45:00'), now)).toBe('45m');
  });

  it('handles past and imminent ends', () => {
    expect(formatTimeRemaining(new Date('2026-09-11T11:00:00'), now)).toBe('ended');
    expect(formatTimeRemaining(new Date('2026-09-11T12:00:30'), now)).toBe('<1m');
  });
});

describe('backoffDelayMs', () => {
  it('doubles per attempt and caps at 15 minutes', () => {
    expect(backoffDelayMs(1)).toBe(30_000);
    expect(backoffDelayMs(2)).toBe(60_000);
    expect(backoffDelayMs(3)).toBe(120_000);
    expect(backoffDelayMs(10)).toBe(15 * 60_000);
    expect(backoffDelayMs(50)).toBe(15 * 60_000);
  });
});

describe('windowPreset', () => {
  it('today runs from local midnight to next midnight', () => {
    const now = new Date('2026-09-11T15:30:00'); // a Friday
    const { startsAt, endsAt } = windowPreset('today', now);
    expect(startsAt.getHours()).toBe(0);
    expect(startsAt.getDate()).toBe(11);
    expect(endsAt.getDate()).toBe(12);
    expect(endsAt.getHours()).toBe(0);
  });

  it('this week runs Monday 00:00 to next Monday 00:00', () => {
    const now = new Date('2026-09-11T15:30:00'); // Friday
    const { startsAt, endsAt } = windowPreset('week', now);
    expect(startsAt.getDay()).toBe(1); // Monday
    expect(startsAt.getDate()).toBe(7);
    expect(endsAt.getDay()).toBe(1);
    expect(endsAt.getDate()).toBe(14);
  });

  it('handles a Sunday "this week" correctly (week starts Monday)', () => {
    const sunday = new Date('2026-09-13T10:00:00');
    const { startsAt, endsAt } = windowPreset('week', sunday);
    expect(startsAt.getDay()).toBe(1);
    expect(startsAt.getDate()).toBe(7);
    expect(endsAt.getDate()).toBe(14);
  });
});
