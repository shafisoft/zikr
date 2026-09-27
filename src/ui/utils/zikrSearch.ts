import { Zikr } from '../../core/db/types';

/**
 * Library search filter (remediation 1.3). Names match case- and
 * whitespace-insensitively — the same normalization as duplicate-name
 * rejection — so "subhan" finds "SubhanAllah" and a stray space doesn't
 * hide a match. Bangla names and Arabic text match as typed.
 */
export function zikrMatchesSearch(zikr: Zikr, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  return (
    zikr.name.trim().toLowerCase().includes(query) ||
    (zikr.nameBn?.trim().toLowerCase().includes(query) ?? false) ||
    (zikr.arabicText?.trim().toLowerCase().includes(query) ?? false)
  );
}
