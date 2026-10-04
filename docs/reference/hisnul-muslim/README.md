# Hisn-ul-Muslim reference sources

Downloaded 2026-10-03 for the routine-preset verification
(`docs/plans/2026-10-03-routines-content-plan.md`). These files are the
citation base for every claim the app makes about "per Hisn-ul-Muslim"
content. They are NOT shipped in the bundle — `src/core/data/` stays the
only runtime content source.

| File | What it is | Notes |
|---|---|---|
| `hisn_almuslim_ar.json` | Full Arabic book, 134 chapters, structured `{chapter: {text[], footnote}}` | [rn0x/hisn_almuslim_json](https://github.com/rn0x/hisn_almuslim_json) (`hisn_almuslim.json`, ~120KB). Follows the Saudi print's chapter sequence; unvocalized text. Primary source for chapter membership + item numbering. |
| `fortress-of-the-muslim-en.pdf` | English print edition ("Hisnul Muslim in English"), numbered duas (75)–(133+) with translated count markers ("[three times]") | [archive.org/HisnulMuslimEnglishPdf](https://archive.org/details/HisnulMuslimEnglishPdf) (~5.6MB). Arabic glyphs don't extract from the PDF (embedded font); English translations + counts + footnotes do (`pdftotext -layout`). Use for counts and English wording. |
| `fortress-en.txt` | `pdftotext -layout` dump of the PDF above | Derived file, kept so future verification can grep without re-extracting. |
| `hisnul.xml` | Bilingual ar/en duas with hadith references, grouped by chapter | [khalid-hussain/hisnulMuslimDB](https://github.com/khalid-hussain/hisnulMuslimDB). **Caveat: only groups 1–24 are populated (64 duas); groups 25–132 are empty stubs** — i.e. NO morning/evening, sleep, or after-salah content here. Usable for the waking-up chapter (group 1) and the du'a-only chapters it covers. |
| `toc.md` | Table of contents of the XML dataset | Chapter id map for the XML. |

## Chapter map used by the app

| App surface | Book chapter (Arabic JSON / English numbering) |
|---|---|
| Morning/evening preset (4 of 6 items) | أذكار الصباح والمساء (#6, #10, #13, #14) = en (80), (84), (86), (87) |
| Night preset (all 9 items) | أذكار النوم (#2 Kursi, #1 three surahs ×3, #7 Bismika, #8 Tasbih Fatimah 33/33/34, #13 Aslamtu nafsi) = en (100), (99), (105)/(102), (106), (111) |
| Post-salah tasbeeh set | الأذكار بعد السلام من الصلاة #4 = en (69) — the three phrases + the full tahlil (Muslim 594); the app's 33/33/34 is the Bukhari 6241 variant |
| Friday preset | **Not from this book** — the book has no Friday chapter. Kahf/salawat/istighfar are direct-sunnah items with their own citations. |
| Morning items NOT in the book | Ajirni minan-nar (Abu Dawud 5081), A'inni ala dhikrika (Abu Dawud 1522) |

Waking-up chapter for future sets: أذكار الاستيقاظ من النوم (4 items; bilingual
in the XML group 1).

## Re-verification recipe

```bash
# Book text side:
python3 -  # normalize (strip diacritics/hamza variants/punct) + LCS-similarity
           # catalog string vs the chapter item — see the verification plan doc
# Quran side: tests/core/data/contentIntegrity.test.ts already pins Uthmani text
```
