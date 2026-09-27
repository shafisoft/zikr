// Library search filter (remediation 1.3): names match case/whitespace-
// insensitively, Bangla names and Arabic text match as typed.
import { describe, it, expect } from 'vitest';
import { zikrMatchesSearch } from '../../../src/ui/utils/zikrSearch';
import { Zikr } from '../../../src/core/db/types';

const zikr: Partial<Zikr> = {
  name: 'SubhanAllah',
  nameBn: 'সুবহানাল্লাহ',
  arabicText: 'سُبْحَانَ اللَّه',
};
const asZikr = (overrides: Partial<Zikr> = {}) => ({ ...zikr, ...overrides } as Zikr);

describe('zikrMatchesSearch', () => {
  it('finds by Latin name, case- and whitespace-insensitively', () => {
    expect(zikrMatchesSearch(asZikr(), 'subhan')).toBe(true);
    expect(zikrMatchesSearch(asZikr(), '  SUBHAN  ')).toBe(true);
    expect(zikrMatchesSearch(asZikr(), 'allah')).toBe(true);
  });

  it('finds by Bangla name', () => {
    expect(zikrMatchesSearch(asZikr(), 'সুবহানাল্লাহ')).toBe(true);
    expect(zikrMatchesSearch(asZikr(), 'সুবহা')).toBe(true);
  });

  it('finds by Arabic text', () => {
    expect(zikrMatchesSearch(asZikr(), 'سُبْحَانَ')).toBe(true);
  });

  it('does not match unrelated queries', () => {
    expect(zikrMatchesSearch(asZikr(), 'alhamdulillah')).toBe(false);
  });

  it('matches everything on an empty/blank query', () => {
    expect(zikrMatchesSearch(asZikr(), '')).toBe(true);
    expect(zikrMatchesSearch(asZikr(), '   ')).toBe(true);
  });

  it('tolerates zikrs without bn name or arabic text', () => {
    const minimal = asZikr({ nameBn: undefined, arabicText: undefined });
    expect(zikrMatchesSearch(minimal, 'subhan')).toBe(true);
    expect(zikrMatchesSearch(minimal, 'সুবহা')).toBe(false);
  });
});
