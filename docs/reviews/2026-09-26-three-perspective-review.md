# Three-Perspective Panel Review — 2026-09-26

Three independent reviewers examined the project (branch `main2`, clean tree), each in three
rounds (orientation → deep dive → synthesis): a **principal software engineer**, a **product
owner**, and an **end user**. Reviews were read-only; the engineer additionally ran
`npm run test` (194/194 pass), `npm run lint` (layers + migrations pass, ESLint leg fails —
no ESLint config exists), and empirically reproduced the backup-corruption bug in an
in-memory Dexie harness.

---

## Executive summary

The panel agrees the foundation is strong: rigorous sync correctness (idempotent outbox,
three contract-drift guards), a real upgrade-path migration test, an authentic tasbeeh-like
counter, a respectful and correctly calibrated zikr library, honest privacy copy, and a
$0/offline architecture that actually held. bn/en locale files have full key parity (373/373).

Three clusters of P1 issues need attention first:

1. **Data can be silently damaged.** JSON backup restore corrupts every `Date` field (Home,
   Progress, weekly chart, and streak recalculation crash after an import); a counter
   mis-tap can auto-save a phantom round with no way to decrement; there is no sync and
   backup is buried, so a wiped browser loses everything including streaks.
2. **Ship-broken prevention is weak.** Two server-backed features shipped broken to 100% of
   users (Groups in 1.3.0, Library sync in 1.4.0); the ESLint leg of `npm run lint` cannot
   run (no config) and CI never runs it; there is effectively no telemetry to catch regressions.
3. **The words lag the product.** Stale docs still promise reminders (v1-core, never shipped);
   UI copy mixes Room/Group/"Shared Goal" and points to a nonexistent "Goals section";
   README.md is loop-workspace scaffolding; AGENTS.md instructs a dead `streakService` API.

### Merged priority list (cross-panel)

| # | Action | Raised by |
|---|--------|-----------|
| 1 | Fix backup import: rehydrate `Date` fields, add a JSON round-trip test | Engineer (P1) |
| 2 | Make the counter forgiving: −1/long-press decrement, Undo toast on auto-save, confirm before Reset | End user (P1) |
| 3 | Bangla first-class in Library search (`nameBn` + `arabicText`) and the `/join/:code` placeholder | End user (P1/P2) |
| 4 | Restore the lint gate: commit an ESLint config, run `npm run lint` in CI; add a post-deploy prod smoke check | Engineer + Product (P2/P1) |
| 5 | Instrument the core funnel with the existing idle `analytics_events`/`track_event` table | Product (P1) |
| 6 | Decide reminders: ship the minimal in-app notification center or cut it from the docs | Product (P1) |
| 7 | Copy sweep: purge "room", fix "Goals section" → Plans, reword the Quick Start heading | End user (P2) |
| 8 | Then ship cross-device sync per `docs/CrossDeviceSync-Design.md` (the panel's biggest structural win) | Product (top rec) |

---

## 1. Principal Software Engineer

### Round log

- **Round 1:** Read AGENTS.md, DEPLOYMENT, walked `src/core` (db, services, stores, utils), `supabase/migrations`, tests; skimmed db.ts schema v1→v6, session/plan/streak services, both sync services, stores, PWA config. Formed hypotheses around date normalization, streak semantics, drift guards, backup integrity, ESLint.
- **Round 2:** Verified each hypothesis with file:line evidence; read the full SQL migrations (RLS, `contribute`, cursor pagination), drift-guard scripts/tests; ran `npm test` (194/194 pass), `npm run lint` (layers+migrations pass, **ESLint leg fails**); empirically reproduced the backup Date-corruption in an in-memory Dexie harness.
- **Round 3:** Dropped refuted hypotheses (one-time plan end-date exclusion — forms correctly write `T23:59:59.999`; PWA deep-link fallback gap — deploy workflow builds 404.html); severity-ranked survivors.

### Strengths

- **Sync correctness is genuinely rigorous:** local-first outbox with server-side `event_id` primary-key dedupe (`0001_init.sql` `plan_contributions`), single-flight flush, permanent-vs-retryable error taxonomy with backoff and a 20-attempt cap; tests cover "delivers the SAME event id on retry" and permanent rejection.
- **Three independent contract-drift guards:** `scripts/check-migrations.mjs` (byte-parity of shared function bodies across 0001/0002), compile-time `SURFACE_IN_SYNC`/`PARAMS_IN_SYNC` in `supabaseTypes.ts`, and `supabaseRpcSurface.test.ts` against generated DB types. This closes the exact PGRST202 class of bug that shipped once.
- **The v6 migration test is a real upgrade-path test:** `tests/core/db/migrationV6.test.ts` rebuilds the actual v5 database and reopens it with the live schema, verifying goal→plan split, room slimming, and submission/outbox backfill.
- **Backend isolation + security posture:** supabase-js dynamically imported (off the initial bundle); `zikr_app` tables API-invisible under RLS; public-schema SECURITY INVOKER RPCs; only the anon key and public Turnstile site key in the bundle; telemetry never carries contribution amounts.
- **Time/timezone plumbing done properly:** SQL `date_trunc` in the plan's tz mirrors the client's two-pass DST-corrected `currentPeriodStart`; PWA update flow (prompt + skipWaiting rescue + hourly update check + navigateFallback + 404.html→sessionStorage→replaceState) is carefully reasoned.

### Findings

1. **P1 — Backup restore silently corrupts every Date field.** `exportService.ts:100` JSON-serializes rows containing `Date`s; `importData` (`:183-191`) `bulkAdd`s the parsed strings with no rehydration. Verified empirically: `date`/`timestamp` land in IndexedDB as strings, so `formatDate`'s `.getFullYear()` (`dateUtils.ts:1`) throws — Home/Progress totals, the weekly chart (`metrics.ts:17,102`) and streak recalculation (`streakService.ts:95`) all crash after a Settings→Import restore. There is no exportService test. Fix: rehydrate Dates per table on import (or store epoch-ms end-to-end) and add a JSON round-trip test.
2. **P2 — `npm run lint`'s ESLint leg cannot run: the repo has no ESLint config.** `package.json:10` runs `eslint src`; ESLint 8.57.1 exits "couldn't find a configuration file" (verified). `deploy.yml` runs only build+test, so ESLint never executes anywhere, while AGENTS.md advertises `npm run lint` as the quality gate. Fix: add a config matching the pinned devDeps (or drop the leg) and wire `npm run lint` into CI.
3. **P2 — Unbounded sessions growth behind whole-table liveQuery subscriptions.** `sessionStore.ts:89` and `sessionHistoryStore.ts:40` subscribe `db.sessions.toArray()`; every counter round saves a session (`countRecorder.ts:45`) and there is no retention/pruning anywhere. Each save re-reads and re-emits the entire table; metrics recompute over all rows. On a multi-year device this degrades startup and every save of the core interaction. Fix: bound the subscription window (e.g., `where('date').above(cutoff)`) and derive long-range aggregates.
4. **P3 — The per-zikr `streaks` table is write-only, and its semantics contradict the displayed streak.** `updateStreak` runs on every session add (`sessionService.ts:14`), but `getStreak`/`getAllStreaks`/`updateForSession` have zero callers — the UI's streak is pure `overallStreak.ts`. The two disagree on the return-after-gap day: `updateStreak` resets to 0 (encoded in `streakLogic.test.ts:62-66`) while `overallStreak` counts it as 1; the delete path (`sessionService.ts:90`) same-day-folds instead of rebuilding. AGENTS.md still instructs using `streakService.updateForSession()`. Fix: delete the writes or align semantics, and update AGENTS.md.
5. **P3 — `updateSession` persists `date = sessionUpdate.timestamp` but recomputes effects from a stale snapshot; plans on the old zikr are never recalculated.** `sessionService.ts:60-69`: the DB row gets the new date, but `updatedSession`'s spread keeps `existing.date` (stale streak fold), and `recalculatePlansForSession` receives only the new `zikrId`, so plans covering the old zikr could stay `completed` if a zikr move is ever edited (today's UI edits count only — latent). Fix: re-read the row post-update and recalc both zikr ids; normalize `date` to midnight per the documented convention.
6. **P3 — `getSessionsByDate`/`getSessionsByDateRange` can never match.** `sessionService.ts:33-42` queries a `'YYYY-MM-DD'` string against the `date` index, which stores epoch-ms Date keys (`countRecorder.ts:39` stores full timestamps); string vs numeric IndexedDB keys never compare equal. Uncalled today — a latent trap. Fix: delete, or query `between(midnight, endOfDay)`.
7. **P3 — Backup omits identity and group membership.** `exportService.ts:86-97` exports zikrs/sessions/plans/owners/streaks/settings only. After restoring to a new device, the next `ensureIdentity` mints a fresh anonymous uid; the user must manually re-join each group and the server records a duplicate member under the same display name. Fix: at minimum, document this in the backup UI; consider including the identity `userId` (it is an opaque uid, not a credential).

### Top 3 recommendations

1. **Fix backup import now (Finding 1):** rehydrate Dates in `importData` and add an export→import round-trip test to the suite — this is the only found path where a first-party feature destroys the integrity of every session record.
2. **Restore the lint gate (Finding 2):** commit an ESLint config and run `npm run lint` in `deploy.yml` before build — the layered-architecture rules the project depends on are currently enforced only by the two custom checkers, with ESLint dead.
3. **Cap session-table growth before it becomes the app's defining performance complaint (Finding 3):** window the liveQuery subscriptions and move lifetime aggregates into maintained counters, keeping the offline-first write path unchanged.

---

## 2. Product Owner

### Round log

- **Round 1 (Orientation):** Read `docs/Idea.md`, `docs/Tasks.md`, `CHANGELOG.md`, `docs/CrossDeviceSync-Design.md`, `docs/DEPLOYMENT.md`, `supabase/README.md`, README/package.json, and `git log --oneline -50`. Built the intended-vs-shipped map: v1 promised custom zikrs, manual entry, goals, streaks, reminders; shipped 1.0→1.4 covers all but reminders, plus an unplanned-for-in-docs social layer (Groups, Plans, Library sync).
- **Round 2 (Deep dive):** Verified the shipped surface — `src/ui/pages/*`, `Welcome.tsx`, `zikrCatalog.ts`, i18n key parity (373/373 en↔bn), Progress entry modes, Settings export, routes; grepped for telemetry/notifications; read `0001_init.sql` (analytics_events, purge), `zikrSync` admin flow, and Supabase ops docs. Confirmed every hypothesis below with file:line or CHANGELOG evidence.
- **Round 3 (Synthesis):** Severity-ranked 10 durable product risks, discarded style/nitpicks outside my lane, and finalized the 3-item roadmap.

### Strengths

- **Differentiators #1 and #2 are genuinely deep, not skin-deep.** Custom zikrs (duplicate rejection, soft delete, Arabic/bn/en catalog in `src/core/data/zikrCatalog.ts`) and manual entry (single + bulk modes, smart last-count defaults, 3-day edit window — Epic 6 fully delivered, `src/ui/pages/Progress.tsx:47`, `src/ui/components/BulkEntryForm.tsx`) beat the "app-only taps" competitors named in Idea.md.
- **The core loop now hangs together.** Plan targets carry into the counter, auto-save on target, surplus keeps counting, "continue next zikr" chains multi-zikr plans, and Home "Your Goals" rows write back to group plans (CHANGELOG 1.3.0/1.4.0). Pick → count → streak/plan progress is one coherent story.
- **Trustworthy release notes and honest UX.** The CHANGELOG admits failures plainly ("Groups failed ... for everyone", 1.3.0); the app says "haptics aren't supported on iPhones" and "server did not recognize this request" instead of lying. Rare and valuable for a spiritual-habit product.
- **The $0/offline constraint actually held.** Local-first Dexie, offline-cached fonts, Supabase only for social; bn/en at full parity (373 keys each) with correct Arabic presentation (`lang="ar" dir="rtl"`, catalog carries bn meanings).
- **Cross-device sync design is unusually good** (`docs/CrossDeviceSync-Design.md`): loginless sync key + E2E encryption + LWW preserves both the privacy stance and $0 — it's a real plan, not a wish.

### Findings

1. **P1 — Server-backed features shipped broken to 100% of users, twice.** CHANGELOG 1.3.0: production DB was still on the v1 schema, so "Groups failed with 'Something went wrong' for everyone"; 1.4.0: `pull_verified_zikrs` "could never succeed" — the Library sync button shipped 2026-09-13 and could not work until 2026-09-25. The `room`/`group` wire-key bug (1.3.0/1.4.0) let RPCs succeed then throw client-side. For a trust-dependent habit app, users' first contact with two flagship features was an error screen. The local migration harness (1.4.0) fixes authoring; add a post-deploy production smoke check before a release is considered done.
2. **P1 — Reminders — a v1-core promise — never shipped, and the docs still promise them.** Idea.md:32 lists reminders as v1 core with an "in-app notification center" as the iOS mitigation; Tasks.md Story 4.2.5 plans it. Reality: `src/ui/pages/Plans.tsx:154` — "there is no reminder-time feature yet" — and no notification center exists anywhere in `src/ui`. 1.1.0 even renamed the Goals tab because its copy "promised reminders that don't exist." Casual practitioners (a named target segment) have zero pull-back mechanism; retention rests entirely on self-discipline and streaks. Ship a minimal in-app version or cut it from the docs.
3. **P1 — No actionable telemetry: the owner is flying blind on activation/retention.** The server already has an anonymous `analytics_events` table and `track_event` RPC (`supabase/migrations/0001_init.sql:72, 840-860`), but the only client event is `room_opened` (`src/core/stores/sharedRoomStore.ts:187`), and rows are insert-only — "nobody can read them back." No funnel (welcome→first session→day-7), no streak/retention metrics. Every prioritization call (reminders, sync, groups) is currently guesswork, despite a $0-compatible instrument sitting idle.
4. **P2 — Data-loss exposure until sync ships; backup is buried.** Without accounts or sync, reinstall/cleared-browser-data wipes everything, including months-long streaks. The only backup is JSON export in Settings (`src/ui/pages/Settings.tsx:338`), never surfaced contextually. The sync design doc's own goal ("a lost or wiped device loses nothing") is unshipped. Interim: nudge export at streak milestones.
5. **P2 — Groups: real value, disproportionate complexity, undefined audience.** Persistent groups, per-zikr plans, recurring timezone resets, legacy combined plans still rendered (AGENTS.md; 1.2.0) — this consumed most of September's engineering and three repair releases (1.2.x captcha, 1.3.0 schema, 1.4.0 contract), while reminders and sync sat unshipped. No doc names the target scenario (family? mosque? friends?), and member-anonymous contributions remove the visibility that makes group dhikr challenges motivating. Define one concrete scenario, consider opt-in per-member progress, freeze new group scope until sync lands.
6. **P2 — Shared-library curation is a manual SQL bottleneck with no feedback loop.** Verification is "manual: review `zikr_app.shared_zikrs` ... in the Table Editor" (`supabase/README.md`); the mock's `verifyAll()` "simulates the admin review" — there is no admin UI, role, or notification, and submitters get no "pending" status in the app. Fine at 5 submissions; a silent queue that purges at 180 days is not a curation pipeline.
7. **P2 — The repo's front door is broken.** `README.md` is now loop-workspace scaffolding ("# loop workspace") — the product's positioning vanished from the one page every visitor sees. Idea.md's feature checkboxes are all unchecked despite shipping; Tasks.md (dated 2026-06-15) contains no Groups/Plans/Library epics and marks Epic 6 "Pending" directly above its own "Key Features Delivered" checklist. Docs actively mislead new contributors and users.
8. **P3 — Supabase free-tier pause is an unmitigated single point of failure for Groups.** Free projects pause after ~1 week idle; the docs offer only an *optional* external keep-alive job or pg_cron (`supabase/README.md:20-22`). If pings stop, every group silently dies with server errors (core offline features survive). A free GitHub Action keep-alive plus a "server unreachable (vs not set up)" distinction in the Group tab closes this cheaply.
9. **P3 — The viral loop has no share preview.** Group invites (`/join/CODE`) are the growth engine, yet `index.html` has a description meta but no Open Graph/Twitter tags — shared links render bare in WhatsApp, the primary channel for a Bengali-first audience. Custom domain `zikr.shafi.me` (public/CNAME) is good; add og:title/image for invite routes.
10. **P3 — Release hygiene: no git tags.** Versions live only in package.json/CHANGELOG (`git tag` is empty); 1.0.0 (June) → 3.5-month gap → 1.1–1.4 in 11 days. Tag releases so Pages deploys ↔ versions stay auditable.

### Top 3 recommendations

1. **Ship cross-device sync per `docs/CrossDeviceSync-Design.md` (M1→M3).** It's fully designed, reuses the proven RPC pipeline from 1.4.0, resolves the largest real user pain (device-loss wipes streaks), and strengthens rather than trades away the $0/privacy story.
2. **Instrument the core funnel with the existing `track_event` table** (welcome_complete, first_session, session_saved, day-7 streak) plus a read query. Costs $0, uses shipped infrastructure, and gives every future roadmap call (reminders, groups investment, manual-entry placement) evidence instead of instinct.
3. **Ship the smallest real re-engagement loop: in-app reminder planning + notification center** (Web Push on Android later). It is the only v1-core promise still unshipped, targets the casual-practitioner segment explicitly named in Idea.md, and retention — not features — is this product's actual battleground.

---

## 3. End User

### Round log

- **Round 1 (Orientation):** Read AGENTS.md/CHANGELOG, then walked Welcome → Home → Counter → Plans → Progress → Library → Group/Join → Settings as a first-timer. Noted hesitations at the counter's mis-tap/reset story, the Library search in Bangla, the Group/"room" wording mix, and the stale "Goals section" hint.
- **Round 2 (Deep dive):** Verified every hesitation against component code and strings: CounterSession/CounterCircle, countRecorder, sessionStore, both locale files (full parity — typed by `Dictionary`), zikrCatalog, seed.ts, AppLayout/BottomNav, Room sync states, dark-mode tokens (grep for raw colors — clean). Collected file:line evidence for each finding below.
- **Round 3 (Synthesis):** Ranked by quit/distrust risk; dropped nitpicks (dead haptic ternary, transient first-seed flash, ErrorBoundary's off-system slate colors) that don't survive scrutiny.

### Strengths

- **The counter finally behaves like a tasbeeh.** Counting doesn't stop at the target — the board keeps going and each target's worth auto-saves itself (`src/ui/components/counter/CounterSession.tsx:159-185`); unfinished rounds resume durably per zikr (`src/core/services/countRecorder.ts:71-92`), surviving app kills. This is exactly how I actually use mine.
- **The predefined library is respectful and correctly calibrated**: 33/33/34 after prayer, 3x for the morning-du'as, 1x Sayyidul Istighfar, fully vocalized Quranic-orthography Arabic, always `lang="ar" dir="rtl"` (Home.tsx:192, CounterSession.tsx:241). I'd trust it.
- **Privacy copy is honest and repeated at the right moments** — "Your name is all other members will ever see" at join, on the Room page, and in Settings; per-submission sync badges (`cloud_upload`/`cloud_done`, Room.tsx:925) show me what's still queuing offline.
- **Streak logic has a grace rule** — the streak doesn't break just because I haven't opened the app yet today (`src/core/utils/overallStreak.ts:16-18`), and backdated manual entries no longer zero it (v1.3.0).
- **Haptics honesty on iPhone**: the counter tells me vibration isn't supported instead of leaving a dead toggle (`CounterSession.tsx:272-276`). Dark mode is fully tokenized — nothing looked broken in my token sweep.

### Findings

1. **P1 — A mis-tap can silently save a phantom round, and nothing can decrement it.** The counter only increments (`CounterSession.tsx:129-134`); there is no −1 anywhere. Worse, a stray tap at 99/100 triggers the auto-save (`saveAmount >= target`, line 159-165), persisting 100 counts I never did — and propagating them to every group counting that zikr (`src/core/services/countRecorder.ts:49-55`). Undoing means discovering Progress → "Show" → Practice History → edit, within 3 days (hidden behind a collapsed section, `Progress.tsx:278`). Fix: long-press-to-decrement or an "Undo" toast on auto-save.
2. **P1 — "Reset" wipes the whole unsaved round on one tap, with no confirmation on mobile.** The button is wired straight to `handleReset` (`CounterSession.tsx:260-268`); the confirm exists only on the desktop Escape path (line 221), which also still uses native `confirm()` — the exact thing v1.2.0 claimed was eliminated. Mid-dhikr, one stray tap below the circle erases 87 taps. Fix: route the tap through the in-app ConfirmDialog.
3. **P1 — A Bangla speaker cannot search the Library in Bangla.** Search matches only `zikr.name` (`src/ui/pages/Library.tsx:48-52`) — the Latin transliteration. Typing "সুবহানাল্লাহ" or the Arabic yields "No zikrs found" despite `nameBn` being right there on the record. The list rows also show only the English name in bn mode (line 171). Fix: match `name` + `nameBn` + `arabicText`.
4. **P2 — One concept, three names: Group / Room / "Shared Goal".** In one flow I read the tab "Groups", the modal title "New Shared Goal" (`locales.en.ts:182`), the submit "Create Room" (:198), then "Close Room"/"Leave Room" (:158-160) inside a page titled Group. Bangla does the same split: 'নতুন গ্রুপ' (`locales.bn.ts:181`) vs 'রুম তৈরি করুন' (:197). The server renamed rooms→groups; the UI copy never caught up. Fix: purge "room" from user-facing strings.
5. **P2 — Stale "Goals section" hint misdirects new users.** The zikr form says "You can set … goals for this zikr in the Goals section" (`locales.en.ts:299-300`) — but that section is now called Plans and `/goals` only redirects (`App.tsx:135`). I went looking for a Goals tab that doesn't exist.
6. **P2 — A Bangla invitee's first screen is partly English.** The deep-link join page hardcodes `placeholder="e.g., Ahmed"` (`src/ui/pages/Join.tsx:90`) while the translated key exists ('যেমন, আহমেদ') and the in-app modal uses it (`JoinRoomModal.tsx:107`). The changelog claimed this was fixed in Sept 2026 — it persists on the very page a shared link opens.
7. **P2 — The Home rail heading reads oddly in both languages.** "Remember for Some Moments" (`locales.en.ts:40`) is not natural English, and 'কিছু মুহূর্ত স্মরণ করুন' reads as an imperative sentence, not a section title. It's the first heading under "Your Goals" on the main screen. Fix: something like "Quick Dhikr" / 'দৈনন্দিন জিকির'.
8. **P3 — "Read together" survived the copy review.** `settings.sharedGoalsDesc`: "Shared goal rooms let you read together" (`locales.en.ts:239`; bn 'একসাথে পড়া যায়', `locales.bn.ts:238`) — v1.1.0 replaced "read" with "do dhikr" elsewhere; this one lingers, and dhikr isn't "read".
9. **P3 — First-run empty state invites me to create a zikr that's about to appear.** Seeding is async after first paint (`App.tsx:44-46`; empty state `Home.tsx:154-181`), so a slow device can show "Create your first zikr" moments before 17 predefined zikrs arrive — and the CTA never mentions the library that's coming.
10. **P3 — A handful of untranslated strings.** "Loading…" at first paint (`App.tsx:114`), aria labels 'Toggle haptic feedback' (`Counter.tsx:214`), "Tap to count…" (`CounterCircle.tsx:144`), 'Clear search' (`Library.tsx:131`), and the developer-speak error "Shared goals are not configured on this device" (`locales.en.ts:411`).

### Top 3 recommendations

1. **Make the counter forgiving.** Add a decrement (long-press or −1 chip) and an "Undo" affordance after each auto-save, and confirm before Reset. This is the tap loop the whole product lives on; right now one mis-tap either poisons my history and my group's total or costs me the whole round.
2. **Let Bangla be first-class in the Library.** Search and list by `nameBn`/`arabicText`, and translate the `/join/:code` placeholder — the two screens where a Bengali user forms their first impression of whether this app was built for them.
3. **One vocabulary sweep.** Rename every user-facing "room"/"Shared Goal" to Group, fix the "Goals section" hint to say Plans, and reword the Quick Start heading — an afternoon of string edits that removes the three most visible "was this translated?" moments.
