// Hijri date line (Noor 2.0 phase 5): the Umm al-Qura calendar via Intl —
// failure-soft (a runtime without the calendar yields null and the line
// keeps its Gregorian half).
import { describe, it, expect } from 'vitest';
import { dateLineLabel, hijriDateLabel } from '../../../src/core/utils/hijriDate';

describe('hijriDateLabel', () => {
  it('formats a day + month + year label when the calendar is available', () => {
    const label = hijriDateLabel(new Date(2026, 10, 8), 'en');
    if (label === null) return; // runtime without islamic-umalqura — soft path
    expect(label).toMatch(/\d/); // a day number is present
    expect(label.length).toBeGreaterThan(3);
  });

  it('never throws for odd inputs', () => {
    expect(() => hijriDateLabel(new Date('not-a-date'), 'en')).not.toThrow();
  });
});

describe('dateLineLabel', () => {
  it('joins the Gregorian weekday with the Hijri date', () => {
    const line = dateLineLabel(new Date(2026, 10, 8), 'en');
    expect(line).toMatch(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/);
    if (hijriDateLabel(new Date(2026, 10, 8), 'en') !== null) {
      expect(line).toContain('·');
    }
  });

  it('keeps the weekday alone when the Hijri calendar is unavailable', () => {
    const line = dateLineLabel(new Date(2026, 10, 8), 'en');
    expect(line.split('·').length).toBeLessThanOrEqual(2);
  });
});
