# Solution Design — Value Wave: Post-salah mode (R1), Routines (R2), Gentle restarts (R3)

| | |
|---|---|
| **Version** | 1.1 |
| **Date** | 2026-09-26 |
| **Status** | Approved (principal-engineer gate, 2026-09-26) · v1.1 amended 2026-09-26 — UI composition (owner directive, §16) |
| **Implements** | [docs/requirements.md](requirements.md) v2.0 (architect-approved 2026-09-26, see its Review log) |
| **Sibling** | [Remediation plan 2026-09-26](plans/2026-09-26-remediation-plan.md) — its Wave 1 gate and its Dexie v7 own this design's sequencing and schema numbering |

Every decision below is grounded in the current code; file paths are cited inline.
All answers to the requirements' open questions (OQ-1…OQ-7) are collected in §15.

---

## 1. Architecture overview

Nothing in this wave adds a layer, a route paradigm, or a backend. All three
features decompose into the existing four-layer stack under
`scripts/check-layers.mjs` rules (`src/ui → core/stores → core/services → core/db`):

```
src/ui/
  pages/Home.tsx            hosts the R1/R2/R3 containers — composition + slot order only (§16.2/16.3/16.5)
  pages/Counter.tsx         hosts CounterFlowContainer (?postSalah=/?routineId= beside ?planId=, §16.4)
  pages/Settings.tsx        hosts PrayerTimeSettingsContainer (R1 prayer-time section, §16.2)
  containers/postSalah/     PostSalahCardContainer · PrayerTimeSettingsContainer
  containers/routines/      RoutinesSectionContainer · RoutineEditorContainer
  containers/grace/         StreakStatusContainer (Home + Progress badge/prompt)
  containers/counter/       CounterFlowContainer (wraps CounterSession; owns steps + advancement)
  hooks/usePostSalahWindow  minute-tick wrapper over the pure window util (container plumbing, §16.1)
  hooks/useNow              shared 60s tick (R1 window expiry; container plumbing)
  components/postSalah|routines|grace/   presentational cards/rows/forms/prompts (props in, callbacks out)
src/core/
  utils/prayerTimes.ts      R1 pure: adhan-js → windows, occurrence attribution
  utils/routineUtils.ts     R2 pure: per-item today counts, done-today, routine streak
  utils/overallStreak.ts    R3: the canonical walk gains the one-gap grace (§6)
  data/prayerCities.ts      R1 bundled offline city list (see §4.3)
  services/routineService.ts    R2 CRUD + preset instantiation
  stores/routineStore.ts    R2 liveQuery store; owns routine mutations
src/core/db/
  db.ts                     ONE new Dexie version for this wave (v8, §2)
  types.ts                  Routine / RoutineItem (+ PrayerLocation setting type)
```

Layer compliance notes:

- The prayer-time window, routine done-today, and the streak grace are **pure
  utils in `core/utils`**, consumed via `useMemo` **inside containers** (§16)
  — no `useEffect`+`setState` derived values (N7; the pattern
  `src/ui/pages/Home.tsx:72-80` already uses — now sited in containers; see
  §16.6.2 for the one page-side survivor).
- Routine writes go through `routineStore` actions → `routineService` → Dexie
  transactions. UI never touches `db` directly (layer checker: `ui` may import
  `core/db/types` only, type-only).
- The post-salah and routine flows reuse the counter wholesale — **through a
  wrapping container**, not by deepening any component: `CounterFlowContainer`
  (§16.4) owns sequence resolution and step advancement, and
  `src/ui/pages/Counter.tsx` already turns a route param into a multi-zikr
  sequence via `planSequence()` (`src/core/utils/planUtils.ts:110`) with
  `onContinueNext` (`Counter.tsx:146-160`,
  `src/ui/components/counter/CounterSession.tsx:308-344`) — that page-side
  logic moves verbatim into the container, which adds two more sequence
  *sources* (`?postSalah=`, `?routineId=`); `CounterSession` itself gains
  only the presentational `flowMode` prop. The counting surface is unchanged.
- Sessions saved inside any flow are ordinary sessions through
  `useSessionStore.recordCount` → `src/core/services/countRecorder.ts` →
  `sessionService.add` (streak/plan recalc inside one transaction,
  `src/core/services/sessionService.ts:8-19`). Zero new propagation semantics
  (AC1.3.4 / AC2.3.4 hold by construction).

---

## 2. Data model & schema plan (OQ-1 resolved)

### 2.1 Version numbering

Remediation 5.1 owns **v7** (`sessionTotals` + pre-window anchor) in its own
release; the sync design's D4 is renumbered **v9** (note for the remediation
2.3 doc sweep: it currently says "v8" — see Risks). **This wave takes v8, and
v8 carries exactly one thing: the `routines` table.**

The decisive simplification: **R1 and R3 need no schema change at all.**

| Need | Home | Why |
|---|---|---|
| R1 saved location | `settings` KV row (`prayerLocation`) | `src/core/db/types.ts:130-133` `Setting {key, value}`; the settings store (`src/core/stores/settingsStore.ts`) already round-trips arbitrary values and `exportService` already includes `settings` in backups |
| R1 per-occurrence done-attribution | **derived, no persistence** | Window-scoped check over existing `sessions` (§4.5) — resolves the §4.5-vs-AC1.2.5 tension in the requirements' favor of AC1.2.5 ("derived, never persisted") |
| R2 routine definitions | **`routines` table (v8)** | Ordered item lists with editable per-item counts are structured, user-owned data — wrong shape for a KV blob (per-item edits, referencing integrity, future queries) |
| R2 mid-flow resume | **derived, no new state** | Already exists: per-item completion derives from today's sessions; the *partial count inside an item* resumes via the durable checkpoints the counter already writes (`zikrLastCount`, `src/core/services/countRecorder.ts:71-106`) |
| R3 grace value/state | **derived** | `overallStreak.ts` walk extension (§6) — matches AC3.4.3's preferred shape and OQ-6 |
| R3 prompt-once dismissal | `settings` KV row (`gracePrompt`) | Tiny fact with no query needs; KV is its right home |

### 2.2 The v8 migration

```ts
// src/core/db/types.ts (new)
export interface RoutineItem {
  zikrId: number;        // reference to the user's existing Zikr record (AC2.1.3)
  name: string;          // denormalized at write time — graceful display if the
                         // zikr is soft-deleted (§5.6); NOT a binding key
  target: number;        // per-item count (catalog defaultTarget at preset time)
}

export interface Routine {
  id: string;            // uuid (reuse the newPlanId() idiom, planUtils.ts:11)
  source: 'preset' | 'custom';
  /** For presets only: which liturgical preset — the localized title renders
   *  from i18n so bn/en follow the locale (AC2.1.2). Custom routines store a
   *  user-entered title. */
  presetKey?: 'morning' | 'evening';
  title?: string;
  items: RoutineItem[];  // embedded, ordered (Dexie document model, like Plan.zikrs)
  createdAt: Date;
  deletedAt?: Date;      // soft delete, house style (AGENTS.md)
}
```

```ts
// db.ts — v8 (this wave's single bump; purely additive)
this.version(8).stores({
  /* …all v7 store definitions repeated verbatim per the db.ts:53-245 pattern… */
  routines: 'id, deletedAt, createdAt'                                   // NEW
}).upgrade(async (tx) => {
  // Additive only: create the table, copy nothing. The upgrade test asserts
  // every prior table is byte-identical before/after and the new table is
  // empty and queryable.
});
```

- **One bump per release cycle holds:** v7 (remediation) and v8 (this wave)
  never share a release; v8 repeats v7's store definitions, which repeat v6's,
  per the existing `db.ts` pattern. If release reality forces R2 to ship
  *before* remediation 5.1, R2 takes the number v7 and 5.1 takes v8 — the
  invariant is "strictly sequential, exactly one bump per release, additive
  migrations only", never "this feature owns a fixed number".
- **Upgrade test per bump** (house pattern: `tests/core/db/migrationV6.test.ts`
  with `fake-indexeddb`): `migrationV7.test.ts` (remediation's — sessionTotals
  backfill + anchor) and `migrationV8.test.ts` (routines: fresh install at v7
  upgrades with all data intact; routines table present, empty, indexed).
- R2 must land **after** 5.1's `importData` coupling fix (remediation 5.1) so
  the §10 export round-trip extension builds on the repaired import path.

### 2.3 Single counting truth — how done-state derives from `sessions`

There are **no routine completion rows and no post-salah done rows**. Both
derive from `sessions` (the same rows the counter, manual entry, and group
modal write), so a count can never exist twice and no flow can desync from
history:

- **Routine items are day-scoped (AC2.3.5):** item `(zikrId, target)` for date
  `d` is complete iff
  `Σ sessions.where zikrId, formatDate(s.date) === d, source any → count ≥ target`
  — *all* sources aggregate (plain counter, manual entry from Progress, group
  row, flows). `countsToGoals` is **not** filtered here: a routine measures
  dhikr performed, not goal bookkeeping, and the session was really done
  (P3/N6 honesty; deviation risk noted in §13). The existing compound index
  `sessions: '[zikrId+date]'` (`db.ts:150`) serves this; with the store's
  in-memory array (`sessionStore.ts:89` loads all sessions) the aggregation is
  a `useMemo` map pass exactly like `planRingProgress`
  (`src/core/utils/metrics.ts:41-75`).
- **Post-salah occurrences are window-scoped (AC1.2.3):** an occurrence
  `[prayerInstant, prayerInstant+30min]` is done iff each of the four set
  items reached its target from sessions whose **timestamp** falls inside that
  interval. Ordinary sessions earlier today therefore cannot masquerade as the
  set (AC1.2.3), while a set genuinely run in the window is captured
  regardless of which surface saved it (flow or plain counter — the app cannot
  tell and must not care; N6 forbids phantom logging, so we never *write*
  attribution, only read intervals).
- **Routine streak (AC2.5.x):** day `d` is "done" for a routine iff every
  *non-missing* item (§5.6) is complete on `d`; the streak is the shared R3
  walk (§6) over that predicate. Partial days contribute sessions to the
  overall streak but not the routine's (AC2.5.2 falls out of the two separate
  derivations — no code keeps them apart, the math simply is separate).

---

## 3. Gentle restarts (R3) — smallest build, ships first

### 3.1 The canonical walk (single implementation)

`src/core/utils/overallStreak.ts` is already the single source for both
surfaces (`Home.tsx:72-75`, `Progress.tsx:52`). The R3.0 grace rule is its
cursor-step at `overallStreak.ts:18-20`. The extension replaces the inner walk
with the "skip a single gap" rule and is exported **once**:

```ts
export type StreakMode = 'normal' | 'grace' | 'fresh-break';
export interface StreakStatus { value: number; mode: StreakMode }

/** The one walk both surfaces (and routine streaks) use. */
export function streakStatus(hasDay: (dateStr: string) => boolean,
                             today: Date): StreakStatus
export function calculateOverallStreak(dates: Date[]): number  // keeps signature,
                                                               // delegates to streakStatus
```

Walk (verified against all seven §6.2 vectors):

1. cursor = today; if `!hasDay(today)` → cursor = yesterday (R3.0, unchanged —
   a current-behavior scenario must stay identical, §6.5).
2. Walking back: on a missing day, peek one further. If that day has a
   session, **skip the gap** (single-gap forgiveness — this is what makes
   `P−P → 2` and `PP−P−P → 4` true) and continue; if it is also missing,
   **stop** (`PP−− → 0`, `P−−P → 1`).
3. `mode`: `grace` when today ∧ yesterday are both unpracticed and `value ≥ 1`
   (AC3.1.1 "return day", prompt conditions AC3.2.2 — the prompt targets
   *yesterday* and must not fire when yesterday has a session); `fresh-break`
   when `value === 0` after a walk that crossed a double gap and the user has
   prior history (AC3.3.1); `normal` otherwise. Users with no history at all
   render nothing (AC3.1.3 — current `streakDays > 0` guard at `Home.tsx:195`).

R3.1's "never retroactively" is satisfied structurally: the walk is a pure
function of history — old double gaps stop it, nothing is persisted, so every
path (delete within the 3-day window, backup restore, backdated log) re-derives
identically (AC3.4.3).

**Routine streaks reuse the same `streakStatus`** with
`hasDay = routineDonePredicate` — AC2.5.1/AC3.4.2's "identical rule" is
literally the same function. The number in every §6.2 row is a table-driven
unit test (`tests/core/utils/overallStreak.test.ts` exists; vectors append).

### 3.2 Presentation + the one prompt

- The Home badge (`Home.tsx:195-200`) and the Progress streak badge are **one
  container**, `StreakStatusContainer` (§16.5), hosted by both pages — so
  AC3.4.1's "no divergent copies" is structural, not discipline. The
  container switches styling on `mode` via existing semantic tokens (quieter
  container for `grace`; P4 copy keys `grace.resumeLine`, `grace.freshStart` — no
  broken/failed/lost in any locale, enforced by a string test, §11); the
  `StreakBadge`/`GracePrompt` components it renders are presentational.
- **"Log yesterday?" prompt:** rendered by `StreakStatusContainer` on Home
  when `mode === 'grace'` and no `gracePrompt` dismissal for today, beneath
  the badge (it never blocks — AC3.2.2; when the post-salah card leads, both
  simply stack, §4.5). One tap bubbles `onLogYesterday()` to the page, which
  navigates to the existing
  backdated manual entry with the date prefilled to yesterday —
  `Progress.tsx` already owns that form (date input at `Progress.tsx:225-226`);
  the deep link is a query param (`/progress?date=YYYY-MM-DD&focus=entry`),
  the same discipline as remediation 4.3. Dismissal writes
  `gracePrompt = { dismissedFor: 'YYYY-MM-DD' }` via `saveSetting`
  (`settingsStore.ts:36-45`), invoked by the container — at-most-once per
  return-day (AC3.2.2); the prompt also self-resolves when yesterday gains
  any session (derivation — no code).
- **Pilot switch:** one setting `graceFramingEnabled` (Settings, default per
  the owner's post-pilot call; when off, `mode` renders as today's plain badge
  — the *number* still follows the new walk, because the number is the rule;
  only the framing is gated. The requirements' pilot design tests framing, not
  math). Flagged as an owner-visibility item, not an architect decision.
- No schema, no services, no new stores. Interacts with nothing in
  remediation 4.3 (its backup nudge reads milestones from the same number but
  is a separate toast; we do not couple them, §6.6).

---

## 4. Post-salah mode (R1)

### 4.1 Library: adhan-js — verified

`adhan` 4.4.2 (batoulapps/adhan-js): **MIT, zero runtime `dependencies`**
(npm `package.json` has none), browser+Node dual build. Verified from the
published tarball, not the README: `lib/bundles/bundle.esm.min.js` is
**15,735 B raw → 5,172 B gzipped**; the app imports the per-file ESM
(`lib/esm/Adhan.js`) so Vite tree-shakes further (Qibla, SunnahTimes,
PolarCircleResolution drop). **Budget impact ≈ 4–5KB gzipped — inside N3's
~5KB allowance.** Karachi method confirmed (`METHODS.md`:
`CalculationMethod.Karachi()`, Fajr/Isha 18°) plus the full method set and
`Madhab.Shafi`/`Madhab.Hanafi`. Times come back as absolute UTC `Date`
instants — exactly what interval math across DST/midnight/timezones needs.

The one-week §10 spike runs this library headless (`vitest`, no UI) against
the test community's mosque timetable before any UI lands, per §4.5.

### 4.2 Settings model (all in the `settings` KV — no schema bump)

```
prayerLocation:  { lat: number, lon: number, label: string,
                   method: 'Karachi'|'MuslimWorldLeague'|'Egyptian'|'UmmAlQura'
                          |'MoonsightingCommittee'|'NorthAmerica',   // default Karachi
                   madhab: 'Shafi'|'Hanafi',                         // default Shafi
                   highLatitudeRule?: 'MiddleOfTheNight'|'SeventhOfTheNight'|'TwilightAngle' }
postSalahEnabled: boolean        // AC1.1.5 card kill-switch (location retained)
```

Defaults (Karachi/Shafi) are the pre-spike placeholder; **the spike's
timetable comparison decides the shipping defaults before UI work merges**
(OQ-2). Locale-conditional defaults (bn → Karachi+Hanafi) stay a §9 follow-on
as written. A method/madhab chooser lives inside the prayer-time Settings
section — it is already behind the feature's explicit opt-in, so it does not
violate P1, and it costs zero bytes (parameter objects, not code paths).

### 4.3 Location strategy (OQ-2, privacy brand)

**All three input paths, converging on one manual confirm step:**

1. **Bundled offline city list** (primary): `src/core/data/prayerCities.ts` —
   ~300 entries (all Bangladesh district towns + major world cities with
   meaningful Muslim communities), name + nameBn + lat/lon, offline
   case-insensitive search, **~2–3KB gzipped**. This is what makes AC1.1.2's
   "a place they name/search offline" real: pure coordinate entry is hostile
   to the app's least technical users, and a bn-localized list is exactly the
   persona-4 investment pattern the catalog already embodies.
2. **Raw coordinates** (secondary): two numeric fields — the escape hatch for
   anywhere the list lacks.
3. **One-shot device geolocation** (optional affordance only,
   AC1.1.3): a single explicit button inside setup; the browser permission
   prompt appears only on that tap; denial leaves paths 1–2 untouched and we
   never re-prompt (no state remembers an attempt). The fix renders into the
   same confirm step (user sees label/coords before saving) — the *save* is
   always a deliberate manual act, which is what P2's "entered manually" buys.

Chosen against the alternatives: continuous/background tracking is out
(brand); coordinates-only fails usability; a network place-search violates
P2/N1 outright. Everything above is $0, offline, and on-device (AC1.1.4 —
devtools audit shows zero requests; the location lives in a local KV row and
rides existing backups, N5).

### 4.4 Window computation (pure, in `core/utils/prayerTimes.ts`)

```ts
export interface PrayerOccurrence {
  prayer: 'fajr'|'dhuhr'|'asr'|'maghrib'|'isha';
  start: Date; end: Date;              // [t, t+30min] as absolute instants
}
export function postSalahWindow(loc: PrayerLocation, now: Date):
  { active: PrayerOccurrence | null; all: PrayerOccurrence[] } // or null when uncomputable
export function occurrenceDone(loc, occ, sessions): boolean
```

- **Occurrences for "now"** = windows computed from `PrayerTimes` for the
  device's *current* local date **plus** the previous day's Isha — collected
  as absolute instants, then `active = all.find(now ∈ [start,end])`. The
  two-day gather is what makes the **Isha-across-midnight** case work: at
  00:10 with Isha 23:50, yesterday's-Isha window `[23:50, 00:20]` is still
  open and found, while the sessions it attributes to (AC1.2.3) carry their
  own timestamps and log to the new calendar date — the existing
  "log when practiced" rule (`countRecorder.ts:32-39` writes `date: now`)
  and `overallStreak` are untouched, exactly as §4.4 requires.
- **DST / clock changes:** instants are UTC-absolute; wall-clock labels shift
  with the device automatically. A spring-forward can swallow part of a
  window — it simply gets shorter (or vanishes if the prayer instant landed
  in the skipped hour); no error path exists to hit.
- **Traveler:** London saved, device in New York — `PrayerTimes(today-in-NY,
  London-coords)` yields London's solar events as instants; the card appears
  at the NY wall-clock instant corresponding to London sunset. Editing the
  location rewrites the KV row; the next `useMemo` pass recomputes
  (AC1.1.5/§4.4 "recomputes immediately").
- **Uncomputable (extreme latitude):** wrap the computation; adhan's
  `PolarCircleResolution` can still fail near the poles → `null` → the
  feature silently renders nothing on Home, and the Settings section shows
  the honest static note (AC1.4.3).
- **Wrong device clock:** derived-only state degrades by definition — wrong
  "now", wrong windows, nothing persisted to corrupt (§4.4).
- **Done attribution** per §2.3: all four items at target from sessions
  timestamped inside the occurrence interval.
- **Prayer names** come from i18n keys (`postSalah.prayer.maghrib` etc.) —
  bn at parity like every key (the typed `Dictionary`, `locales.en.ts:419`,
  `locales.bn.ts:6`, fails `tsc` on any missing bn key — N4 is machine-checked
  today already).

### 4.5 Where the ambient state lives (AppLayout rules, OQ-5)

The card is **a container inside `Home.tsx`'s content** —
`PostSalahCardContainer` (§16.2) — not shell furniture: AppLayout owns only
the frame (`AppLayout.tsx` — top bar, bottom nav, clearance), pages host
containers. The page mounts it in the leading slot, above the greeting
section (`Home.tsx:190`), and the container self-collapses to `null` outside
an active-and-not-done occurrence (AC1.2.4). While the card exists it
replaces the hero phrase area (§4.5/§4.3 "above/instead-of the greeting
area"): the container reports presence via `onActiveChange(active)` and the
page suppresses the hero line off that plain visibility flag — the page
subscribes to nothing for this (§16.1 chrome bridge). No new store:
`usePostSalahWindow()` = `useNow(60_000)` tick + settings read + pure util in
`useMemo`, all container plumbing — a fresh
mid-window app open renders the card on first paint; expiry lands on the next
minute tick (AC1.2.5's "next render"). Outside windows it renders `null` —
no shell (AC1.2.4). Priority vs routines: **the post-salah card leads**
whenever active — it is the ephemeral, minutes-long moment; routines are
all-day objects and sit lower (§5.3, §16.3).

### 4.6 The guided flow

The card deep-links to
`/counter?postSalah=<prayer>&zikrId=<first>` — the Counter page parses the
param and hands it to `CounterFlowContainer` (§16.4), which resolves a third
sequence source beside `?planId=` (`Counter.tsx:40,67-77`): steps = the four catalog
items resolved from the user's seeded records (names/subhanallah-33 etc. are
seeded rows with `defaultTarget` 33/33/34/100 — `zikrCatalog.ts:23-54`), each
step's target = catalog default, **count prefilled from the item's durable
checkpoint** (resume, AC1.3.3) exactly as the plan flow does today.

- Per-item completion advances **automatically** at auto-save (AC1.3.2): the
  flow's `onContinueNext` fires from the existing auto-save path
  (`CounterSession.tsx:159-185`) instead of offering Another Round;
  keep-counting-past-target stays plain-counter-only. Concretely: the
  container passes the presentational `flowMode` prop into `CounterSession`,
  which makes `RoundActions` render "next item" as the saved-state primary (it
  already does when `onContinueNext` is present) and suppresses the Another
  Round affordance mid-flow. **Step advancement never enters the component:**
  `handleContinueNext` and the position derivation live in the container
  (§16.4); `RoundActions` renders only what its props imply.
- **Undo composition (OQ-3 resolved):** when remediation 1.2c's gated Undo
  toast is showing, the flow **advances on save (never waits), and the Undo
  stays scoped to the just-saved item**; because flow position is *derived*
  (next incomplete item from sessions), an Undo that drops an item below
  target makes the flow's position recompute **back onto that item** on the
  next render. No sync guard needed — there is no second copy of position
  state to desync. The toast's non-blocking contract (remediation 1.2c) is
  preserved verbatim.
- Gated decrements (1.2a) behave identically inside the flow — they are the
  same component; nothing to re-gate (AC1.3.5 "behave consistently").
- Completion of item 4 → the flow's calm done state (AC1.3.6), rendered by
  the container (a presentational `FlowDoneCard` or the `flowMode`-styled
  `CounterSession`, §16.4); leaving
  mid-item leaves the counter's checkpoint, which is the resume.
- Window expiry mid-flow: the flow may finish (it is an ordinary counter
  route); the *card* disappears on expiry because it is derived (§4.3
  fallback rule honored).

---

## 5. Routines (R2)

### 5.1 Store / service / actions

- **`src/core/services/routineService.ts`** — CRUD + business rules, named
  functions + service object (house pattern, `sessionService.ts:107-117`):
  `createPreset(key: 'morning'|'evening')`, `createCustom(draft)`,
  `updateItems(id, items)` (AC2.2.4 — forward-only by construction: counts
  live on the routine, completed days live in history), `softDelete(id)`,
  `restore(id)`. Preset creation resolves the six catalog names against the
  user's **existing seeded zikr rows** (case/whitespace-insensitive name
  match, the seeder's own key — `seed.ts:26-44`) and refuses to duplicate
  zikrs (AC2.1.3): items carry `zikrId` references + denormalized `name`.
- **`src/core/stores/routineStore.ts`** — mirror of `planStore`'s shape:
  `createRetryableSubscription(() => db.routines...)` (error-recovery
  pattern, `sessionStore.ts:88-107`), actions that own every mutation and
  call the service inside `db.transaction('rw', db.routines, ...)`. Deleting
  a routine never touches zikrs or sessions (AC2.4.3).
- **Preset defaults:** order and counts are the catalog object's own order —
  Bismillahilladhi ×3 → Radhitu ×3 → Ajirni ×7 → Hasbiyallah ×7 → Sayyidul
  Istighfar ×1 → Allahumma-a'inni ×10 (verified against
  `zikrCatalog.ts:103-142` `defaultTarget`s). Preset titles render via
  `presetKey` → i18n (`routine.preset.morning`), so bn follows the locale
  without stored copy (AC2.1.2).
- **Bounds (OQ-4):** max **12 items** per routine (preset is 6; twice that is
  generous liturgy headroom; embedded array, zero perf implication). Max 5
  routines (Home section legibility); enforced gently in the creation UI.
  Duplicate zikr occurrences allowed with independent counts (AC2.2.2 — items
  are positional, not keyed). Duplicate routine names allowed (§5.4).

### 5.2 Flow state machine

The flow is the **same generalized sequence source as R1** (§4.6), driven by
routine items:

```
idle ──start──▶ item(i) ──auto-save@target──▶ i<last ? item(i+1) : done-today
  ▲                │  ▲
  │                └──┴── position re-derives from sessions on every render
  └── softDelete/restore only touches the routine object
```

- **Position is a pure function**: first item `i` with
  `todayCount(item.i) < target` — quitting mid-routine and returning resumes
  exactly there with its remaining count (AC2.3.2); the partial count inside
  an item rides the existing `zikrLastCount` checkpoint (§2.3). Already-saved
  items are never re-counted because position skips them, and their sessions
  are already on the books (no double counting by construction).
- **AC2.3.5 cross-source aggregation** is the same derivation — a user who
  logged items from Progress finds the flow positioned past them.
- **done-today** = no incomplete item → Home card shows the done state
  (AC2.3.3); derived, so it is true the moment the last count lands from
  *anywhere*.
- Deep link: `/counter?routineId=<id>&zikrId=<optional>`; the Counter page
  parses the param and `CounterFlowContainer` resolves
  steps via a new `routineSequence(routine, zikrs, todayCounts)` sibling of
  `planSequence` in `core/utils/routineUtils.ts` — position and advancement
  are container derivations (§16.4), never component state.
- **Soft-deleted zikr in a routine (§5.4 failure state):** item resolution
  (the `matchLocalZikr` idiom, `planUtils.ts:68-74`) skips missing zikrs for
  counting; the card/flow shows the item greyed with its stored `name` and an
  i18n "missing" suffix (a presentational prop on the row/step rendering —
  §16.3); **it is excluded from done-today** (the sequence
  cannot complete while an item is unresolvable — "graceful display +
  excluded" exactly as §5.4 specifies) until the zikr is restored or the item
  replaced. Unit-tested, not discovered later.

### 5.3 Home surface (OQ-5)

Routines render as a section **between "Your Goals" and the Quick Start rail**
(`Home.tsx:240-281`), hosted by `RoutinesSectionContainer` (§16.3) — glance
rows: name, position ("3 of 6" — also the
screen-reader announcement, AC §5.3), done check. With **no** routines: at
most one quiet dismissible row offering the preset (AC2.4.2) — dismissal is a
`settings` KV flag (`routinePresetOffer`, §2.1 pattern) written by the
container via `saveSetting`; no nag, no auto-delete (AC2.4.3). When the
post-salah card is active it leads (§4.5); routines never stack above it.
Creation/editing runs through `RoutineEditorContainer` in a dialog the Home
page opens from its own flow state (§16.3) — the page decides when, the
container owns the data.

---

## 6. Settings additions (P1 / remediation-1.2 pattern)

Settings page (`src/ui/pages/Settings.tsx`) gains one new section,
**"Prayer times"**, rendered only as an opt-in entry point. Composition per
§16.2: the page hosts `PrayerTimeSettingsContainer`; every row/chooser below
is a presentational component it renders.

- Location row (city search / coordinates / one-shot device fix — §4.3) with
  the saved label + edit; clearing the location removes the feature entirely.
- Method + madhab choosers (§4.2), defaults per the spike.
- "Show after-prayer set" toggle = `postSalahEnabled` (AC1.1.5 — hides the
  card without deleting the location).
- Static honest note when computation is unavailable (AC1.4.3).
- R3's pilot toggle `graceFramingEnabled` (§3.2) sits next to the haptics
  toggle while the pilot runs; default-off during the pilot, owner sets the
  ship default.

No other settings. Routines need no toggle — they are invisible until the
user creates one (P1: the default app is unchanged; AC2.4.2's single quiet
affordance is the discoverability, dismissible).

---

## 7. i18n plan

New flat keys, both locales, typed parity (missing bn key = `tsc` failure —
the existing `bn: Dictionary` mechanism):

- `postSalah.*`: card title/copy per prayer (`postSalah.card.maghrib` …),
  flow labels, completion line, settings section, unavailability note (~20 keys)
- `routine.*`: section heading, preset titles (morning/evening), position
  ("{{current}} of {{total}}"), done line, quiet affordance, missing-item
  suffix, editor labels (~20 keys)
- `grace.*`: resume line, fresh-start line, prompt + confirm/dismiss (~6 keys)
- City names: from `prayerCities.ts` data (nameBn in the record), not i18n keys.

Copy register per P4 for all `grace.*`/`routine.*` strings; bn reviewed by a
native speaker before ship (N4) — the discovery persona-4 framing applies.

---

## 8. Performance & bundle analysis

- **Budget mechanics:** `bundlesize` (package.json) enforces **200KB gzip per
  `.js` chunk** under `dist/assets/`; Vite's `manualChunks` splits
  `react-vendor` / `state-vendor` / main (`vite.config.ts:94-99`). All three
  features land in the **main chunk** (Home-critical, must not flash):
  adhan-js ≈ 4–5KB gz (§4.1), city list ≈ 2–3KB gz, feature code (utils,
  store, containers + components) ≈ 2–3KB gz estimated. **Total ≈ +8–10KB gz against the
  200KB/chunk ceiling** — `npm run size-check` gates each feature boundary
  (§7.7 of the requirements), and R1 must not merge if its spike+build shows
  the main chunk growing past budget headroom (check `dist` before merge; the
  fallback is a dynamic `import()` for the prayer module behind the settings
  opt-in, trading a first-window micro-delay for bytes — decision deferred to
  the spike, noted in §14).
- **Compute cost:** prayer times = two `PrayerTimes` computations per minute
  tick (today + yesterday's Isha) — microseconds; routine aggregation = one
  memo pass over the in-memory session array per store change, same shape as
  `planRingProgress`. The remediation-5.1 12-month session window bounds both
  (a routine streak older than the window walks to the window edge — same
  bound the overall streak accepts; consistent, documented in §14).
- **No new network** anywhere (N1): no RPC, no fetch; the geolocation fix is
  a device API invoked by an explicit tap.

---

## 9. Testing strategy (existing Vitest patterns)

| Area | File | Covers |
|---|---|---|
| R3 math | extend `tests/core/utils/overallStreak.test.ts` | all seven §6.2 vectors + `mode` transitions + R3.0-invariants (current scenarios unchanged) + routine-streak parity via `streakStatus` with a `hasDay` predicate |
| R3 copy | `tests/core/utils/graceCopy.test.ts` | `grace.*` keys in en+bn contain no broken/failed/lost (P4/AC3.3.1 is a testable string property) |
| R1 windows | `tests/core/utils/prayerTimes.test.ts` (headless part of the §10 spike, kept) | fixed-instant cases: each prayer, Isha across midnight, DST spring-forward wall-clock mapping, traveler (London coords, NY clock), occurrence attribution (ordinary session outside window ≠ done; in-window set = done), extreme latitude → null |
| R2 logic | `tests/core/utils/routineUtils.test.ts` | done-today cross-source aggregation (AC2.3.5), partial day, duplicate zikr items, soft-deleted zikr exclusion, preset resolution order/counts |
| R2 DB | `tests/core/services/routineService.test.ts` (`fake-indexeddb`) | preset create is idempotent-per-name against seeded rows, item edits forward-only, soft delete leaves zikrs/sessions intact |
| Migration | `tests/core/db/migrationV8.test.ts` | §2.2 upgrade assertions |
| Backup | extend the remediation-1.1 round-trip test | export→import with `routines` rows: zikr references survive (ids are preserved by the existing export), routine store replaced wholesale like personal plans |
| UI gating | `tests/ui/` happy-dom where a render decision matters | no location → zero post-salah DOM (AC1.1.1); no routines → only the quiet affordance; grace mode renders prompt once. Render decisions live in containers (§16), so these tests mount the container and assert its visibility logic, with components checked props-only |

House rules kept: pure unit tests preferred; DB-backed only where Dexie is
the subject; `npm run test` + `lint:layers` + build/size-check green at each
feature boundary (§7.7).

---

## 10. Sequencing

```
remediation Wave 1 (gate, §7.1) → Waves 2–3 → 4.1 telemetry decision
   │
   ├─ 1. R3 Gentle restarts      — no schema; independent; after 5.2 so the
   │                               legacy streak writes are already retired
   │                               (R3 must not touch them, §6.6)
   ├─ 2. R1 calculation spike    — runs in parallel with 1 (headless, no UI);
   │                               gates all R1 UI
   ├─ 3. remediation 5.1 (v7)    — in its own release (its own isolation rule);
   │                               R2's backup round-trip work builds on its
   │                               importData fix
   ├─ 4. R2 Routines             — ships the wave's single bump (v8, §2)
   └─ 5. R1 Post-salah UI        — after the spike passes + defaults chosen;
                                   no schema; order 4→5 keeps one bump per
                                   release trivially true
```

R1 before/after R2 is swappable (they share only the counter composition);
the requirements' recommended R3 → R2 → R1 stands. Sync's D4 = **v9**; if the
remediation 2.3 doc sweep already renumbered CrossDeviceSync-Design.md to
"v8", it needs a one-word follow-up to v9 (flagged §13).

## 11. Composition with remediation items (explicit)

- **1.2 counter gating:** flows render inside the same `CounterSession` —
  reset-confirm (1.2b, universal) and gated decrement/Undo (1.2a/c) apply
  verbatim; OQ-3 resolution in §4.6.
- **1.1 backup round-trip:** extended to routines (§9); location rides the
  existing `settings` backup path — no format change.
- **2.3/5.2:** R3 assumes `overallStreak` canonical + legacy writes retired;
  it adds no legacy-table code.
- **4.1 telemetry:** zero events from any feature (P5); the privacy copy
  (welcome/Settings) needs **no** change from this wave — zero new network is
  the whole position (§7.6).
- **4.3 backup nudge:** uncoupled (§3.2).

## 12. Accessibility & theme

All new surfaces are ordinary semantic-token sections in both themes
(`bg-surface-container-*`, `text-on-surface-variant`…); Arabic always
`lang="ar" dir="rtl"` (`CounterSession.tsx:240-243` pattern); position and
prayer announcements via `aria-live="polite"` regions; prompt dismissible by
keyboard (Escape/Tab-reachable buttons); touch targets `h-touch-target-min`
as everywhere; no motion beyond existing haptics/active-scale idioms, so
reduced-motion is respected by default (N8).

## 13. Risks & mitigations

1. **Mosque-timetable accuracy (highest).** Karachi may not match the test
   community's printed timetable. → §10 spike is a hard gate before UI;
   method chooser + `Other()`-style parameter fallback exist in-library;
   honest Settings note if unmatched (AC1.4.3 register).
2. **Bengali city-list coverage/quality.** Wrong transliterations would sting
   the persona it serves. → bn names reviewed natively with the locale copy;
   list is data, fixable without code.
3. **`countsToGoals` vs routine aggregation.** A user who logged with
   "don't count toward goals" off may be surprised it fills a routine. →
   chosen rule stated in §2.3 (routines ≠ goals; honesty of "done" wins);
   cheap to flip to filtering if the pilot surfaces surprise; flagged for
   the principal engineer as a judgment call, not a hidden default.
4. **Remediation drift.** If 5.1's v7 slips past R2, numbers swap (v8↔v7) —
   the invariant (§2.2) keeps migrations safe; the CrossDeviceSync-Design.md
   renumber target (v9) must be tracked in the 2.3 sweep.
5. **Session-window bound (5.1) vs long streaks.** Once sessions load in a
   12-month window, walks stop at the window edge; a >365-day streak
   truncates. → document in 5.1's history-visibility copy; the anchor row
   already preserves lifetime *totals*, and streak truncation at a year is
   an accepted, honest bound pending owner objection.
6. **Undo × derived flow position** could look like "the flow fights the
   user" if an Undo steps them back. → the step-back is correct (the item is
   genuinely incomplete) and the toast copy says what happened; covered by a
   component test (§9 UI gating row).
7. **adhan-js high-latitude edge throws.** Wrapped + null-propagates to
   "silently absent"; covered by the extreme-latitude test.

## 14. Open items (honest)

- **Shipping defaults for method/madhab** — decided by the spike against the
  real timetable (§4.2); placeholder Karachi/Shafi until then.
- **`graceFramingEnabled` ship default** — owner call after the 10-user pilot
  (§6.4 of the requirements); the design implements the switch, not the
  answer.
- **Main-chunk vs lazy-loaded prayer module** — decide at the spike with real
  `dist` numbers (§8).
- **Routine streak display location** — Home row shows position; where the
  *routine's own streak number* shows (row subtext vs detail) is a design
  polish call during R2 UI, not a structure question.
- **Deeper "log yesterday" prefill for group contexts** — the deep link
  targets personal manual entry only; group rows are out of scope per the
  Groups freeze.

## 15. Decisions log (answers to the requirements' OQs)

- **OQ-1 (schema):** v8 for this wave, `routines` table only; R1 and R3 need
  no bump (settings KV + derivations); 5.1 keeps v7; sync D4 becomes v9;
  upgrade test per bump (§2). Fold-into-v7 fallback only if releases invert
  (§2.2 invariant).
- **OQ-2 (prayer-time strategy):** adhan-js (verified §4.1); Karachi default +
  MWL/Egyptian/UmmAlQura/Moonsighting/ISNA chooser; Shafi/Hanafi chooser;
  spike sets shipping defaults; locale-conditional defaults stay follow-on.
  Location = bundled offline city list + coordinates + one-shot optional
  device fix, one manual confirm (§4.3).
- **OQ-3 (flow × Undo):** advance on save, Undo scoped to the just-saved
  item, derived position steps back if Undo lands; never blocks (§4.6).
- **OQ-4 (bounds/attribution/derivation):** 12 items / 5 routines; day-scoped
  cross-source aggregation from `sessions`; done-today + streaks derived via
  `streakStatus` (§2.3, §5, §6).
- **OQ-5 (Home IA):** post-salah card leads (above greeting, replacing hero
  while active); routines section between "Your Goals" and Quick Start; quiet
  preset affordance only when no routines (§4.5, §5.3).
- **OQ-6 (grace shape):** fully derived; only prompt-dismissal persists, as a
  settings KV row — no grace state is ever stored (§3).
- **OQ-7 (interleaving):** §10 — R3 first, spike parallel, v7 release, then
  R2 (v8), then R1 UI; one bump per release invariant throughout.

---

## 16. UI composition (page → containers → components)

The owner's **Component hierarchy rule** (AGENTS.md, binding on all
new/modified UI) is now codified: **page → has multiple containers → each
container is responsible for one part → each container has multiple
components.** Pages decide WHICH container shows and when (route/flow state
only) and own no data access; containers are the ONLY data-touching tier —
they subscribe to stores (`core/stores`; never `core/db/db` or services
directly, per the layer rule), derive what they render via `useMemo` utils,
and invoke store actions; components are presentational (props in, callbacks
out — no store subscriptions, no data access, no derived metrics). New
containers live in `src/ui/containers/<feature>/`; reusable presentational
components stay in `src/ui/components/`. **This section is a structural
amendment only** — no behavior, acceptance criterion, data-model, or
sequencing decision elsewhere in this design changes; the sections above say
WHAT/WHEN, this section fixes WHERE each piece lives.

### 16.1 Rulings this wave applies on top of the rule

- **Data hooks are container plumbing.** `useNow` / `usePostSalahWindow`
  (§1) are called only by containers; presentational components never call
  them.
- **`useI18n` is presentation, not data.** Render-time translation (`t()`)
  inside components stays — it is how the house renders (`CounterSession`,
  `GoalRowCard`); the rule targets app-data stores, and stores hold codes,
  not strings.
- **Chrome facts flow up via container callbacks.** Where the page needs a
  datum only for chrome or a visibility decision (top-bar title, "suppress
  the hero phrase"), the container reports it through a callback prop
  (`onActiveStep(name)`, `onActiveChange(active)`) and the page keeps it as
  plain flow state — the page never subscribes to acquire it.
- **Wrap, don't rewrite, the counter.** `CounterSession` is reused through
  `CounterFlowContainer`; it gains only presentational props (`flowMode`,
  done-state styling). No data access is added to it (§16.6.1 for its
  pre-existing store writes).
- **Step advancement never lives in components.** Flow position and
  advancement are container derivations; `RoundActions` renders only what
  `onContinueNext` / `flowMode` imply.
- **Scope.** The rule binds new/modified UI. Pages this wave modifies (Home,
  Counter, Settings, Progress) compose their NEW parts per this section;
  their untouched pre-existing sections, and pages this wave never touches
  (Plans, Library, Group, Join, Room), stay as shipped.

### 16.2 R1 — Post-salah mode

**Pages & visibility**

- **`Settings.tsx`** — always hosts `PrayerTimeSettingsContainer` in the
  "Prayer times" section slot (§6). The container owns every render decision
  inside it: the setup form (no saved location), the saved-location row +
  choosers + toggle, or the honest static note (AC1.4.3). The page holds no
  visibility logic beyond the slot.
- **`Home.tsx`** — mounts `PostSalahCardContainer` in the leading slot, above
  the greeting section. The container self-collapses to `null` when: no saved
  location · `postSalahEnabled === false` · computation unavailable · outside
  any window (AC1.1.1, AC1.2.4) — and shows the quiet completed state instead
  of the prompt when the occurrence is done (AC1.2.3). While an active,
  not-done card exists the container reports `onActiveChange(true)` and the
  page suppresses the hero phrase line (§4.5's "replaces the hero"); the
  greeting section itself stays.
- **`Counter.tsx`** — parses `?postSalah=<prayer>` alongside `?planId=` and
  passes the source to `CounterFlowContainer` (§16.4). Flow visibility is
  ROUTE state, never window state: once opened, ambient expiry does not
  unmount the flow (§4.6); the user leaves via the page's `leaveCounter`.

**Containers** (`src/ui/containers/postSalah/`)

| Container | Single responsibility | Subscribes to | Invokes (store actions) | Derives (`useMemo`) |
|---|---|---|---|---|
| `PostSalahCardContainer` | The one ambient card: window detection, done state, start hand-off | `settingsStore` (via `usePostSalahWindow`: `prayerLocation`, `postSalahEnabled`), `sessionStore.sessions` | none — the start tap bubbles up (`onStartFlow`), the page navigates | `postSalahWindow(loc, now)` → `active`/`all`; `occurrenceDone(loc, active, sessions)`; the null/quiet/active render decision |
| `PrayerTimeSettingsContainer` | Location/method/madhab setup, toggle, honest note | `settingsStore` (`prayerLocation`, `postSalahEnabled`) | `saveSetting('prayerLocation', …)` (method/madhab edits rewrite the same row), `saveSetting('postSalahEnabled', …)`; owns the one-shot `navigator.geolocation.getCurrentPosition` call (data acquisition belongs to containers — the button only fires a callback) | `searchCities(query)` over the bundled list (§4.3); computation availability (`postSalahWindow(loc, now) !== null` → AC1.4.3 note) |

**Components** (no data access — props in, callbacks out)

- `components/postSalah/PostSalahCard.tsx` —
  `{ prayerLabel, titleLine, done, onStart() }`; renders the active card and
  the quiet completed state; `aria-live="polite"` (§12); i18n at render.
- `components/postSalah/PrayerLocationRow.tsx` —
  `{ label, onEdit(), onClear() }` (saved-location display; clearing removes
  the feature entirely, §6).
- `components/postSalah/LocationSetupForm.tsx` —
  `{ query, results, onQueryChange(q), onSelectCity(city), coords, onCoordsChange(lat, lon), deviceFixState, onRequestDeviceFix(), draft, onConfirmSave(), onCancel() }`
  — city search, raw coordinates, the device-fix affordance (callback only),
  and the one manual confirm step (§4.3).
- `components/postSalah/PrayerMethodChoosers.tsx` —
  `{ method, madhab, onMethodChange(m), onMadhabChange(m) }`.
- `components/postSalah/PostSalahToggleRow.tsx` — `{ enabled, onToggle(v) }`
  over the house `ToggleSwitch` (AC1.1.5 kill-switch).

### 16.3 R2 — Routines

**Pages & visibility**

- **`Home.tsx`** — mounts, in slot order: `PostSalahCardContainer` (leads per
  OQ-5, §16.2) → greeting (with `StreakStatusContainer`, §16.5) → goal ring →
  "Your Goals" → **`RoutinesSectionContainer`** (fixed slot between "Your
  Goals" and the Quick Start rail, §5.3) → Quick Start → and, only while the
  page's editor flow state is open, **`RoutineEditorContainer`** in a dialog
  shell. The section container decides its own content: routine rows, or the
  single quiet preset offer when no routines exist and not dismissed
  (AC2.4.2), or `null` once dismissed (P1: default app unchanged). Row taps
  bubble to the page, which navigates to
  `/counter?routineId=…&zikrId=…` (§5.2).
- **`Counter.tsx`** — `?routineId=` is the third flow source (§16.4).

**Containers** (`src/ui/containers/routines/`)

| Container | Single responsibility | Subscribes to | Invokes (store actions) | Derives (`useMemo`) |
|---|---|---|---|---|
| `RoutinesSectionContainer` | The Home routines section: glance rows, done/position/missing states, quiet offer | `routineStore.routines`, `sessionStore.sessions`, `zikrStore.zikrs`, `settingsStore` (`routinePresetOffer`) | `routineStore.createPreset('morning' \| 'evening')` (AC2.1.3 name-resolution happens in the service, §5.1); `saveSetting('routinePresetOffer', …)`; open/edit bubble up as callbacks | per-routine `todayCounts`, done-today, position ("3 of 6"), missing items (`routineUtils`, §2.3 — a missing item is greyed via a render prop and excluded from done-today, §5.2); quiet-offer visibility |
| `RoutineEditorContainer` | Create/edit one routine (custom build; per-item counts) | `zikrStore.zikrs` (library picker), `routineStore.routines` (existing routine when editing; max-5 check) | `routineStore.createCustom(draft)`, `routineStore.updateItems(id, items)` (AC2.2.4 forward-only) | per-item default counts (catalog `defaultTarget` via `zikrMapping`); bounds validity (≤12 items, ≤5 routines — §5.1, enforced gently as a `warning` prop, never a hard error) |

**Components** (no data access — props in, callbacks out)

- `components/routines/RoutineRow.tsx` —
  `{ title, current, total, done, missingCount, onPress() }` ("3 of 6" is the
  `aria-live` announcement, AC §5.3; `missingCount > 0` greys the row with
  the stored `name` + "missing" suffix, §5.2).
- `components/routines/QuietPresetOfferRow.tsx` —
  `{ onPreset(key), onDismiss() }` — one row, never a modal, never a tour
  (AC2.4.2).
- `components/routines/RoutineEditorModal.tsx` —
  `{ isOpen, onClose, title }` dialog shell (the `ZikrFormModal` idiom),
  hosting the form; holds no data itself.
- `components/routines/RoutineEditorForm.tsx` —
  `{ title, items, warning, onTitleChange(s), onAddZikr(id), onRemoveItem(i), onMoveItem(i, dir), onCountChange(i, n), onSave(), onCancel() }`
  with `components/routines/RoutineItemEditorRow.tsx` —
  `{ name, arabicText?, count, onCountChange(n), onRemove(), onMove(dir) }`
  (ordered-row interaction follows `GroupPlanBuilder`'s pattern; Arabic text
  always `lang="ar" dir="rtl"`, §12).

### 16.4 The shared counter flow (R1 + R2, plus plain & plan — unchanged behavior)

**`Counter.tsx` (page)** — route state and chrome only: parses
`?zikrId/target/planId/postSalah/routineId`, decides which source reaches the
container, owns AppLayout chrome (the top-bar title arrives via the
container's `onActiveStep(zikrName)` callback), the pre-existing haptics
top-bar action, and `leaveCounter` (`Counter.tsx:169-172`, unchanged).

**`src/ui/containers/counter/CounterFlowContainer.tsx`** — the ONE data owner
of the counter surface, for all four sources (plain · `?planId=` ·
`?postSalah=` · `?routineId=`):

- **Subscribes:** `zikrStore.zikrs`; `sessionStore` (`sessions`,
  `currentSession`, `checkpoints`); `planStore.plans`;
  `routineStore.routines`.
- **Derives (`useMemo`)** — moved verbatim from today's page logic
  (`Counter.tsx:67-141`): the step sequence — `planSequence(plan, zikrs)` /
  `postSalahSequence(zikrs)` (§4.6: catalog 33/33/34/100) /
  `routineSequence(routine, zikrs, todayCounts)` (§5.2) / single-step plain;
  **flow position = the first incomplete item, re-derived from today's
  sessions on every render** — the OQ-3 Undo step-back falls out unchanged
  (§4.6), because there is still no second copy of position state; each
  step's target; the resume `startCount` snapshot (the selection-lock and
  checkpoint effects, `Counter.tsx:87-130`, move here untouched in behavior).
- **Invokes:** `sessionStore.setCurrentSession` (the `onCount` mirror);
  `handleContinueNext` — advancement lives HERE (`Counter.tsx:146-160`'s
  logic verbatim). When the derived position passes the last item, the
  container renders the calm done state instead of a step (AC1.3.6). Round
  saves stay inside `CounterSession`'s existing auto-save path (§16.6.1 —
  AC1.3.4/AC2.3.4 propagation semantics untouched).
- **Renders** `components/counter/CounterSession.tsx` — the existing file,
  REUSED, not made data-aware. It gains exactly one presentational prop,
  `flowMode?: boolean` (suppresses Another Round mid-flow, lets the source
  label the continue-next action, styles the done state); all existing props
  are unchanged (`zikr, startCount, target, progressMode, onCount, onFinish,
  onContinueNext, variant, escapeResets`). A plain source with `flowMode`
  absent reproduces today's counter bit-for-bit (Another Round available, no
  relabel).
- **Components:** no new ones beyond the optional
  `components/counter/FlowDoneCard.tsx` — `{ setLine, onDone() }` (the calm
  completion state; i18n at render).

### 16.5 R3 — Gentle restarts (badge + prompt)

**Pages & visibility** — `Home.tsx` hosts `StreakStatusContainer` inside the
greeting section (badge where `Home.tsx:195-200` sits today; the prompt
beneath it); `Progress.tsx` hosts the SAME container (badge only,
`showPrompt={false}`), replacing its inline streak derivation
(`Progress.tsx:52`). One container → AC3.4.1's "same rule, number, framing"
is structural.

**`src/ui/containers/grace/StreakStatusContainer.tsx`** — one
responsibility: the streak's number, framing, and repair prompt.

- **Subscribes:** `sessionStore.sessions`; `settingsStore`
  (`graceFramingEnabled`, `gracePrompt`).
- **Derives (`useMemo`):** `streakStatus(hasDay, today)` (§3.1) over
  `formatDate`-normalized session days; the render decision — nothing when
  there is no history (AC3.1.3: `mode === 'normal' && value === 0`; the
  `fresh-break` admission from the review log is this container's logic);
  prompt visibility = `graceFramingEnabled && mode === 'grace' &&
  gracePrompt.dismissedFor !== today` (AC3.2.2 — framing-gated per §3.2;
  self-resolves when yesterday gains a session, derivation only).
- **Invokes:** `saveSetting('gracePrompt', { dismissedFor: today })` on
  dismiss. The "Log yesterday" tap bubbles `onLogYesterday()` to the page,
  which navigates to `/progress?date=YYYY-MM-DD&focus=entry` (§3.2); the
  Progress page honors those params (route state) and focuses its existing
  manual-entry form.

**Components** (no data access — props in, callbacks out)

- `components/grace/StreakBadge.tsx` — `{ value, mode, framingEnabled }`
  (styling + `grace.*` copy keys per §3.2; plain badge when framing off —
  the NUMBER still follows the new walk, §3.2).
- `components/grace/GracePrompt.tsx` — `{ resumeLine, onLog(), onDismiss() }`
  (keyboard-dismissible, non-blocking — AC3.2.2, §12).

### 16.6 UI pattern tensions (flagged, not silently bent)

1. **`CounterSession`/`RoundActions` already touch stores** — `recordCount`,
   `checkpointProgress`, `clearCurrentSession`, `clearProgressCheckpoint`,
   and the haptics read (`CounterSession.tsx:90-107`). This predates the
   rule, and AC1.3.4/AC2.3.4 freeze the save path's behavior, so this wave
   **wraps** the component (new presentational props only) instead of
   lifting its writes into the container. Strict conformance (persistence
   moved up, `CounterSession` fully presentational) is a clean follow-on
   refactor; flagged for the owner, not smuggled in here.
2. **Home's hero phrase keys off the streak number** (`Home.tsx:72-75`,
   `:202`) — a presentational page choice that needs a derived datum. Ruling:
   the page keeps its existing one-line `useMemo` (unchanged code) while the
   badge's number/framing/prompt authority is the container's; both call the
   SAME canonical `streakStatus`, so what is SHOWN cannot diverge (AC3.4.1
   governs displayed values). If the owner wants single-derivation
   strictness, the follow-on is a container callback feeding page flow state.
3. **AC1.2.1/§4.5 "replaces the hero" and the counter's top-bar title are
   page chrome that depends on derived state.** Resolved (not a conflict) via
   the §16.1 chrome bridge: containers report `onActiveChange` /
   `onActiveStep`; pages keep plain visibility flags and still subscribe to
   nothing for them. Recorded here so the bridge is a decision, not an
   accident.

---

## 17. Review log

- **Engineer review — APPROVED (2026-09-26).** Every cited file/line verified
  against the code before approval. The design is implementation-ready with
  these tightenings folded into intent (binding on implementation):
  - **Walk verified vector-by-vector.** Traced all seven §6.2 rows through
    the §3.1 algorithm (R3.0 anchor, single-gap skip, double-gap stop; grace
    = today ∧ yesterday empty ∧ held ≥ 1) — every number reproduces,
    including `PP−− → 0` and `P−−P → 1`, and the walk is a strict extension
    of `overallStreak.ts:18-20`. One existing test flips BY DESIGN:
    `tests/core/utils/overallStreak.test.ts` "breaks on a full missed day"
    ([today, 2-days-ago] → 1) is exactly vector row 5 (`P−P → 2`) — it is a
    vector scenario, not an R3.0 invariant; update it deliberately, don't
    "preserve" it.
  - **fresh-break rendering made explicit.** AC3.3.1 (reads 0 with
    fresh-start framing) vs the `streakDays > 0` guard (`Home.tsx:195`): the
    guard must admit `mode === 'fresh-break'` so a broken streak shows the
    fresh-start line, while true no-history users still render nothing
    (AC3.1.3). Add the happy-dom case alongside the grace-prompt one.
  - **Missing-zikr predicate conformed.** §5.2 + requirements §5.4 govern:
    an unresolvable item is never complete, so it BLOCKS done-today and the
    routine's day predicate while missing — §2.3's "every *non-missing* item"
    phrasing is conformed to that reading (no done-without-it path). Pin the
    block, and the streak across a delete→restore cycle, in
    `routineUtils`/`streakStatus` tests. (The two "§5.6" cross-refs point
    here — read them as §5.2.)
  - **Preset order citation corrected.** The order is Hisn-ul-Muslim
    (AC2.1.1), as the design's own sequence states — NOT "the catalog
    object's own order" (`zikrCatalog.ts` object order differs); citation
    is `zikrCatalog.ts:103-149` (Sayyidul Istighfar at 143-149). Counts
    3/3/7/7/1/10 all verified against `defaultTarget`.
  - **countsToGoals asymmetry pinned by test.** Routines aggregate ALL
    sources including `countsToGoals=false` sessions (§2.3) — deliberately
    asymmetric with `planRingProgress`'s filter (`metrics.ts:50`); add the
    explicit `countsToGoals=false` vector to `routineUtils.test.ts` so the
    documented flip path (§13.3) stays a one-line change.
  - **Verified clean:** schema plan follows the v1→v6 additive pattern and
    the `migrationV6.test.ts` shape (v7/v8 upgrade tests per bump; v8
    repeats v7 verbatim); v7/v8/v9 numbering is consistent with the
    remediation plan (its 2.3 sweep still says "v8" for D4 at its lines
    101/167/194 — the v9 follow-up this design flags is real and tracked);
    window math is instant-based and survives DST/midnight/travel via the
    two-day Isha gather; `importData` clears+replaces `settings`
    (`exportService.ts:165-192`), so `prayerLocation`/`gracePrompt` ride
    backup/restore with no format change; zero new network (no fetch/supabase
    in any touched surface; flows ride `recordCount` → `countRecorder` →
    `sessionService.add`, propagation untouched); the bundle gate is wired
    (`bundlesize` 200KB gzip per chunk + `size-check`) with the §10 spike as
    the hard footprint gate; Undo composition is safe because flow position
    is genuinely stateless (derived from sessions — no second state to
    desync); the 12-month session window (5.1) bounds routine-streak walks
    exactly as documented in §13.5.

- **UI composition amendment (owner directive) — applied (2026-09-26).**
  - New §16 maps every surface to the owner's page → containers → components
    rule: Home hosts `PostSalahCardContainer` / `StreakStatusContainer` /
    `RoutinesSectionContainer` (+ `RoutineEditorContainer` from page flow
    state); Counter hosts `CounterFlowContainer` (all four sequence sources;
    step advancement moves out of the page into it); Settings hosts
    `PrayerTimeSettingsContainer`; Progress reuses `StreakStatusContainer`.
  - Containers are the only store subscribers (actions named: `saveSetting`,
    `routineStore.createPreset/createCustom/updateItems`,
    `sessionStore.setCurrentSession`); all derivations
    (`postSalahWindow`, `occurrenceDone`, `routineSequence`, `streakStatus`)
    are container `useMemo`; every new component is props-in/callbacks-out
    with confirmed zero data access.
  - `CounterSession` is wrapped, not made data-aware — its only change is the
    presentational `flowMode` prop; its pre-existing store writes are flagged
    in §16.6.1 rather than silently kept or gutted.
  - Swept the doc for monolithic-UI implications (§1 tree + layer notes,
    §3.2, §4.5, §4.6, §5.2, §5.3, §6, §8, §9) — all now point at §16; no
    behavior, acceptance criterion, data-model, or sequencing change.

- **Engineer review — UI composition amendment APPROVED (2026-09-26).**
  Structural-only pass over §16 against the AGENTS.md Component hierarchy
  rule; every load-bearing §16 claim spot-checked against the code before
  approval.
  - **Pattern compliance holds.** All six containers (PostSalahCard,
    PrayerTimeSettings, RoutinesSection, RoutineEditor, CounterFlow,
    StreakStatus) subscribe only to stores, derive via `useMemo` utils, and
    invoke only store actions; every new component is props-in/callbacks-out;
    pages keep slot order, route/flow state, and chrome only; placement is
    `src/ui/containers/<feature>/` as the rule requires. The geolocation call
    sited in `PrayerTimeSettingsContainer` (callback-only button) and the
    useI18n-at-render ruling are consistent with the rule's intent.
  - **CounterSession claims verified verbatim.** Its real props
    (`CounterSession.tsx:41-76`) match §16.4's "all existing props unchanged"
    list exactly; the pre-existing store writes §16.6.1 flags are real
    (`recordCount`/`checkpointProgress`/`clearCurrentSession`/
    `clearProgressCheckpoint` at `:90-93`, haptics read `:106`); the
    auto-save path (`:159-185`) and the continue-next-primary `RoundActions`
    render (`:330-344`) support the `flowMode` plan with zero behavioral
    edits. Page citations (`Counter.tsx:40/67-141/87-130/146-160/169-172`,
    `Home.tsx:72-75/190/195/202/240-281`, `Progress.tsx:52`,
    `settingsStore.ts:36-45`) all verified accurate.
  - **Layer rule intact and machine-clean.** Containers touch stores/utils
    only; `ui → core/data` (`searchCities` over `prayerCities`) is permitted
    by `scripts/check-layers.mjs` (it bars only `core/db` and
    `core/services`; `zikrMapping.ts` already imports the catalog) — no
    indirection needed. No container or component references `core/db/db` or
    services.
  - **UI-touched ACs remain satisfiable as structured.** Post-salah
    self-collapse (container null/quiet/active decision, AC1.2.4), routine
    step advancement + done-today (position = derived first-incomplete-item
    from sessions — no second state to desync, AC2.3.2/2.3.3), and the grace
    "log yesterday?" deep link (`StreakStatusContainer` → `onLogYesterday` →
    `/progress?date&focus`, AC3.2.1/3.2.2) each land in a container without
    new behavior. The three §16.6 tensions are honestly resolved: 16.6.1's
    wrap-not-gut is an explicit, flagged owner follow-on (accepted);
    16.6.2's dual `streakStatus` derivation cannot diverge displayed values
    (same pure function; AC3.4.1 governs what is shown); 16.6.3's chrome
    bridge is recorded as a decision, with pages subscribing to nothing for it.
  - **One observation to hold in implementation (non-blocking).** §16.4
    leaves the pre-existing haptics top-bar action on the Counter page — a
    page-tier store touch covered by §16.1's Scope bullet (untouched
    pre-existing sections stay as shipped). Implementation must not widen
    that exception beyond the pre-existing action.
  - **Doc sweep confirmed.** §1, §3.2, §4.5, §4.6, §5.2, §5.3, §6, §8, §9
    all now point at §16; no section still implies monolithic page UI; the
    Status row carries the v1.1 amendment and this log entry is dated.

- **As-built (R2 implementation, 2026-09-27):** routines table shipped as
  **v7** (ship-order numbering; remediation 5.1 takes the next bump when it
  lands) — per §2.2's invariant ("strictly sequential, exactly one bump per
  release, additive migrations only", never a fixed feature number).
  Upgrade test: `tests/core/db/migrationV7.test.ts` (v6-with-data → v7;
  routines table present, empty, indexed; all prior rows intact).

- **Implementation status (2026-09-27, updated after R1 landed):** Wave 1
  (remediation 1.1–1.3), R3, R2, **and R1** are implemented on `main2` and passed
  final principal-engineer verification (319/319 tests, `tsc --noEmit` clean,
  `lint:layers` clean, largest chunk 88KB gz vs the 200KB budget — all three
  verdicts APPROVED). The deferral previously recorded here is resolved: the
  dependency is the npm package **`adhan`** (v4.4.6) — the GitHub repo is named
  "adhan-js" but that npm name does not exist (early install attempts 404'd on
  it). R1's entry follows below.

- **As-built (R1 implementation, 2026-09-27):** R1 shipped as designed once
  `adhan` 4.4.6 became installable; the spike gate ran as the permanent test
  `tests/core/utils/prayerTimes.test.ts` — an independent NOAA/Spencer
  calculation (declination + equation of time, in-file) cross-checks adhan's
  Dhaka output across six dates (both solstices, both equinoxes, two middling
  days); worst-case delta **2.37 min** (Dhuhr, Jan 15) against the ±5 min gate.
  Structure follows §16 exactly: `PostSalahCardContainer` +
  `PrayerTimeSettingsContainer` in `src/ui/containers/{postSalah,prayer}/`,
  the five presentational components of §16.2 under
  `src/ui/components/prayer/` (PostSalahCard hosts both the prompt and the
  quiet completed state; the settings container hosts the other four),
  `useNow`/`usePostSalahWindow` as container plumbing. The window util
  (`postSalahWindow`, `occurrenceDone`, `postSalahSequence`) lives in
  `core/utils/prayerTimes.ts`; the city list in `core/data/prayerCities.ts`
  (64 BD districts + 143 diaspora entries = 207 cities, bn names, tuple
  rows). Measured bundle impact (stub-build delta): **+11.5KB gzipped** on
  the main chunk (adhan tree-shaken + city list + window/sequence math);
  the largest chunk ships at 90,088 B gz against the 200KB/chunk budget. As-built deviations, all additive: (1) `occurrenceDone(occ,
  sessions, zikrs)` takes the zikr list instead of the location (sessions
  bind `zikrId`, the set resolves by catalog name — the design's `loc`
  parameter was unnecessary); (2) `postSalahEnabled` ships default-OFF per
  the owner's simple-default directive, so the card appears only after
  location AND toggle (AC1.1.5 governs both directions); (3) the
  method/madhab choosers ARE rendered (§4.2 keeps them behind the opt-in)
  with Karachi/Shafi defaults; (4) `PrayerLocation` gains an optional
  `cityId` so bn users see the Bangla city name; (5) the flow attributes to
  the prayer's occurrence interval (§2.3) even after the card expires —
  flow visibility is route state (§16.4), so the interval, not "now",
  defines the credit window. No schema change (settings KV only); zero new
  network; 30-minute windows, two-day Isha gather, DST/traveler/polar-null
  vectors all pinned by test.

- **Engineer review — R1 APPROVED (2026-09-27).** Final principal-engineer
  verification of the post-salah mode on `main2` (uncommitted tree). Gates,
  each run once: `tsc --noEmit` clean; **319/319** tests pass (32 files);
  `lint:layers` clean; production build succeeds, largest chunk **90,088 B
  gz** against the 200KB/chunk budget (adhan included).
  - **Privacy/brand held at zero tolerance.** `src/` greps find no
    fetch/XHR/axios/WebSocket/beacon anywhere; geolocation exists only in
    `PrayerTimeSettingsContainer.tsx:113-132` (one-shot, user-initiated,
    denial leaves city/coords usable, no re-prompt state) plus a feature
    check in `LocationSetupForm.tsx:55-56`; location persists solely in the
    settings KV and no clock time is ever rendered (no "next prayer in…"
    surface — AC1.2.4/§8 integrity).
  - **Core math verified against §4.4.** Karachi/Shafi defaults
    (`prayerTimes.ts:83-116`), device-local-day basis (`localNoon`,
    :118-121), two-day Isha gather (:157-173), absolute-instant windows,
    polar/NaN failure → null (:127-150, :195-205), and done-attribution
    strictly window-scoped and never persisted (`windowCounts`/`occurrenceDone`,
    :210-256). The spike's NOAA/Spencer cross-check is genuinely independent
    (in-file formulas, no adhan reuse; ±5 min tolerance stated) and the DST/
    traveler/bounds/polar vectors are all pinned in
    `tests/core/utils/prayerTimes.test.ts`.
  - **§16 composition exact.** `PostSalahCardContainer` self-collapses
    (no location / toggle off / uncomputable / outside window — AC1.1.1,
    1.1.5, 1.2.4) and drives hero suppression via `onActiveChange`; the five
    presentational components are props-in/callbacks-out; `Counter.tsx` is
    route state + chrome only; `CounterFlowContainer` owns the 4th source
    with derived position (Undo steps back with no sync guard — OQ-3);
    `CounterSession`'s diff is prior remediation + the one `flowMode` prop.
  - **i18n at parity.** 459 = 459 keys across locales (machine-diffed); bn
    prayer names correct (ফজর/যোহর/আসর/মাগরিব/এশা); gentle situational tone
    in both languages. CHANGELOG entry present and honest; §17 as-built note
    present; no console.log/debugger/TODO in new code; tree scope matches
    the declared wave.
  - **Non-blocking notes for the owner:** (1)
    `PostSalahCardContainer.tsx:69` guards `!window` — the DOM global (the
    hook result is renamed `win` on :46); dead but harmless since `active`
    fully covers it, worth a cleanup; (2) the derived flows never render the
    saved-state "Next item" button (`onContinueNext` is intentionally
    undefined — advancement is fully automatic), so the `counter.nextItem`
    key is currently unreachable copy; (3) `postSalahCard.test.tsx:138`'s
    "renders nothing outside any window" case actually asserts the in-window
    render (misleading name; out-of-window is covered by the pure-util
    vectors).

- **As-built (owner wave: ritual presets + schedule + the Home "current
  ritual" card, 2026-09-27).** Extends R2 (no design-section conflict; this
  note is the record):
  - **Four presets, seeded on boot.** `ROUTINE_PRESETS` (routineUtils)
    holds the Hisn-ul-Muslim orders: morning/evening keep the six-item
    cluster; NEW night (أذكار النوم — Ayat al-Kursi ×1, Ikhlas/Falaq/Nas ×3,
    Bismika-allahumma ×1, Tasbih Fatimah 33/33/34 reusing existing rows,
    Allahumma-aslamtu ×1) and friday (Kahf recitation ×1, Salawat ×100,
    istighfar ×100). New catalog entries carry complete, fully-vocalized
    Uthmani/Tanzil-style texts + bn/en copy (`zikrCatalog.ts`).
    `routineService.ensurePresets()` runs at boot AFTER `seedZikrs`, is
    memoized like the zikr seeder, and is idempotent: a preset is created
    only when NO row (live or soft-deleted) carries its presetKey — a
    soft-deleted preset is a permanent dismissal. A preset whose zikrs
    cannot resolve is skipped quietly; boot never blocks, and the
    user-draft routine cap does not apply to app furniture.
  - **Schedule metadata.** `Routine.schedule {part, weekday?}` (non-indexed
    — no schema bump; v7 stays as shipped). Civil windows live in
    `routineUtils.ROUTINE_WINDOWS` (minutes since local midnight, generous
    by design): morning 03:30–11:29, evening 15:00–19:59, night
    20:00–03:29 (midnight wrap), friday weekday 5 all day; the 11:30–14:59
    midday gap is unclaimed on purpose. Customs carry no schedule (any
    time). `routineNowState(routines, sessions, zikrs, now)` returns the
    ordered now-list: current-undone, current-done (kept visible for
    reinforcement), then upcoming by window start with a machine-readable
    `nextPart` the UI translates ("সন্ধ্যায়" / "Tonight" / …).
  - **Home slot.** `RitualNowContainer` (containers/routines/) derives the
    state off the stores + `useNow`; `RitualNowCard`
    (components/routines/) is presentational (title, chip/label,
    "3/9", doneToday, isNext, onStart). Mounted immediately after the
    streak/today-count section. R1 hand-off: while the post-salah card is
    active the card shows the first NEXT entry instead (page-level
    `postSalahActive` flag). §16.1 chrome bridge: `onPresentChange`
    suppresses the quiet preset offer (`hideQuietOffer` prop on
    `RoutinesSectionContainer`). Start reuses the existing
    `/counter?routineId=&zikrId=` deep link. i18n keys `routine.preset.*`
    (night, friday) and `routine.now.*` added to BOTH locales at parity.
  - **Tests:** window boundaries + wrap (03:29/03:30, 11:29/11:30,
    14:59/15:00, 19:59/20:00, past-midnight night, Friday weekday),
    now/done/next ordering, seeding idempotence (double boot, dismissed
    preset, unresolved skip), catalog completeness/vocalization, and a
    Home-page test (Date-only fake) covering the card render, the Start
    deep link, and the R1 hand-off.
