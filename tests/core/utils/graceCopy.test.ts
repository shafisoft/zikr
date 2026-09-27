import { describe, it, expect } from 'vitest';
import { en } from '../../../src/core/i18n/locales.en';
import { bn } from '../../../src/core/i18n/locales.bn';

/**
 * R3 "Gentle restarts" copy contract (docs/solution-design.md §11):
 * every `grace.*` key exists in BOTH locales, and none of them — in any
 * language — uses failure language (AC3.3.1: broken/failed/lost must not
 * appear; the feature's tone IS the product).
 */

const GRACE_KEYS = [
  'grace.heldAria',
  'grace.resumeLine',
  'grace.freshStart',
  'grace.promptQuestion',
  'grace.promptLog',
  'grace.promptDismiss',
] as const;

const EN_FAILURE = /broken|failed|lost|guilt/i;
const BN_FAILURE = /ভাঙ|ব্যর্থ|হারানো|হারিয়ে/;

const valueOf = (dict: Record<string, string>, key: string): string => {
  const value = dict[key];
  expect(typeof value, `missing key: ${key}`).toBe('string');
  return value as string;
};

describe('grace copy', () => {
  it('mirrors every grace.* key in en and bn (Dictionary parity)', () => {
    for (const key of GRACE_KEYS) {
      valueOf(en as unknown as Record<string, string>, key);
      valueOf(bn as unknown as Record<string, string>, key);
    }
  });

  it('uses no failure language in en (AC3.3.1)', () => {
    for (const key of GRACE_KEYS) {
      const value = valueOf(en as unknown as Record<string, string>, key);
      expect(value, `${key}`).not.toMatch(EN_FAILURE);
    }
  });

  it('uses no failure language in bn (AC3.1.2 native parity, AC3.3.1)', () => {
    for (const key of GRACE_KEYS) {
      const value = valueOf(bn as unknown as Record<string, string>, key);
      expect(value, `${key}`).not.toMatch(BN_FAILURE);
      expect(value, `${key}`).not.toMatch(EN_FAILURE); // no leaked English either
    }
  });
});
