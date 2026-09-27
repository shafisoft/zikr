// Content integrity (fatal-class checks): the revealed texts in the catalog
// must match the canonical sources word-for-word, and hadith-anchored counts
// must keep their anchors. Normalized comparison tolerates orthographic mark
// differences (dagger alifs, wajla) but fails on any word change, omission
// or insertion.
import { describe, it, expect } from 'vitest';
import { ZIKR_CATALOG_BY_NAME } from '../../../src/core/data/zikrCatalog';

// Canonical Uthmani text from api.quran.com (Tanzil text_uthmani), fetched
// 2026-09-27. Ayah separators (۝) added for display.
const CANONICAL_QURAN: Record<string, string> = {
  'Ayat al-Kursi':
    'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ۚ لَا تَأْخُذُهُۥ سِنَةٌۭ وَلَا نَوْمٌۭ ۚ لَّهُۥ مَا فِى ٱلسَّمَٰوَٰتِ وَمَا فِى ٱلْأَرْضِ ۗ مَن ذَا ٱلَّذِى يَشْفَعُ عِندَهُۥٓ إِلَّا بِإِذْنِهِۦ ۚ يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ ۖ وَلَا يُحِيطُونَ بِشَىْءٍۢ مِّنْ عِلْمِهِۦٓ إِلَّا بِمَا شَآءَ ۚ وَسِعَ كُرْسِيُّهُ ٱلسَّمَٰوَٰتِ وَٱلْأَرْضَ ۖ وَلَا يَـُٔودُهُۥ حِفْظُهُمَا ۚ وَهُوَ ٱلْعَلِىُّ ٱلْعَظِيمُ',
  'Surah Al-Ikhlas':
    'قُلْ هُوَ ٱللَّهُ أَحَدٌ ۝ ٱللَّهُ ٱلصَّمَدُ ۝ لَمْ يَلِدْ وَلَمْ يُولَدْ ۝ وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌ',
  'Surah Al-Falaq':
    'قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ ۝ مِن شَرِّ مَا خَلَقَ ۝ وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ ۝ وَمِن شَرِّ ٱلنَّفَّٰثَٰتِ فِى ٱلْعُقَدِ ۝ وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ',
  'Surah An-Nas':
    'قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ ۝ مَلِكِ ٱلنَّاسِ ۝ إِلَٰهِ ٱلنَّاسِ ۝ مِن شَرِّ ٱلْوَسْوَاسِ ٱلْخَنَّاسِ ۝ ٱلَّذِى يُوَسْوِسُ فِى صُدُورِ ٱلنَّاسِ ۝ مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ',
};

const normalize = (s: string) =>
  s
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED\u0640\u06DF\u06E0-\u06E8\u08F0-\u08F3\u06E2\u06E5\u06E6\u0651]/g, '')
    .replace(/[﴿﴾۝٠-٩0-9]/g, ' ')
    .replace(/[؛،,;:.!?()«»"'?\u061F]/g, ' ')
    .replace(/[ٱأإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();

describe('catalog content integrity (fatal-class)', () => {
  it('matches the canonical Uthmani Quran word-for-word', () => {
    for (const [name, canonical] of Object.entries(CANONICAL_QURAN)) {
      const entry = ZIKR_CATALOG_BY_NAME.get(name);
      expect(entry, `${name} missing from catalog`).toBeDefined();
      expect(normalize(entry!.arabicText), `${name} drifted from the Quran`).toBe(normalize(canonical));
    }
  });

  it('carries the complete sleep dua (Bukhari 6076) — no truncation, no variant preposition', () => {
    const t = ZIKR_CATALOG_BY_NAME.get('Allahumma Aslamtu Nafsi Ilayk')!.arabicText;
    expect(normalize(t)).toContain(normalize('آمَنْتُ بِكِتَابِكَ ٱلَّذِيٓ أَنزَلْتَ وَبِنَبِيِّكَ ٱلَّذِيٓ أَرْسَلْتَ'));
    expect(normalize(t)).toContain(normalize('رَغْبَةً إِلَيْكَ وَرَهْبَةً مِنْكَ'));
    expect(normalize(t)).not.toContain(normalize('رَغْبَةً فِيكَ'));
  });

  it('keeps hadith-anchored counts anchored', () => {
    // [Bukhari 6241/Muslim 2721: 33·33·34]
    expect(ZIKR_CATALOG_BY_NAME.get('SubhanAllah')!.defaultTarget).toBe(33);
    expect(ZIKR_CATALOG_BY_NAME.get('Alhamdulillah')!.defaultTarget).toBe(33);
    expect(ZIKR_CATALOG_BY_NAME.get('Allahu Akbar')!.defaultTarget).toBe(34);
    // [Muslim 2691: 100×]
    expect(ZIKR_CATALOG_BY_NAME.get('Subhanallahi wa Bihamdihi')!.defaultTarget).toBe(100);
    // [Abu Dawud 5081/5083: 7× morning & evening]
    expect(ZIKR_CATALOG_BY_NAME.get('Allahumma Ajirni Minan-Nar')!.defaultTarget).toBe(7);
    expect(ZIKR_CATALOG_BY_NAME.get('Hasbiyallahu La ilaha illa Huwa')!.defaultTarget).toBe(7);
    // [Abu Dawud 5072/5090: 3×]
    expect(ZIKR_CATALOG_BY_NAME.get('Radhitu Billahi Rabba')!.defaultTarget).toBe(3);
    expect(ZIKR_CATALOG_BY_NAME.get('Bismillahilladhi la Yadurru')!.defaultTarget).toBe(3);
    // [Bukhari 6069: once, with conviction]
    expect(ZIKR_CATALOG_BY_NAME.get('Sayyidul Istighfar')!.defaultTarget).toBe(1);
    // [Abu Dawud 1523: no count specified — recited once, never "10×"]
    expect(ZIKR_CATALOG_BY_NAME.get("Allahumma A'inni ala Dhikrika")!.defaultTarget).toBe(1);
    // [3:173 / Bukhari 4357: no count specified]
    expect(ZIKR_CATALOG_BY_NAME.get("Hasbunallahu wa Ni'mal Wakeel")!.defaultTarget).toBe(1);
    // [Muslim 594 / Bukhari 824: 10× after Fajr & Maghrib]
    expect(ZIKR_CATALOG_BY_NAME.get('La ilaha illallahu wahdahu la sharika lah')!.defaultTarget).toBe(10);
  });
});
