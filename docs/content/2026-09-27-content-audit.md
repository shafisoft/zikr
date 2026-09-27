# Content Audit — 2026-09-27 (shipped in v1.5.1)

**Why:** the app's purpose makes content accuracy fatal. The Arabic texts,
meanings, counts and set compositions had been generated and "reviewed" only
by LLM passes — never verified against authoritative sources. This audit is
the source-based review that was missing.

**Method:** every catalog item was extracted and compared mechanically
(normalized: diacritics, hamza/alef variants and ligatures folded) against
authoritative digital sources:

- Quran: `api.quran.com/api/v4` — `text_uthmani` (Tanzil Uthmani), fetched
  2026-09-27, and cross-checked against `api.alquran.cloud` `quran-uthmani`.
- Sunnah: the nine-book hadith dataset (`A7med3bdulBaset/hadith-json`,
  Arabic text of Bukhari/Muslim/Abu Dawud searched in full) plus the
  Hisn-ul-Muslim printed wording.

**Guardrail shipped with the audit:** `tests/core/data/contentIntegrity.test.ts`
pins every revealed text to its canonical source (normalized comparison —
orthographic mark differences pass, any word change/omission fails) and pins
every hadith-anchored count to its citation. A content regression now fails
the build instead of shipping.

## Errors found — and fixed in v1.5.1

| Item | Error | Severity | Fix |
|---|---|---|---|
| Ayat al-Kursi | **Omitted "ٱلْحَىُّ ٱلْقَيُّومُ"** — the published text jumped from "لَا إِلَٰهَ إِلَّا هُوَ ۚ" straight to "لَا تَأْخُذُهُ" | **Fatal** | Replaced with canonical 2:255 (Uthmani), verified word-for-word |
| Allahumma aslamtu nafsi ilayk (sleep) | **Truncated** — missing the closing "آمَنْتُ بِكِتَابِكَ ٱلَّذِيٓ أَنزَلْتَ وَبِنَبِيِّكَ ٱلَّذِيٓ أَرْسَلْتَ"; also "رَغْبَةً فِيكَ" instead of the transmitted "رَغْبَةً إِلَيْكَ" | **Fatal** | Replaced with the full wording (Bukhari 6076 / Hisn-ul-Muslim) |
| Allahumma a'inni ala dhikrika | Count **10× had no transmitted anchor** (Abu Dawud 1523 gives no count) | Fatal (invented religious claim) | Count set to 1; citation pinned in test |
| Hasbunallahu wa ni'mal wakeel | Count **33× had no anchor** (33 belongs to the Tasbih Fatimah, not this phrase) | Fatal (invented) | Count set to 1 |
| La ilaha illallahu wahdahu la sharika lah | Count **100× had no anchor**; the anchored number is **10× after Fajr and Maghrib** (Muslim 594 / Bukhari 824) | Fatal (misanchored) | Count set to 10 |
| Predefined-library sync | The seeder only filled *empty* fields — shipped corrections would never reach existing installs | Fatal (stale text persists) | Catalog is now authoritative for non-custom rows: content drift is corrected on boot (custom rows and deletions untouched) |

## Verified correct (verbatim against sources)

- **Quran:** Al-Ikhlas (112:1-4), Al-Falaq (113:1-5), An-Nas (114:1-6) — word-for-word
  against the canonical Uthmani text (bismillah omitted deliberately, per
  adhkar convention; ayah separators are display ornaments).
- **Duas verified verbatim:** Sayyidul Istighfar (Bukhari 6069), Bismika
  Allahumma amutu wa ahya (Bukhari 6087), Bismillahilladhi la yadurru (Abu
  Dawud 5090), Hasbiyallah (Abu Dawud 5083), Ajirni minan-nar (Abu Dawud
  5081), Subhanallahi wa bihamdihi (Bukhari 6166/6167; 100× per Muslim 2691),
  La ilaha illallahu wahdahu (Bukhari 824 / Muslim 594), Hasbunallahu (Quran
  3:173 / Bukhari 4357), Salawat formula (Bukhari 3230).
- **Counts verified:** SubhanAllah 33 / Alhamdulillah 33 / Allahu Akbar 34
  (Bukhari 6241, Muslim 2721); Ajirni & Hasbiyallah 7× (Abu Dawud 5081/5083);
  Bismillahilladhi 3× and Radhitu 3× (Abu Dawud 5090/5072; Radhitu's ﷺ
  spelling matches Hisn-ul-Muslim's printed wording); Sayyidul Istighfar 1×
  (Bukhari 6069, "with conviction").
- **Set composition:** the night set follows Hisn-ul-Muslim's sleep chapter
  (Kursi → three Quls → Bismika → Tasbih Fatimah → Aslamtu dua); the Friday
  set (Al-Kahf, abundant salawat, istighfar) matches the established Friday
  sunnahs; the light-between-two-Fridays attribution is sahih (al-Bayhaqi,
  authenticated by al-Albani).
- **Presentation:** every Arabic string renders with `lang="ar" dir="rtl"`;
  dark/light tokens cover the content surfaces; bn/en meaning parity is
  machine-checked (483 = 483 keys).

## Still open — needs a human, not a machine

1. **Scholar review of the full audit.** Machine comparison proves fidelity
   to *sources*, but source choice itself (which narration a count follows,
   whether a set's order matters) is a matter of scholarship. A knowledgeable
   person should sign off on `zikrCatalog.ts` as printed.
2. **Bangla translations are interpretive gists.** They read naturally, but
   translations of Quran/dua are themselves interpretation — a native,
   educated reviewer should pass over all 24 `translationBn` strings. One
   flagged for polish: As-Samad rendered "অভয়ারণ্যের অধিপতি" (interpretive;
   most Bangla mushafs say "আস-সামাদ [অমুখাপেক্ষী]").
3. **Routine-row progress copy** ("মোট 3টির 1 নম্বর") reads awkwardly —
   cosmetic Bangla polish, noted by the end-user pass.
4. **Sources are not shown in-app.** Consider adding a per-zikr reference
   line (e.g. "Bukhari 6306") and the fiqh note that post-prayer windows use
   approximate prayer times, so no one mistakes them for salat times.
