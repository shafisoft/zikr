# Zikr — Value Wave Requirements

| | |
|---|---|
| **Version** | 2.0 (replaces the June 2026 v1 spec — that scope has shipped; see CHANGELOG 1.0–1.4) |
| **Date** | 2026-09-26 |
| **Status** | DRAFT — for architect review |
| **Author** | Product owner (value wave), based on [target-user discovery 2026-09-26](discovery/2026-09-26-target-user-discovery.md) |
| **Approved scope** | (1) Post-salah mode · (2) Routines as a first-class object (wird) · (3) Gentle restarts (streak forgiveness) |
| **Sibling document** | [Remediation plan 2026-09-26](plans/2026-09-26-remediation-plan.md) — coordination duties in §7 |

This document states **requirements, not solutions**. Data models, libraries,
file structure, and migration mechanics are the architect's domain. Where the
discovery evidence names a candidate (e.g. a specific prayer-time library), it
appears as evidence in a note, never as a mandate.

---

## 1. Problem & goals

Discovery (2026-09-26) put real users against the current product and found
the gap is no longer capability — the counter, manual entry, plans, and streak
plumbing all work — it is **situation**. The app counts anything, anytime, but
knows nothing about the moments when practicing Muslims actually pick up a
tasbeeh:

1. **Straight after salah.** The catalog's 33/33/34 + 100 cluster exists *only*
   for this moment, yet nothing in the app knows the moment exists. The
   after-salah doer's friction is distraction (losing count mid-set) and "did
   I already do it after Dhuhr?" — not counting, which the app already solves.
2. **Morning and evening wird.** The catalog's 3x/7x cluster is literally the
   Hisn-ul-Muslim morning/evening set, shipped as loose zikr rows with no
   routine object. The wird keeper's unit of success is "did my morning
   adhkar today" — one thing with ten parts — and today she must hand-build
   plan machinery with dates and deadlines that liturgical routines don't
   want (you don't "complete" morning adhkar by a date; you do it daily).
   The 1.3.0 "Continue next zikr" button is this need breaking through
   organically.
3. **The day after a miss.** The returning striver keeps a streak, misses one
   sick day, sees zero, and quits for a month. The plumbing already rebuilds
   streaks from backdated entries (1.3.0), but the psychology is still
   all-or-nothing.

**Goals for this wave**

- **G1** — Attach the app to a ritual that already has a perfect trigger (the
  salah itself), so opening Zikr at the right moment requires no memory or
  hunting.
- **G2** — Make the daily liturgical sequence a first-class object with its
  own "done today", so running ten items feels like doing one practice.
- **G3** — Make a single missed day survivable, so a sick day doesn't end
  the practice.
- **G4** — Do all of this inside the brand: default-simple UX, zero new
  network usage, $0/month, offline-first, ≤200KB gzipped, en+bn at full
  parity.

**Why now:** these three compound — #1 supplies the moment, #2 the object,
#3 the durability — and they are the top three of the discovery doc's ranked
opportunities. Campaigns (#4) and the Bengali ritual frame (#5) ride on top
of them and are explicit follow-ons (§9).

---

## 2. Target users & jobs

Condensed from the discovery personas. Personas 3 (seasonal pledger) and 4
(Bengali-first ritual frame) are **out of scope** this wave; only their
existing bn-locale parity duties apply.

| Persona | In scope via | Job to be done |
|---|---|---|
| After-salah tasbih-doer | R1 Post-salah mode | "When I finish a prayer and open Zikr, I want the after-salah set ready to run, so I don't have to remember what to do, lose my place, or wonder later whether I did it." |
| Morning/evening wird keeper | R2 Routines (wird) | "When I do my morning adhkar, I want one flow that carries me item-by-item with its own 'done today', so the sequence itself is the goal, not ten goal-rows." |
| Returning striver | R3 Gentle restarts | "When I come back after missing a day, I want to resume without the app telling me I failed, so a sick day doesn't end the practice." |

---

## 3. Shared principles (apply to every requirement below)

- **P1 Default-simple.** The default experience for a user who never touches
  a new feature is today's app, unchanged. Complexity is gated behind
  Settings (default off, with a description of exactly what it adds — the
  pattern set by remediation 1.2) or is ambient/discoverable without
  teaching.
- **P2 Privacy is the brand.** No feature in this wave sends anything new
  over the network. No per-round or per-session events, ever. Location for
  prayer times is entered manually by default and never leaves the device.
  Any copy change required by honesty moves **in the same change** as the
  behavior (remediation 4.1 discipline).
- **P3 Honest numbers.** Every number shown (streak, done-today, progress)
  must be derivable from a stated rule and must survive the edge cases in
  §4–§6 without lying or surprising the user.
- **P4 No guilt.** Copy never says broken / failed / lost / zero-as-punishment.
  The register is gentle encouragement consistent with existing app copy, in
  both locales.
- **P5 Validation without surveillance.** Evidence comes from the discovery
  doc's manual tests (§10): small-user mocks, community-group conversations,
  hand comparisons. Telemetry for these features is **none** in v1; if the
  remediation 4.1 milestone-only set ships, these features add no events to
  it unless separately approved, and then only milestone-shaped ones.

---

## 4. R1 — Post-salah mode

### 4.1 Description & ritual moment

Right after each of the five daily prayers, practicing users run a short
fixed set — SubhanAllah ×33, Alhamdulillah ×33, Allahu Akbar ×34, then the
tahlil (La ilaha illallah ×100). The trigger is the salah itself; the app
should already be sitting there with the set ready when he opens it.
Post-salah mode detects "within a short window after a prayer time" —
computed **on device, offline**, from a saved location — and surfaces a
one-tap guided flow through the set. It converts the existing counter +
manual entry into a *situated* flow; it adds no new backend, no
notifications, no tracking.

> Evidence: discovery opportunity #1; the catalog cluster exists solely for
> this moment; Idea.md's deferred v1.1 "context suggestions by time";
> competitor pairing of prayer times + tasbih is a proven beloved combo.
> The discovery spike candidate for offline computation is adhan-js (MIT,
> zero-dependency, includes the Karachi method) — candidate only, not a
> mandate.

### 4.2 User stories & acceptance criteria

**R1.1 — Set my location manually (the opt-in)**
> As a user who prays, I want to save my location once so the app knows when
> my prayer times are, without it ever tracking where I am.

- **AC1.1.1** Given a fresh install or upgrade, when the user has never set
  a location, then the app is unchanged in behavior: no post-salah UI exists
  anywhere, and no location permission dialog is ever shown.
- **AC1.1.2** Given the user opens Settings, when they choose the prayer-time
  location option, then they can complete setup **entirely offline** by
  manual entry (a place they name/search offline, or coordinates) — manual
  entry must not require network.
- **AC1.1.3** Given setup, when the user explicitly taps an optional "use my
  current location" affordance, then and only then may the device
  geolocation permission prompt appear; a denial must leave manual entry
  fully usable and must not re-prompt.
- **AC1.1.4** The saved location never leaves the device: given devtools
  open, when the user completes setup and any post-salah flow, then zero
  network requests originate from this feature (beyond the app's existing
  baseline).
- **AC1.1.5** A single Settings toggle turns the surfaced card off without
  deleting the saved location; toggling back on restores it with no
  re-entry.

**R1.2 — See the moment (ambient card)**
> As a user who just finished Maghrib, I want Home to show me my after-salah
> set without me hunting for it.

- **AC1.2.1** Given a saved location, when the current time falls within the
  post-prayer window of any of the five prayers (Fajr, Dhuhr, Asr, Maghrib,
  Isha), then Home surfaces an ambient state naming the prayer and the set
  (en copy tone: "It's Maghrib — your after-salah set"), opening the guided
  flow in one tap.
- **AC1.2.2** The window is a **fixed default of 30 minutes** after each
  prayer time; it is not user-configurable in v1 (simplicity).
- **AC1.2.3** Given the user already completed the set for this prayer
  occurrence today, when the window is still open, then the card shows a
  quiet completed state instead of prompting again — and ordinary sessions
  of the same zikr done earlier today must **not** be misread as the
  after-salah set (the app must distinguish "did the set after this prayer"
  from "counted SubhanAllah this morning").
- **AC1.2.4** Outside any window, nothing shows: no empty shell, no
  placeholder, no "next prayer in…" widget in v1.
- **AC1.2.5** The surfaced state is **derived, never persisted**: given the
  app is closed at window start and opened mid-window, when it renders, then
  the card appears; given the app is open past window end, then the card is
  gone on the next render without stale state.

**R1.3 — Run the set (guided flow)**
> As a user on a wooden misbaha, I want one flow that carries me 33 → 33 →
> 34 → 100 so I can focus on the dhikr, not the app.

- **AC1.3.1** Given the card is tapped, when the flow opens, then it runs
  the four set items in order with each item's count prefilled from the
  catalog defaults (33/33/34/100), reusing the existing counter machinery
  (haptics, durable mid-count checkpoints, auto-save at target).
- **AC1.3.2** Given the user reaches an item's count, when it auto-saves,
  then the flow advances to the next item automatically.
  Keep-counting-past-target is **not offered mid-flow** (it remains
  available in the plain counter) — *product decision, see owner
  sanity-check list.*
- **AC1.3.3** Given the user leaves mid-item, when they return later the
  same day, then the flow resumes where they left off using the existing
  durable checkpoint behavior.
- **AC1.3.4** Each completed item saves an **ordinary session**: it counts
  toward the overall streak, today's totals, any plan covering that zikr,
  and group propagation follows the exact existing counter rules — the flow
  adds no new propagation semantics.
- **AC1.3.5** Given the gated remediation-1.2 settings are on (long-press
  decrement, auto-save Undo), when the flow is running, then those
  affordances behave consistently inside the flow or are visibly absent —
  the flow must not silently contradict the counter's rules (composition
  with the Undo toast is an architect question, OQ-3).
- **AC1.3.6** Given the user completes all four items, then a calm
  completion state confirms the set is done for this prayer; no
  streak/number pressure.

**R1.4 — Localized & offline**
- **AC1.4.1** Given bn mode, then card copy, flow labels, and completion
  copy render in bn at native quality; set order and counts are identical;
  Arabic text always renders with `lang="ar" dir="rtl"`.
- **AC1.4.2** Given airplane mode after first load, then setup (manual
  entry), window detection, and the full flow work with zero network.
- **AC1.4.3** Given the prayer-time computation cannot produce a result for
  the saved location (e.g. extreme latitude), then the feature is silently
  absent — an explicit, honest Settings note explains it; no error surfaces
  on Home.

### 4.3 UX requirements

- Lives as an **ambient Home state** at the top of the existing Home stack
  (above/instead-of the greeting area while active); exact placement and
  priority vs. routines (R2) is OQ-5. No new tab, no notification, no badge.
- First-run after enabling: nothing appears until the first real window —
  no demo mode, no "coming soon".
- Empty/fallback: no location → feature invisible (AC1.1.1); window expired
  mid-session → the flow, once opened, may finish; the card does not
  linger.
- Copy tone: situational and warm, never commanding ("It's Maghrib — your
  after-salah set", not "You must now do 33x3").
- Accessibility: card and flow reachable and operable by screen reader with
  labels announcing the prayer name and current item/progress; touch targets
  at the existing minimum; motion (if any) respects reduced-motion; all
  colors via existing theme tokens (dark mode automatic).

### 4.4 Edge cases (explicit)

- **DST / clock changes:** when the device timezone or DST state changes,
  prayer times recompute and windows track the **saved location's true
  solar moments expressed in the device's clock** — the window shifts with
  the wall-clock change rather than evaporating or duplicating. Given a DST
  spring-forward, when a prayer's window would span the skipped hour, then
  the window is simply shorter or absent that day, with no error.
- **No location set:** feature fully invisible (AC1.1.1); app unchanged.
- **Traveler across timezones:** given London saved and the device flown to
  New York, when London's Maghrib occurs, then the card appears at the
  NY-clock time corresponding to London sunset; editing the location in
  Settings recomputes windows immediately.
- **Isha window across midnight:** given Isha at 23:50 with a 30-minute
  window, when the user completes the set at 00:10, then the sessions log
  to the new calendar date (existing "log when practiced" rule) and the
  streak machinery is unaffected; the window still expires at its end time.
- **Wrong device clock:** given a manually mis-set device date, then the
  feature degrades gracefully (windows computed from the wrong "now"); no
  persisted state is corrupted because the surfaced state is derived.
- **Multiple windows in one day:** each prayer occurrence is independent;
  completing Fajr's set does not affect Maghrib's card.

### 4.5 Dependencies & sequencing

- Needs the **offline prayer-time foundation** (computation + location
  setting). This foundation is R1's only real build risk; the one-week
  calculation spike (§10) must pass before any UI work.
- Sequences **after** remediation Wave 1 (counter safety) so the flow
  inherits 1.2's reset-confirm and gating patterns, and after the
  remediation telemetry decision (4.1) so privacy copy lands consistently
  (P2/P5).
- Settings additions follow the remediation 1.2 toggle pattern (P1).
- Persistence needs (location, per-occurrence done-attribution) must respect
  the **one-Dexie-bump-per-cycle** discipline — see §7 and OQ-1.

---

## 5. R2 — Routines as a first-class object (wird)

### 5.1 Description & ritual moment

After Fajr and before Maghrib, the wird keeper runs a *protective sequence*
— the catalog's six-item morning/evening cluster (Bismillahilladhi ×3,
Radhitu ×3, Ajirni-minan-nar ×7, Hasbiyallah ×7, Sayyidul Istighfar ×1,
Allahumma-a'inni ×10). Her unit of success is binary and daily: "did my
morning adhkar today." A **routine** is an ordered list of zikr references
with per-item counts, a per-day "done today" state, and its own daily
streak. It deliberately has **no dates, no deadlines, no
completion-by-date** — you don't finish morning adhkar; you do it daily.
Sessions recorded inside a routine are ordinary sessions (streaks, plans,
history, groups all unchanged).

> Evidence: discovery opportunity #2; the catalog cluster is routine-shaped
> data with no routine object; the 1.3.0 "Continue next zikr" button proves
> users already run sequences through goal machinery and stumble.

### 5.2 User stories & acceptance criteria

**R2.1 — Start from a ready-made preset (one tap)**
> As a morning/evening adhkar keeper, I want the sunnah set ready to start
> so I don't hand-build ten goal-rows.

- **AC2.1.1** Given the routine entry point, when the user has no routines,
  then a one-tap preset built from the catalog's six-item morning/evening
  cluster (catalog `defaultTarget` counts, Hisn-ul-Muslim order) is offered
  for morning, for evening, or both — each instance with its own daily done
  state. Starting it requires no form-filling.
- **AC2.1.2** Given bn mode, then preset naming and all item names/meanings
  render in bn from the existing catalog data; no new untranslated strings.
- **AC2.1.3** Given the preset is started, then its items reference the
  user's existing seeded zikr records — a routine must not duplicate
  catalog zikrs into new records.

**R2.2 — Build a custom routine**
> As a practitioner with my own sequence, I want to compose an ordered
> routine from my library with my own counts.

- **AC2.2.1** Given the routine creation flow, when the user picks items,
  then they can order any subset of their library (predefined + custom
  zikrs) and set per-item counts, defaulting to the catalog
  `defaultTarget` (33 for custom zikrs, matching the existing convention).
- **AC2.2.2** The same zikr may appear more than once in one routine
  (liturgy sometimes repeats); each occurrence keeps its own count.
- **AC2.2.3** Routines support at least the preset's six items; a sane
  upper bound is an architect decision (OQ-4).
- **AC2.2.4** Per-item counts are editable after creation; edits apply from
  the next run and never retroactively alter completed days.

**R2.3 — Run today's routine (the flow)**
> As the wird keeper mid-sequence, I want one continuous flow that knows my
> place, even if I put the phone down.

- **AC2.3.1** Given a routine is started for today, when it runs, then it
  advances item-by-item (generalizing the 1.3.0 continue-next behavior)
  with each item's count prefilled; reaching an item's count auto-saves and
  advances (same mid-flow rule as AC1.3.2; keep-counting stays in the plain
  counter).
- **AC2.3.2** Given the user quits mid-routine, when they return the same
  day, then the routine resumes at the next incomplete item with its count;
  already-saved items are not re-counted.
- **AC2.3.3** Given all items have reached their counts today, then the
  routine shows "done today" and its card on Home reflects completion.
- **AC2.3.4** Every item completion saves an ordinary session (AC1.3.4
  rules apply verbatim: plans, streak, groups, propagation semantics
  unchanged).
- **AC2.3.5** The same zikr counted outside the routine (plain counter,
  manual entry, group row) counts toward that routine item's daily count —
  a user who logs morning items from the Progress page must not have to
  redo them in the flow. (The app must aggregate per-item today-counts from
  all sessions of that zikr; attribution to "the routine" need not be
  exclusive.)
- **AC2.3.6** Given offline (airplane mode after first load), then
  creation, running, resume, and done-today all work with zero network.

**R2.4 — See it on Home**
> As the wird keeper, I want to glance at Home and know: did I do my morning
> adhkar today?

- **AC2.4.1** Given at least one routine exists, then Home shows a routines
  section where each routine's today-state is legible at a glance: done /
  in progress (with position, e.g. "3 of 6") / not started.
- **AC2.4.2** Given **no** routines exist, then the default Home is
  unchanged except **at most one quiet, dismissible discoverable
  affordance** leading to the preset — never a modal, never a tour.
  (Placement — Home row vs. Library card — is OQ-5.)
- **AC2.4.3** Given the user never starts or completes a routine, then it
  stays in an idle/gentle state indefinitely: no nag copy, no
  auto-deletion, no decay. Deleting a routine is explicit user action and
  removes only the routine, never the underlying zikrs or sessions.

**R2.5 — Routine streak (inherits R3)**
- **AC2.5.1** Each routine keeps a daily streak: consecutive days the
  routine reached done-today. The **gentle-restart rules of §6 (R3) apply
  to routine streaks identically** — one missed day is forgiven at the
  trailing edge; two consecutive misses end it with fresh-start framing.
- **AC2.5.2** A partial day (some items done) does **not** count as done
  for the routine's streak, but its sessions still count toward the
  **overall** streak (P3 honesty: the routine streak means "did the whole
  sequence").
- **AC2.5.3** A routine-specific "log yesterday?" repair prompt is out of
  scope for v1 (follow-on); the overall prompt (R3) exists regardless.

### 5.3 UX requirements

- Home is the primary surface (AC2.4.1); the run flow lives in the counter
  machinery — no new counting paradigm, no new nav tab for v1.
- Defaults: preset counts from the catalog; routine named by preset
  ("Morning adhkar" / bn equivalent); custom routines get a user-editable
  name.
- Empty/fallback: no routines → single quiet affordance (AC2.4.2);
  mid-routine exit → resume state, not a restart.
- Copy tone: the sequence is a practice, not a test — "Continue where you
  left off", never "You're behind".
- Accessibility: position ("item 3 of 6") announced to screen readers;
  Arabic item text with `lang="ar" dir="rtl"`; existing touch-target and
  token rules; both themes via semantic tokens.

### 5.4 Edge cases (explicit)

- **User who never does the routine:** idle forever, deletable, zero
  nagging (AC2.4.3). No "we miss you" mechanics.
- **Partial completion:** resume exact position same-day (AC2.3.2);
  partial days don't count for the routine streak but do for the overall
  streak (AC2.5.2).
- **Missed days:** governed by §6 rules; the routine's done-today and
  streak must be derivable from session history + routine definition
  (mechanism is OQ-6's sibling question, folded into OQ-4).
- **Timezone/travel:** "today" is the device's calendar day, consistent
  with existing session-date handling; a sequence run near midnight may
  legitimately split across two days — each day's portion counts for that
  day, and the routine is done-today when its items complete. No special
  handling in v1.
- **Catalog overlap:** items are references to existing zikr records;
  soft-deleting a zikr that appears in a routine must not crash or
  ghost-count — the routine marks the item missing with a graceful display
  and excludes it from done-today until restored or replaced (failure
  state, testable).
- **Duplicate routine names:** allowed (routines are user objects, not
  catalog entries); no uniqueness constraint required.

### 5.5 Dependencies & sequencing

- **Independent of R1 for v1** — routines are not time-gated in v1 and do
  not require prayer times. Time-anchored surfacing (show the morning
  routine in the Fajr window) is a **follow-on that reuses R1's prayer-time
  foundation**; do not build it now.
- Reuses the counter wholesale (durable checkpoints, auto-save, haptics)
  and the remediation 1.2 gating patterns; mid-flow advance + Undo
  composition is shared with R1 (OQ-3).
- Persistence of routine definitions must respect the one-schema-bump
  discipline (§7, OQ-1).
- Must **not** create plan rows, touch plan completion semantics, or appear
  in "Your Goals" — plans and routines are separate objects (P3).

---

## 6. R3 — Gentle restarts (streak forgiveness)

### 6.1 Description & ritual moment

The moment a returning striver opens the app the day after a miss. Today
the streak shows zero and the moment reads as failure; lapsed users quit
here. The rule becomes **"never miss twice"**: a streak survives exactly
one missed day; only a second consecutive missed day ends it. The missed
day is met with grace framing and a one-tap "log yesterday?" repair prompt
(backdated logging and streak rebuild already work — 1.3.0). This is
presentation and one prompt on existing plumbing.

> Evidence: discovery opportunity #3; habit-research norm (streak freeze /
> "never miss twice"); the existing overall-streak grace rule already
> refuses to break a streak just because today hasn't happened yet.

### 6.2 The rule (normative — numbers must match exactly)

Applying to the **overall streak** and, per AC2.5.1, every routine streak:

- **R3.0 (existing, retained):** a day with no session yet today does not
  break anything; the streak anchors from yesterday.
- **R3.1 (forgiveness):** the streak value survives **exactly one
  consecutive calendar day with no session, at the trailing edge only**.
  Mid-chain gaps always ended the streak historically and continue to —
  forgiveness is never applied retroactively to old gaps (honesty: history
  doesn't rewrite).
- **R3.2 (break):** a **second consecutive** missed day ends the streak.
  The value becomes 0 with fresh-start framing (R3.3), never guilt copy.
- **R3.3 (repair):** logging a backdated session for the missed day, or
  simply practicing again today, both continue the streak — under R3.1's
  math, the first session after one missed day yields **prior streak + 1**,
  not 1.

Worked examples (test vectors):

| Days (P = practiced, − = none) | Displayed overall streak |
|---|---|
| P P − (open on day 3, nothing today yet) | **2**, in grace state (held, resume framing + prompt) |
| P P − P | **3** (forgiveness applied silently, no special state) |
| P P − (log yesterday backdated) | **3** (existing rebuild), normal state |
| P P − − | **0**, fresh-start framing |
| P − P | **2** |
| P P − P − P | **4** (each gap forgiven at its own trailing edge) |
| P − − P | **1** (streak broke; fresh run) |

### 6.3 User stories & acceptance criteria

**R3.1 — See grace, not failure**
> As a user who missed one day, I want to come back without seeing zero.

- **AC3.1.1** Given a streak ≥ 1 and exactly one fully missed day, when the
  user opens the app on the return day before practicing, then the streak
  badge shows the **held value** in a visually distinct, quieter grace
  state (e.g. subdued styling; exact visual to design) with a short resume
  line — the number and framing must match the §6.2 table exactly.
- **AC3.1.2** Given the same state in bn mode, then grace copy renders in
  bn at native quality (full parity; no English fallback).
- **AC3.1.3** Given a brand-new user or a streak of 0, then nothing
  changes: no grace state, no badge (current behavior), no prompt.
- **AC3.1.4** Given the user practices on the return day, then the grace
  state resolves into the normal badge showing prior+1 (worked examples,
  row 2) — no special celebratory or explanatory screen required.

**R3.2 — Repair with one tap**
> As a user who actually did count on my misbaha but didn't open the app
> yesterday, I want to log yesterday in one tap so my streak is true.

- **AC3.2.1** Given the grace state, when it renders, then a **"Log
  yesterday?"** prompt offers one-tap entry into the existing backdated
  manual-entry flow **for yesterday's date directly** — a deep link into
  the flow, not a pointer telling the user where to go (remediation 4.3
  deep-link discipline).
- **AC3.2.2** The prompt is dismissible, appears at most once per
  return-day, never blocks any interaction, and never re-appears for the
  same missed day after dismissal or after a session exists for yesterday.
- **AC3.2.3** Given the user logs yesterday (any zikr, any count within the
  existing entry rules), then the streak rebuilds from history exactly as
  1.3.0 behavior and the grace state resolves (worked examples, row 3).

**R3.3 — Break gently**
> As a user who missed two days, I want an honest fresh start, not a
> rebuke.

- **AC3.3.1** Given two consecutive missed days, when the user opens the
  app, then the streak reads 0 with fresh-start framing per P4 (e.g. "a
  fresh streak starts today" register) — the words broken/failed/lost must
  not appear in any locale.
- **AC3.3.2** Given the user's first session after a break, then the
  streak shows 1 and grows normally; no penalty state, no "streak lost"
  screen.

**R3.4 — Consistency**
- **AC3.4.1** The same rule, number, and framing appear everywhere the
  overall streak shows (Home and Progress — both read the same canonical
  computation; no divergent copies of the logic).
- **AC3.4.2** Routine streaks apply the identical rule (AC2.5.1) with
  routine-appropriate copy.
- **AC3.4.3** Session deletion (3-day edit window) or backup restore that
  changes history recalculates under the **same** rule — the rule is a pure
  function of history, so all paths agree (preferred shape: derived like
  today's overall-streak util, not persisted — OQ-6).

### 6.4 UX requirements

- Lives entirely in the existing streak badge surfaces + one prompt; no new
  page, no new tab. The framing is ambient by design; no permanent Settings
  toggle is required for ship. *The discovery pilot ships the grace framing
  behind a setting to its 10 users; whether the shipped default is on is an
  owner call after the test — see sanity-check list.*
- First-run: users with no streak history see nothing new (AC3.1.3).
- Failure states: none — this feature has no failure mode beyond history
  recalculation, which AC3.4.3 covers.
- Copy tone: P4. The held streak must never read as a false claim — the
  quieter grace styling plus resume line does that work; if design can't
  make the distinction legible, show the resume line only (design latitude;
  the honesty bar is fixed).
- Accessibility: grace state and prompt announced by screen readers; prompt
  dismissible via keyboard; existing token/target rules.

### 6.5 Edge cases (explicit)

- **What does NOT count as breaking:** (a) today not yet practiced (R3.0);
  (b) exactly one missed day (R3.1); (c) any session of any zikr of any
  size — there is no minimum count; (d) a backdated log for the missed day
  (R3.3/AC3.2.3).
- **What DOES end it:** two consecutive missed days (R3.2); a mid-chain
  gap in history (always did).
- **Interaction with existing grace rule:** R3.0 is retained unchanged;
  R3.1 strictly extends it at the trailing edge — the existing rule's
  behavior on all current scenarios must remain identical.
- **Long streaks:** forgiveness math is independent of streak length; a
  200-day streak gets the same one-day trailing grace.
- **Multiple returns:** a user who oscillates (P − P − P) keeps getting
  per-gap forgiveness (worked examples, row 6) — no "strikes" ledger, no
  escalating consequences.
- **Clock/timezone:** "day" is the existing normalized calendar-day
  convention (dateUtils); travelers' days follow the device calendar day,
  as today.
- **Restore/import:** a backup restore recomputes under the same rule
  (AC3.4.3) — no persisted grace state to desync.

### 6.6 Dependencies & sequencing

- **No dependency on R1/R2** — smallest build in the wave; ships first
  (recommended order: R3 → R2 → R1).
- Depends only on existing plumbing (backdated logging + rebuild, canonical
  overall-streak computation). The remediation 2.3 correction (overallStreak
  is canonical; the legacy `streaks` table retired from writes) is assumed;
  this feature must not touch legacy streak writes.
- Remediation 4.3's milestone backup nudge keys off streak milestones;
  grace may delay reaching them by a day — no conflict, but implementers
  should not couple the two.
- No schema change required if grace is derived (OQ-6) — if the architect
  needs persisted state, it joins the §7/OQ-1 single-bump coordination.

---

## 7. Coordination with the remediation wave

1. **Sequencing gate:** value-wave work starts only after remediation
   **Wave 1** (data integrity & counter safety) has landed; Waves 2–3 should
   land before or alongside, since R1/R2 copy and settings patterns depend
   on them. Exact interleaving is OQ-7.
2. **One schema bump per cycle:** the remediation plan reserves the cycle's
   single Dexie bump for 5.1 (v7) and names v8 for sync. R1 (location,
   done-attribution) and R2 (routine definitions) need persistence. These
   must either **fold into the same coordinated bump** as 5.1 or wait for
   the next cycle — never a second back-to-back migration. Resolution is
   OQ-1; the requirement is only the discipline.
3. **Counter composition:** R1/R2 flows ride the existing counter. They must
   respect remediation 1.2 as shipped: reset confirmation universal, gated
   decrement/Undo honored or absent, and no reintroduction of count state
   in two places without a sync guard (AGENTS.md). Auto-advance vs. the
   Undo window is OQ-3.
4. **Settings patterns:** every new toggle follows the remediation 1.2
   pattern — Settings placement, default off where gating is required, a
   description of exactly what it adds (P1).
5. **Telemetry:** none for these features in v1 (P5). If remediation 4.1
   ships its milestone-only bounded set, these features add **no events**
   unless separately approved as milestone-shaped; per-round/per-session
   events remain forbidden outright.
6. **Privacy copy:** if any shipped behavior could make the Welcome/Settings
   privacy note stale (it shouldn't — this wave adds zero network usage),
   copy moves in the same change (P2, remediation 4.1 discipline).
7. **Release hygiene:** every shipped piece updates CHANGELOG `Unreleased`
   (AGENTS.md); `npm run test`, `npm run lint:layers`, `npm run build` +
   size-check green at each feature boundary (remediation principle 2).

---

## 8. Non-functional requirements (testable)

- **N1 Cost & backend:** zero new server usage — given devtools network
  audit, enabling and using all three features produces no requests beyond
  the app's existing baseline; no new Supabase RPC/table is touched.
- **N2 Offline:** given airplane mode after first load, setup, detection,
  flows, grace states, and repair all function (AC1.4.2, AC2.3.6).
- **N3 Bundle:** `npm run size-check` passes after each feature; the
  prayer-time computation adds at most ~5KB gzipped on top of the current
  build; the total stays ≤200KB gzipped.
- **N4 Locales:** every new user-facing string exists in en and bn with the
  typed dictionary at full parity (today's per-key parity standard); bn
  copy is native-reviewed before ship; Arabic always `lang="ar" dir="rtl"`.
- **N5 Privacy:** the saved location and all routine/streak data stay
  on-device and inside the existing local backup/restore; nothing new is
  added to exports beyond what the architect's data design requires (and
  the export/import round-trip must not break — coordinate with remediation
  1.1).
- **N6 Honesty:** every displayed number is derivable from a stated rule
  (§5.2/§6.2 tables are the tests); no phantom logging — the app never
  records a session the user didn't perform.
- **N7 Architecture:** `core` never imports `ui`; streak/window/done-today
  computations live as pure utils consumed via `useMemo` — no
  `useEffect`+`setState` derived values; UI writes go through store
  actions; `npm run lint:layers` stays green.
- **N8 Accessibility & theme:** existing touch-target minimum,
  screen-reader labels for all new states, both themes via semantic tokens,
  reduced-motion respected.
- **N9 Upgrade path:** existing users see no destructive change; with no
  location and no routines, first launch after release is behaviorally
  identical to today except R3's framing (which is derived, so present
  immediately — intended).

---

## 9. Non-goals (this wave)

Explicitly out of scope; listed as follow-on candidates where noted:

- **Curated pledges/campaigns** (discovery #4) — templates over plans +
  groups; strong follow-on once routines exist.
- **Bengali ritual frame** (discovery #5) — Hijri/Bangla dates, Karachi as
  the bn-default prayer method, bn tone pass. Note: R1 must still pass the
  mosque-timetable test for the actual test community (OQ-2), but
  bn-defaulting the method is out of scope.
- **Web push / any server-initiated notification** (Idea.md's Android plan
  stays deferred; R1 is in-app ambient only).
- **Home-screen widgets** (PWA-impossible per Idea.md; R2's Home surface is
  the in-app reshape).
- **Reminders / notification center** — owned by remediation 4.2; not
  duplicated here.
- **Two-tap Home quick-log row** (discovery #6) — candidate follow-on;
  the R1/R2 flows cover the ritual-moment need for now.
- **Rhythm pacing for long counts** (discovery #7) — deferred, evidence
  thin.
- **Time-anchored routine surfacing** (morning routine in the Fajr window)
  — follow-on reusing R1's prayer-time foundation (§5.5).
- **Editing the after-salah set composition** — v1's set is fixed from the
  catalog cluster; per-user customization is a follow-on candidate.
- **Routine sharing / group routines** — Groups are under the remediation
  scope freeze.
- **"Next prayer in…" countdown surfaces** — ambient card only in v1.

---

## 10. Success measures (validation without surveillance)

All from the discovery doc's "cheapest next tests", assigned per feature.
None require analytics; results are recorded by hand.

| Feature | Test | Confirms if | Kills / iterates if |
|---|---|---|---|
| R1 Post-salah | **Fake door:** show 5 users (mix bn/en) a static mock of the Home state "It's Maghrib — your after-salah set", unexplained | ≥ 4 of 5 recognize the salah moment unprompted | Users don't connect it to prayer → reframe copy/concept before building UI |
| R1 Post-salah | **One-week calculation spike** (times only, no UI) against a local mosque timetable for the test city | All five times within ±2 min across the week with a standard method | No standard method matches the community timetable → escalate OQ-2 before any UI |
| R2 Routines | **No new code:** 3 users run the catalog morning set via an existing per-zikr plan + "Continue next zikr"; log every hesitation | Users afterward ask "where's my morning adhkar today?" — the object is real | Users are satisfied treating it as separate zikrs → the routine object adds nothing; keep plan-based |
| R3 Gentle restarts | **Interview:** 5 lapsed users (group WhatsApp channels), one question: "what happened the day your streak broke?" | Miss-day shame / zero-reset cited as the dropout moment → copy targets it | A different dropout cause dominates → re-scope copy and prompt |
| R3 Gentle restarts | **Gated pilot:** grace framing behind a setting to 10 users; compare 7-day return vs. ~10 non-enabled users by hand | ≥ half the grace group returns within 7 days; nobody reports the held streak as dishonest | Confusion about the held number → tighten framing or drop the held display, keep resume/prompt |

---

## 11. Open questions for the architect

Framed as questions on purpose — these are yours, not decisions smuggled in:

- **OQ-1 Schema coordination:** Can R1's location/done-attribution and R2's
  routine definitions fold into the cycle's single Dexie bump alongside
  remediation 5.1, given v8 is reserved for sync — or must some of this
  wave wait for the next cycle? What is the minimum persistent state if
  grace is derived (OQ-6)?
- **OQ-2 Prayer-time strategy:** Which calculation method(s) ship in v1 to
  pass the mosque-timetable test (§10) for the actual test community, and
  is a user-facing method chooser in v1 or deferred with the bn-frame wave?
  How is "manual location entry, fully offline" delivered (offline place
  search vs. coordinates vs. a bundled city list)?
- **OQ-3 Flow × Undo composition:** When the gated auto-save Undo toast
  (remediation 1.2c) is showing, does the guided flow's auto-advance wait,
  withhold advance, or advance and scope the undo to the just-saved item?
- **OQ-4 Routine bounds, attribution & missed-day derivation:** Upper bound
  on routine items; the mechanism for "done-today" and per-item daily
  aggregation across sources (AC2.3.5 requires cross-source aggregation;
  exclusivity is not required); and how routine done-today/streak are
  derived for past days.
- **OQ-5 Home information architecture:** When the post-salah card and an
  incomplete routine are active in the same window, which leads? Where do
  routines' quiet entry (AC2.4.2) and the routine section sit relative to
  the greeting, goal ring, "Your Goals", and the quick-start rail without
  clutter?
- **OQ-6 Grace implementation shape:** Can the one-day-trailing grace,
  grace-state display, and prompt-once dismissal be pure derivations from
  session history (preferred per N7 and the existing overall-streak
  pattern), or does prompt dismissal need persisted state?
- **OQ-7 Release interleaving:** Given the sequencing gate (§7.1), which
  value features ride which release alongside which remediation waves? The
  recommended feature order R3 → R2 → R1 is a default, not a demand.

---

## 12. Owner decisions included (sanity-check on request)

- **R1 opt-in via manual location, not a Settings gate alone:** no location
  → feature invisible; the location entry *is* the opt-in (privacy default),
  with an explicit, optional device-location affordance inside setup.
- **R1 fixed set and fixed window:** the four catalog items in order, 30-
  minute window, no per-user configuration in v1.
- **Mid-flow auto-advance without keep-counting:** guided flows advance at
  the item's count; counting past target stays a plain-counter behavior
  (AC1.3.2/AC2.3.1).
- **"Never miss twice" as the whole forgiveness rule:** exactly one
  trailing missed day survives; two end it; no strikes ledger, no
  configurable grace count (§6.2).
- **Grace shipped ambient (no permanent toggle):** the pilot ships behind a
  setting per the discovery test, but the intended ship default is on for
  everyone — flagged here so the owner can veto.
- **Routine streak = full completion only:** partial days don't count for
  the routine's streak but its sessions still count overall (AC2.5.2).

---

## 13. Review log

- **Architect review — APPROVED (2026-09-26).** Verified against code and
  sources before design (docs/solution-design.md):
  - Every factual claim about the current system checked and correct: the
    four-item after-salah set (33/33/34/100) and the six-item morning/evening
    cluster (3/3/7/7/1/10, in stated order) match `zikrCatalog.ts`
    `defaultTarget`s; the 1.3.0 attributions ("Continue next zikr", backdated
    streak rebuild) match CHANGELOG 1.3.0; the retained R3.0 grace rule and
    both streak surfaces match `overallStreak.ts` / `Home.tsx` /
    `Progress.tsx`; all remediation cross-references (1.2 gating, 2.3/5.2
    streak canonicalization, 4.1 telemetry, 4.3 nudge, 5.1's v7 + D4→v8,
    one-bump discipline) match the remediation plan.
  - adhan-js evidence verified at the source (published 4.4.2 tarball): MIT,
    zero runtime dependencies, Karachi method present, full minified bundle
    15.7KB → **5.2KB gzipped** — N3's "~5KB" allowance holds (tree-shakes
    further).
  - Clarifying interpretation (no product meaning change): §6.2 row 1's
    prose "(open on day 3, nothing today yet)" is ambiguous against
    AC3.2.2's prompt guard; read as — grace state = today AND yesterday both
    unpracticed with a live held streak; all seven vector *numbers* are
    unaffected and are the binding tests.
  - Tension resolved (mechanism, not intent): §4.5 lists "per-occurrence
    done-attribution" as a persistence need while AC1.2.5 mandates
    derived-never-persisted; the design derives attribution from sessions
    within the window, so R1's persistence shrinks to the saved location —
    which fits the existing `settings` KV (no schema bump). R2 alone carries
    the wave's single Dexie bump (v8; 5.1 keeps v7, sync's D4 renumbers to
    v9 — one-word follow-up needed in remediation 2.3's doc sweep).
  - OQ-3/OQ-4/OQ-5/OQ-6 answered in docs/solution-design.md §15; OQ-1/OQ-2
    answered with spike-gated defaults; OQ-7 sequenced.
- **Engineer review:** _(pending)_
