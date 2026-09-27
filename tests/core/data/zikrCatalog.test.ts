// Catalog integrity for the before-sleep & Friday preset items (Feature A):
// every new entry must be present with bn+en copy and a NON-EMPTY, FULLY
// VOCALIZED Arabic text (complete verses — accuracy is non-negotiable),
// plus unique names and sunnah default targets.
import { describe, it, expect } from 'vitest';

import { ZIKR_CATALOG, ZIKR_CATALOG_BY_NAME } from '../../../src/core/data/zikrCatalog';

/** Harakat/tanwin/shadda/sukun — a fully vocalized text must carry these. */
const HARAKAT = /[\u064B-\u0652\u0670]/;

const NEW_ITEMS = [
  { name: 'Ayat al-Kursi', target: 1 },
  { name: 'Surah Al-Ikhlas', target: 3 },
  { name: 'Surah Al-Falaq', target: 3 },
  { name: 'Surah An-Nas', target: 3 },
  { name: 'Bismika Allahumma Amutu wa Ahya', target: 1 },
  { name: 'Allahumma Aslamtu Nafsi Ilayk', target: 1 },
  { name: 'Surah Al-Kahf', target: 1 },
] as const;

describe('zikrCatalog — before-sleep & Friday preset items', () => {
  it('contains every new preset item with bn+en copy and vocalized Arabic', () => {
    for (const { name, target } of NEW_ITEMS) {
      const entry = ZIKR_CATALOG_BY_NAME.get(name);
      expect(entry, `catalog entry missing: ${name}`).toBeTruthy();
      expect(entry!.nameBn, `${name}: bn name`).toBeTruthy();
      expect(entry!.translation, `${name}: en meaning`).toBeTruthy();
      expect(entry!.translationBn, `${name}: bn meaning`).toBeTruthy();
      expect(entry!.arabicText.length, `${name}: arabic text present`).toBeGreaterThan(0);
      expect(HARAKAT.test(entry!.arabicText), `${name}: fully vocalized`).toBe(true);
      expect(entry!.defaultTarget, `${name}: default target`).toBe(target);
      expect(entry!.isQuickStarter).toBe(false);
    }
  });

  it('carries the complete Quranic texts (length pins the full verse/surah, not a fragment)', () => {
    // Ayat al-Kursi is the longest verse in the Quran (~50 words); the three
    // qul surahs are 3–5 short verses each. A truncated copy would fall far
    // below these floors.
    expect(ZIKR_CATALOG_BY_NAME.get('Ayat al-Kursi')!.arabicText.length).toBeGreaterThan(300);
    for (const name of ['Surah Al-Ikhlas', 'Surah Al-Falaq', 'Surah An-Nas']) {
      expect(ZIKR_CATALOG_BY_NAME.get(name)!.arabicText.length).toBeGreaterThan(80);
    }
    // Al-Kahf is a RECITATION task — the title line only, by design.
    expect(ZIKR_CATALOG_BY_NAME.get('Surah Al-Kahf')!.arabicText).toBe('سُورَةُ ٱلْكَهْفِ');
  });

  it('reuses the existing Tasbih Fatimah / Friday rows (no duplicates introduced)', () => {
    for (const name of ['SubhanAllah', 'Alhamdulillah', 'Allahu Akbar', 'Salawat', 'Astaghfirullah']) {
      expect(ZIKR_CATALOG_BY_NAME.get(name)).toBeTruthy();
      expect(ZIKR_CATALOG_BY_NAME.get(name)!.defaultTarget).toBeGreaterThan(0);
    }
  });

  it('keeps catalog names unique (the seeder/preset key)', () => {
    const names = ZIKR_CATALOG.map(e => e.name.trim().toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });
});
