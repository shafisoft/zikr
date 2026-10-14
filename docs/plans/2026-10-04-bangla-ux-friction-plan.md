# Bangla & low-literacy UX friction plan — 2026-10-04

**Status:** PROPOSED — implementation-ready pending the three decisions in §5.
**Source:** the 2026-10-04 friction review of the full bn locale, every icon-only
control, and each multi-step flow, judged against the target user: can open the
app, taps what they see, but does not infer hidden mechanics two layers deep.
Finding references are `BX-#` as numbered here.

**What already works (do not touch):** the practice spine is one-layer end to
end — Home card ("Start the set" / "Now · Morning adhkar") → count circle →
auto-save; the streak/grace prompts; the tracker's current-prayer chip; the
gentle register throughout the bn strings (no "failed/broken" vocabulary).

---

## Wave 1 — String sweep (no layout risk) · size S

### BX-1 Reset confirm must not say "Delete" (P0)
- **Problem:** the counter's reset dialog asks "কাউন্টার শূন্যে রিসেট করবেন?" but
  its confirm button reads **মুছে ফেলুন** (`common.delete`) — `CounterSession.tsx:320`.
  A non-advanced user reads a red Delete on a reset action and reasonably
  believes their data is being erased; they cancel and distrust the dialog.
- **Change:** new key `counter.resetConfirmAction` (en "Reset", bn "রিসেট করুন");
  use it for `confirmLabel`. Same-day fix candidate.
- **Verify:** CounterSession test asserting the dialog's confirm label.

### BX-2 One name for the shared practice: গ্রুপ (P1)
- **Problem:** bottom nav says গ্রুপ, but the flows say রুম ('রুম তৈরি করুন',
  'রুমে যোগ দিন', 'রুম কোড', Settings' 'রুমে আপনার নাম') and Settings titles the
  feature যৌথ লক্ষ্য — three names a newcomer must map onto one thing.
- **Change:** sweep all user-facing `room.*`, `joinModal.*`, `createRoom.*`,
  `errors.room-*` strings in BOTH locales: রুম → গ্রুপ (en room → group),
  and retitle the Settings section 'যৌথ লক্ষ্য' → 'গ্রুপ জিকির'. The protocol
  error CODES (`room-not-found` etc.) are internal constants — untouched; only
  their translated copy changes. History keeps its old wording (shipped text
  is not retroactively re-translated).
- **Verify:** grep gate — no user-facing "রুম"/"room" outside code identifiers;
  i18n parity test (key counts must stay equal in en/bn).

### BX-3 One numeral system (P1)
- **Problem:** mixed systems on the same screens: hardcoded Bangla digits
  (`৩৩ · ৩৩ · ৩৪ · ১০০`, `১২টি`, `৫টি`) beside Latin live data ("33 এর মধ্যে 0",
  step rail "9-এর মধ্যে 2"), and bn strings with Latin digits ("1 থেকে 10000",
  "50 অক্ষরের", "6 অক্ষরের", placeholder "যেমন, 100", "(3 দিনের সময় পেরিয়ে গেছে)").
  `toLocaleString('bn-BD')` already renders Bangla digits in places (Progress
  total, GoalRowCard) — so the app is half-converted.
- **Change (per §5 decision D1):** a `formatNumber(value)` util routed through
  `localeTag(lang)`; every dynamic count/target/limit renders through it; the
  Latin digits inside static bn strings become Bangla numerals by hand.
- **Verify:** a formatNumber unit test (bn → ৩৩, en → 33); grep for raw
  `Math`/`{count}` renders outside the util in the top surfaces (counter,
  plans, tracker).

### BX-4 Flush the English left inside the bn locale (P1)
- **Problem:** placeholders "যেমন, My Daily Dhikr" / "যেমন, Glory be to Allah";
  label "ফ্রিকোয়েন্সি \*" (loanword + a bare asterisk); "বৈধ সংখ্যা দিন"
  (programmer-speak); date placeholder "যেমন, 100".
- **Change:** bn copy pass over `zikrForm.*`, `planForm.*`, `progress.*`:
  "যেমন, আমার প্রতিদিনের জিকির" / "যেমন, আল্লাহ পবিত্র"; "ফ্রিকোয়েন্সি \*" →
  "কত সময় পর পর (আবশ্যক)"; required-marks become "(আবশ্যক)"; "বৈধ সংখ্যা" →
  "সংখ্যা"।
- **Verify:** parity test + a native-reader pass (already an open audit item —
  this wave gives the reviewer a bounded list).

### BX-5 Human dates in history (P2)
- **Problem:** history rows and the delete confirm render raw `2026-10-04`
  (`dateUtils.formatDate` is machine format; only Plans localizes).
- **Change:** history row + `history.deleteConfirm` render
  `toLocaleDateString(localeTag(lang), { day:'numeric', month:'long' })`
  (bn → "৪ অক্টোবর"); keep ISO only as the `datetime` attribute.
- **Verify:** SessionHistory test on the rendered day/month string.

## Wave 2 — Language acquisition + explicit affordances · size M

### BX-6 Ask language on first run (P0)
- **Problem:** `detectLanguage()` keys off the phone's display language
  (`i18n/index.ts:24`). Most Bangla-first users keep phones in English → they
  land in an English app, and the fix lives two layers deep (gear → scroll →
  ভাষা). This is the single biggest adoption gate.
- **Change:** welcome slide 1 gains a two-button language choice —
  **English | বাংলা** (each labelled in its own language), preselected from
  `detectLanguage()`; tapping writes the `language` setting immediately and
  re-renders the remaining slides in that language. Detection stays as the
  preselect; Settings row unchanged for changes of heart.
- **Verify:** welcome test — tap বাংলা → subsequent strings are bn and the
  settings row persists; returning visitor (setting already set) never sees
  the choice again.

### BX-7 Make the past-prayer chip's action say itself (P1)
- **Problem:** the offline mark-done affordance is a dashed border — a
  designer's signal, not a user's. Status circles otherwise never open
  dialogs; a non-advanced user will not discover that tapping yesterday's
  empty circle marks it done (BX review §P1-3).
- **Change (per §5 decision D2):** keep the chips, and add ONE explicit line
  under the tracker whenever pending prayers exist:
  "ফজর, যোহর বাকি — চিহ্নিত করতে ট্যাপ করুন" (en: "Fajr, Dhuhr not done — tap to
  mark them"). The line is derived from the same `postSalahSlots` state
  (pending prayer labels), so it can never drift from the chips.
- **Verify:** tracker test — pending state renders the line naming exactly the
  pending prayers; none when all done/upcoming.

### BX-8 Name the manual entry for the task it is (P1)
- **Problem:** the core differentiator (physical tasbeeh logging) lives two
  layers deep (Progress tab → scroll → "নিজে সংখ্যা যোগ করুন") and then asks
  the user to choose **একক / একাধিক** — form-shaped words, not task-shaped.
- **Change:** section label → "তাসবীহের হিসাব লিখুন" (en "Log your tasbeeh
  count"); toggle labels → "একটি জিকির" / "এক সাথে কয়েকটি" (en "One zikr" /
  "Several at once"). Home's empty-state hint gains a pointer line to this
  card so the discovery is not Progress-tab-only.
- **Verify:** Progress renders test on the new labels; i18n parity.

### BX-9 Explain the day-part chips in one line (P2)
- **Problem:** the bulk form's ফজর/যোহর/আসর… chips silently decide which
  routine gets credit; nothing says why a manual count needs a prayer name.
- **Change:** caption under the label: "কোন নামাজের পরে পড়েছেন? এটি রুটিনের
  হিসাব ঠিক করে।" (en: "Which prayer did you count after? This credits your
  routines.") — pure string, no behavior change.
- **Verify:** BulkEntryForm render test.

## Wave 3 — Icon literacy · size S

### BX-10 Text-label the history row actions (P1)
- **Problem:** history rows expose edit/delete as bare pencil/bin icons
  (`SessionHistory.tsx:339-346`); the two worst examples of icon-literacy
  assumptions, sitting on the screen non-advanced users visit to fix mistakes.
- **Change (per §5 decision D3):** replace the two icon buttons with two small
  text pills — "বদলান" / "মুছুন" (en "Edit" / "Delete"). Height stays
  touch-target; the row already has room. Prayer-location row and routine-row
  icons stay as-is for now (Settings audience; flagged for a later pass).
- **Verify:** SessionHistory test finds buttons by name; visual pass.

### BX-11 (optional, fold into BX-10's release) Welcome mentions routines
- One sentence on slide 3: "রুটিন ও নামাজ-পরবর্তী আজকার এক ট্যাপে প্রস্তুত" —
  the two newest features are currently absent from onboarding.

---

## §5 Decisions needed before implementation

| # | Question | Recommendation |
|---|---|---|
| D1 | Numeral direction in bn mode: full Bangla digits everywhere, or all-Latin? | **Full Bangla** — the app already leans that way, the audience reads Bangla numerals natively, and `bn-BD` formatting does the work |
| D2 | Past-chip affordance: explicit caption line (recommended), long-press gesture, or tapping opens the ask directly without any affordance change? | **Caption line** — zero ambiguity, no new gesture vocabulary |
| D3 | History row actions: text pills (recommended) vs icons+labels vs swipe actions | **Text pills** — discoverable by reading, no gesture |

## §6 Sequencing & release

- Wave 1 is mechanically safe — ship it as one commit, then **1.10.0** together
  with Wave 2 (the two P0s, BX-1 + BX-6, must land in the same release; a
  Bangla-only release with a Delete-labelled reset dialog would be half-fixed).
- Wave 3 rides the next release or folds into 1.10.0 if D3 resolves quickly.
- Every wave: `npm run test` + i18n parity (the machine check enforces new
  keys in both locales) + bn screenshots through the visual judge on the
  touched surfaces (welcome, Home, tracker, Progress, history).
- Explicitly out of scope: retroactively re-translating shipped history rows,
  changing protocol error-code strings, iOS's own "Add to Home Screen" English.
