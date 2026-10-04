# Routine content plan — Hisn-ul-Muslim verification & delivery (2026-10-03)

**Why:** the four preset routines are the app's "reliable practice" promise,
but they had never been checked against the actual book. The 2026-09-27
content audit verified catalog TEXTS and COUNTS (and fixed two fatal text
errors); the ROUTINE layer — chapter membership, item order, set
composition — was still claims. This plan closes that, and lays out how
routine content grows from here.

**Sources** (downloaded to `docs/reference/hisnul-muslim/`, provenance in
its README): the full Arabic book JSON (rn0x, follows the Saudi print),
the numbered English print edition (PDF), and the partial bilingual XML
(only groups 1–24 populated — useless for the adhkar chapters, kept for
the waking-up chapter). Method: normalized (diacritics/hamza-folded)
string comparison of every catalog text against the best-matching book
item, chapter dumps with per-item numbering, and count markers extracted
from the English edition.

---

## Part 1 — Verification findings

### 1.1 Verdict per preset

| Preset | Verdict | Detail |
|---|---|---|
| **night** | ✅ Faithful subset, one order deviation | All 9 items exist in أذكار النوم with exactly these counts. The book opens with the three surahs (#1) then Kursi (#2); the app leads with Kursi. Counts: Kursi 1, Quls 3 each, Bismika 1, Tasbih Fatimah 33/33/34, Aslamtu 1 — all match. The app's Aslamtu wording is the fuller Bukhari variant (the dataset paraphrases it); `contentIntegrity` already pins that. |
| **morning/evening** | ⚠️ Faithful counts; order claim overstated; 2 items not from the book | 4 of 6 items are in أذكار الصباح والمساء with correct counts: Bismillahilladhi ×3 (#13/en 86), Radhitu ×3 (#14/en 87) — genuinely ADJACENT in the book — Hasbiyallah ×7 (#10/en 84), Sayyidul Istighfar ×1 (#6/en 80). But the code comment claimed "HISN-UL-MUSLIM liturgical order": the book sequence is Sayyidul(#6) → Hasbiyallah(#10) → Bismillahilladhi(#13) → Radhitu(#14). The other two — Ajirni Minan-Nar ×7 (Abu Dawud 5081) and A'inni ala Dhikrika ×1 (Abu Dawud 1522) — are authentic but **not in the book at all**. |
| **friday** | ⚠️ Not from the book (fine, but say so) | Hisn-ul-Muslim has **no Friday chapter**. Kahf recitation, abundant salawat and istighfar are established sunnahs with their own citations; the routineUtils comments already source them generically ("The FRIDAY sunnahs"). The preset must never be labeled "per Hisn-ul-Muslim". |
| **post-salah tasbeeh** | ⚠️ Anchored, with one wording drift | 33/33/34 is the Bukhari 6241/Muslim 2721 variant (pinned by test). Book item en (69)/ar #4 closes the set with the FULL tahlil ("La ilaha illallahu wahdahu la sharika lah, lahul-mulku…") ×10 per Muslim 594; the app uses the PLAIN tahlil (`La ilaha illallah`) ×100, which is a common folk composition, not the transmitted one. The precise catalog entry already exists (`La ilaha illallahu wahdahu la sharika lah`, target 10, test-pinned to Muslim 594). |

### 1.2 Bug found and fixed today

The v1.5.1 audit set the catalog's `A'inni ala Dhikrika` count to **1**
("Abu Dawud 1523 fixes no count — never 10×") and `contentIntegrity` pins
it, but the ROUTINE layer still carried the old invented 10: the
`PRESET_FALLBACK_TARGETS` fallback said 10, the order-array comment said
"×10", and two test fixtures said 10. Shipped behavior was already ×1
(catalog `defaultTarget` wins over the fallback), so this was comment /
fallback / fixture drift, not a user-facing error — but it is exactly the
kind of drift that becomes an invented religious claim the day the
fallback path fires. **Fixed:** fallback and fixtures now say 1; comments
state the true provenance (see `routineUtils.ts`).

### 1.3 What holds up

- All 18 catalog entries referenced by the presets exist and their Arabic
  matches the book (LCS similarity 0.84–1.00; sub-1.0 is orthography — the
  catalog is fully vocalized, the dataset is not). The Aslamtu-nafsi text is
  the fuller Bukhari wording even where the dataset paraphrases.
- All counts across the four presets are hadith-anchored (pinned in
  `contentIntegrity`); nothing invented survives in shipped data.
- The night preset is a genuine, count-exact subset of the book's sleep
  chapter — the strongest "per Hisn-ul-Muslim" surface in the app.

---

## Part 2 — Content plan

**Source policy (binding):** a routine may be labeled "per Hisn-ul-Muslim"
only if every item maps to a book chapter, with position and count taken
from the book where it gives them. Any non-book item carries its direct
hadith citation. A count with neither a book marker nor a hadith anchor is
1 (recite once) — never invented. Chapter/item numbers live in
`docs/reference/hisnul-muslim/README.md`; edition drift is handled by
re-checking against BOTH downloaded editions before changing a set.

**P0 — corrections (this wave)**
1. ✅ Done today: fallback/comments/fixtures ×10→×1; truthful provenance
   comments in `routineUtils.ts`.
2. **Post-salah set item 4:** replace `La ilaha illallah` ×100 with
   `La ilaha illallahu wahdahu la sharika lah` ×10 (the Muslim 594
   composition; entry + count already catalog-pinned). One-const change in
   `prayerTimes.ts` (`POST_SALAH_SET`); occurrence-done re-derives, no
   migration. Keep 33/33/34 (Bukhari variant).
3. **Guardrail test:** extend `contentIntegrity` (or add
   `routineIntegrity.test.ts`) to pin, for every preset item:
   `PRESET_FALLBACK_TARGETS[name] === catalog.defaultTarget` (this test
   would have caught today's drift at the fallback layer), plus a
   preset→book-chapter source map checked for existence and count. The map
   should live as data in `src/core/data/routineSources.ts` so the UI can
   render citations from the same source later.
4. **Docs:** append a correction pointer to AC2.1.1 / the solution-design
   as-built note ("Hisn-ul-Muslim order" → "book-anchored subset, app-curated
   order — see this plan §1.1"); history docs keep their original text.

**P1 — depth (next content wave)**
1. **Per-item source display:** add an additive `sourceRef` field to catalog
   entries (e.g. "أذكار الصباح والمساء #13 · Abu Dawud 5090"). The seeder
   already rewrites non-custom rows on boot (v1.5.1 authority rule), so no
   db bump. Show it in the guided flow's item screen, Library detail, and
   the routine sheet — this closes audit open-item #4 ("sources are not
   shown in-app").
2. **Full chapters as guided flows:** the complete morning/evening chapter
   (25 items) exceeds `MAX_ROUTINE_ITEMS` (12) by design. Ship chapters as
   *practice flows* from the Library (book table of contents → chapter →
   guided count flow), not as routine rows: the counter's guided
   infrastructure is already generic over ordered items. Routine rows stay
   "what I keep daily"; chapters become "what the book contains". Full
   Quran-recitation items (Al-Kahf pattern: title text + instruction) work
   there without cap pressure.
3. **Bangla parity:** every new item ships with `nameBn`/`translationBn`;
   the native-reviewer pass over all bn strings (audit open-item #2) should
   gate this wave, not follow it.

**P2 — new sets (growth roadmap, by practice frequency)**
1. **After-salah complete** (ch. 26 after-salam, 8 items): the app already
   owns the post-prayer moment (`usePostSalahWindow`); offer the full
   istighfar-tasbeeh-mu'awwidhat sequence as an optional extended flow
   after the current tasbeeh set.
2. **Waking-up** (ch. 2, 4 items; bilingual text available in the XML): a
   natural fourth daily anchor alongside morning/evening/night.
3. **Sleep complete**: add the missing chapter items to the Library chapter
   flow (Baqarah 285–286 as a recitation task, "Innaka khalaqta nafsi",
   "Qini 'adhabaka" ×3, Sajdah + Mulk) while the nightly routine row stays
   the curated 9-item core.
4. **After-adhan** (ch. 16) and the daily-100 tasbeeh/istighfar set
   (ch. 131 virtues, texts already in ch. 27) — small, high-frequency.
5. **Seasonal/situational**: travel (ch. 97+), rain/wind (ch. 62+),
   ruqyah/protective (ch. 89, 129) — curated sets with per-item citations.

---

## Part 3 — Delivery design (how users get reliable routines)

1. **Honest labeling as a feature.** Presets that are count-exact book
   subsets (night) get a "per Hisn-ul-Muslim" badge; hybrids (morning/
   evening) are labeled curated with per-item citations from
   `routineSources`; friday is labeled by its hadith sources. Never market
   a hybrid as the book — the audit trail exists to keep us honest.
2. **Show the source at the moment of practice.** The guided flow's item
   screen renders the citation line (P1.1) — reliability is most valuable
   mid-dhikr, not buried in a menu.
3. **Windows stay generous, anchors optional.** The civil day-part windows
   (03:30–11:29 / 15:00–19:59 / 20:00–03:29) are a deliberate design
   decision; the book's own boundaries (morning: after Fajr; evening: after
   Asr — en-edition footnote 42) are available on-device via `adhan`. If
   users report confusion, anchor window STARTS to Fajr/Asr with civil
   fallback for no-location users — do not tighten unilaterally.
4. **Bundle budget.** The full book (~120KB raw JSON) must never enter the
   main bundle. Chapter content ships as curated catalog entries only
   (strings are cheap); a future chapter browser lazy-loads per-chapter
   chunks. `size-check` stays the gate.
5. **Counting semantics unchanged.** Chapters/practice flows write plain
   sessions (no routine attribution) unless entered through a routine; the
   routine's part-of-day scoping (§ `sessionCountsTowardRoutine`) stays the
   single counting truth. The post-salah set change (P0.2) re-derives
   occurrence-done and needs no data migration.
6. **Ship checklist per content change:** normalized text compare against
   the downloaded sources (Quran side already test-pinned) → integrity-test
   pins updated with citations → bn/en meaning parity check → `npm run
   size-check` → CHANGELOG `Unreleased` entry → native bn reviewer + scholar
   sign-off remain the human gates the 2026-09-27 audit left open.
