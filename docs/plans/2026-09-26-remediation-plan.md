# Remediation Plan — Panel Review 2026-09-26

**Status:** FINAL v3 — two review rounds. Round 1: all three personas returned
**ADOPT WITH AMENDMENTS**; amendments integrated (see table below). Round 2 (verification):
product owner **APPROVED**; engineer and end user each requested one final amendment
(5.1 import/aggregate coupling; 4.1 privacy-copy disclosure) — both integrated here.
**Owner amendments applied 2026-09-26** (see next section) — these override persona
recommendations where they differ. The plan is implementation-ready.

### Owner amendments (2026-09-26, post-verification — final authority)

1. **Counter forgiveness is a power-user feature (gates 1.2).** Long-press decrement and
   auto-save Undo are gated behind a Settings toggle, default **off**; the default
   experience stays dead simple for general users. Reset confirmation stays universal
   (it is accident protection, not a power affordance).
2. **2.4 keep-alive removed.** Supabase already has a keep-alive mechanism in place
   (owner-confirmed); no new GitHub Action.
3. **4.1 telemetry slimmed to milestone-only events.** Per-round/per-contribution events
   are dropped (volume + storage on the free tier); the set must stay concise against the
   existing 90-day purge, or be dropped entirely if that bound can't be confirmed.
**Source:** [docs/reviews/2026-09-26-three-perspective-review.md](../reviews/2026-09-26-three-perspective-review.md)
Finding references use `ENG-F#` (engineer), `PO-F#` (product owner), `USER-F#` (end user) as numbered in that document.

## Persona review round (v1 → v2)

| Persona | Verdict | Load-bearing amendments folded into v2 |
|---|---|---|
| Principal engineer | ADOPT WITH AMENDMENTS | 1.1 per-field rehydration allowlist + ordering; 1.2c `propagated` bit (recordCount currently swallows the propagation result); 2.2 deep-link assertion on body content (GitHub Pages serves 404 status); 2.4 no-auth RPC choice; 5.1 persisted lifetime anchor; 5.2 delete-path call; 5.5 schema caveats |
| Product owner | ADOPT WITH AMENDMENTS | 2.2 auto-trigger post-deploy + `pull_verified_zikrs` runtime probe; 2.4 daily cadence; 4.1 expanded events and lands **before** 4.2; 4.3 deep-link; single Dexie v7 per cycle; restored PO-F6 submitter status (4.4); 4.2 sized L |
| End user | ADOPT WITH AMENDMENTS | 1.2a one-time discoverability hint; 1.2c plain-language "can't be undone" copy for group rounds, non-blocking toast; 1.2b one-tap confirm; 3.5 seed-failure fallback; 5.1 history visibility guard; 1.3 extended to Progress/plan pickers |

### Verification round (v2 → v3)

| Persona | Verdict | Outcome |
|---|---|---|
| Principal engineer | CHANGES NEEDED (one item) | All citations verified against code. One hole found: `importData` replaces sessions in its own transaction bypassing `sessionService` (`exportService.ts:165-192`), so 5.1's `sessionTotals` row would silently desync after a restore — fixed below (5.1). Nit folded into 2.3: `docs/CrossDeviceSync-Design.md:59,149` still label D4 "Dexie v7"; renumber to v8. |
| Product owner | APPROVED | With two non-blocking notes folded in: realistic Wave 4/5 sizing (table below), and a concrete trigger criterion for 5.5. |
| End user | CHANGES NEEDED (one item) | All waves otherwise confirmed as tappable. One conflict: `session_saved` per round contradicts the app's own promise in `welcome.s4Desc` (`locales.en.ts:82`, "Everything stays on your device") — 4.1 now carries the matching privacy-copy update. Plus: 4.3's deep-link needs small scroll-to plumbing (Settings has no hash/query anchor today). |

## Principles

1. **Trust before features.** Data integrity and core-loop safety ship before anything new.
2. **Small, test-covered increments.** Every wave ends green: `npm run test`, `npm run lint:layers`, and (from Wave 2 on) a working `npm run lint`; `npm run build` + size-check at wave boundaries.
3. **Constraints hold.** $0/month, offline-first, ≤ 200KB gzipped; no new runtime dependencies.
4. **Scope freeze on Groups** (PO-F5): no new group features this cycle beyond the optional retraction RPC (5.5); effort goes to retention fundamentals instead.
5. **CHANGELOG** `Unreleased` updated with every user-facing change; release notes stay as honest as they are today.

---

## Wave 1 — Data integrity & counter safety (the P1s)

### 1.1 Backup import Date rehydration — fixes ENG-F1
- `exportService.importData` rehydrates `Date` fields via a **per-field allowlist** (not generically "dated settings values"): `zikrSyncCursor.updatedAt` is contractually a string (`zikrSync/contract.ts:42-45`) and is passed back to the RPC verbatim, so it must stay a string.
- Rehydration runs **after** the `legacyGoalsToPlans` conversion (`exportService.ts:147`), because converted plans inherit raw `startDate`/`endDate` strings.
- Add an export→import **round-trip test**: export real rows → import into a fresh `fake-indexeddb` DB → assert `Date` instances, equal values, cursor string untouched, and that session/streak recalculation and `metrics` run without throwing.
- Keep the on-disk format unchanged (no re-export required of existing backups).
- **Effort:** S

### 1.2 Counter: forgiving input — fixes USER-F1, USER-F2 · **gated per owner amendment**
- **Gating (owner decision).** The forgiveness affordances are power-user features behind a Settings toggle ("Advanced counter controls", **default off**, placed next to the haptics toggle, with a description of exactly what it adds). The default experience stays dead simple: tap to count → target → auto-save. The Welcome line and one-time hint appear **only when the toggle is on**.
- **1.2a In-round decrement (gated).** When enabled: long-press on the count circle decrements 1 with haptic feedback, floored at 0, plus a **one-time inline hint** ("Hold to take one back") the first time a count passes ~10. No visible −1 chip.
- **1.2b Reset confirmation — always on, NOT gated.** This is accident protection, not a power affordance: one tap erasing an unsaved round is a general-user hazard. The tap Reset route goes through the existing in-app `ConfirmDialog` on **all** platforms — two actions only ("Delete" / "Keep counting"); the desktop Escape path drops native `confirm()` and uses the same dialog. One extra tap on a rare destructive action keeps the UX easy.
- **1.2c Auto-save Undo (gated), honest and non-blocking.** When enabled: after a target auto-save, a ~6 s "Round saved — Undo" toast appears; **counting is never blocked while it shows**, and the window is not shortened. For rounds that propagated to a group, the toast says plainly: "This round was already shared with your group and can't be undone here" — it must **not** link to Progress editing, which cannot retract the server total.
  - Implementation prerequisite (engineer amendment): `countRecorder.recordCount` currently discards `propagateToRooms`' result (`countRecorder.ts:51`), so the UI cannot know whether a round propagated. `recordCount` must return a `propagated` bit; since propagation is async post-save, either await it before showing Undo or conservatively withhold Undo whenever `countsToGoals && zikrName` was true.
  - Local Undo for non-propagated rounds goes through the existing `deleteSession` store action (3-day window + in-transaction recalc make it safe).
  - A server retraction path remains 5.5 (default: deferred, documented limitation).
- **Residual risk, accepted (owner):** with the toggle off, a general user's mis-tap is not correctable in-session — the path stays Progress → Practice History → edit within 3 days. The reset confirm prevents the worst loss (whole round); the rest is the documented trade for a simple default UX.
- **Acceptance:** toggle-off UX is identical to today except the reset confirm; toggle-on enables decrement + hint + Undo with the withheld-Undo honesty path; component tests cover the decrement floor, reset confirm, Undo delete, the withheld-Undo path, and that gated UI renders nothing when the setting is off.
- **Effort:** M

### 1.3 Bangla/Arabic search + localized pickers — fixes USER-F3, USER-F6 (+ USER-F7 scope note)
- Library search matches `name` **and** `nameBn` **and** `arabicText` (names case/whitespace-insensitive, consistent with duplicate rejection). In `bn` mode, list rows prefer `nameBn` when present.
- Same bn-name preference in the **Progress manual-entry zikr `<select>`** (`Progress.tsx:215-219`) and the plan-form zikr pickers — otherwise manual entry stays English-only for bn users.
- `Join.tsx` uses the existing i18n placeholder key instead of the hardcoded `"e.g., Ahmed"`.
- **Acceptance:** searching "সুবহানাল্লাহ", "subhan", and the Arabic string all find SubhanAllah; the manual-entry select shows Bangla names in bn mode; the `/join/:code` page renders fully in the device language.
- **Effort:** S

---

## Wave 2 — Quality gates & release safety

### 2.1 ESLint config + CI wiring — fixes ENG-F2
- Add an ESLint config compatible with the pinned devDependency (`eslint` 8.57.1), fix surfaced violations, and run `npm run lint` in `deploy.yml` before build.
- **Acceptance:** `npm run lint` passes locally and in CI; removing the config fails CI.
- **Effort:** S–M (depends on violation count)

### 2.2 Post-deploy production smoke check — addresses PO-F1 (detection half)
- `scripts/smoke-prod.mjs`, **auto-triggered on deploy completion** (plus manual `workflow_dispatch`) — dispatch-only gets skipped under release pressure:
  - (a) deployed URL serves `index.html`;
  - (b) an unknown path (e.g. `/join/SMOKE`) serves the SPA — **assert on body content** (redirect script / `<div id="root">`), NOT on status: GitHub Pages' 404.html trick serves the SPA with HTTP **404**;
  - (c) `get_group_state` with a bogus code asserts the `group_not_found` protocol error — verified auth-free before the code lookup (`0001_init.sql:457-465`), no CAPTCHA in CI; proves PostgREST profile + function presence (the 1.3.0 class);
  - (d) a read-only `pull_verified_zikrs(cursor)` probe — catches **runtime errors inside a function body**, the exact 1.4.0 failure a presence check misses.
- A release is not "done" until it runs green; documented in `docs/DEPLOYMENT.md`.
- **Effort:** M

### 2.3 Docs truth sweep — fixes PO-F7, part of ENG-F4, PO-F10
- `README.md`: restore real product positioning (what Zikr is, key features, install/PWA links, dev quickstart) — the loop-workspace scaffolding goes.
- `AGENTS.md`: correct streak guidance — `overallStreak.ts` is canonical; remove the `streakService.updateForSession()` instruction; note the `streaks` table is legacy (see 5.2).
- `docs/Idea.md`: tick shipped feature boxes; `docs/Tasks.md`: add a "status as of 2026-09" header rather than rewriting history.
- `docs/DEPLOYMENT.md`: add the git-tag-per-release convention.
- `docs/CrossDeviceSync-Design.md`: renumber decision D4's migration — it is no longer "Dexie v7": the features wave's `routines` table took v7 as built (`docs/solution-design.md` review log), so D4 takes the next available number when sync starts.
- **Effort:** S

### 2.4 Supabase keep-alive — **REMOVED (owner amendment)**
- Supabase already has a keep-alive mechanism in place (owner-confirmed); the planned GitHub Action ping is not needed. PO-F8 is considered addressed by the existing mechanism; ops keeps its cadence/config in the current home (`supabase/README.md` documents the options).

---

## Wave 3 — Copy & i18n sweep

### 3.1 Room→Group vocabulary — fixes USER-F4, USER-F8
- All user-facing strings (en + bn): "Create/Close/Leave Room" → Group, "New Shared Goal" → "New Group", `sharedGoalsDesc` "read together" → dhikr wording. Client protocol constants (error codes like `room-not-found`) are **not** touched — they are wire protocol per AGENTS.md.
- **Acceptance:** `grep -i room src/core/i18n/` returns no user-facing copy; typed `Dictionary` keeps 373/373 parity.

### 3.2 Stale hints — fixes USER-F5, USER-F7
- "Goals section" hint → "Plans"; Quick Start rail heading → "Quick Dhikr" / 'দৈনন্দিন জিকির' (final wording by native check).

### 3.3 Translate stragglers — fixes USER-F10
- First-paint "Loading…", aria labels ("Toggle haptic feedback"), "Tap to count…", "Clear search", and the developer-speak "Shared goals are not configured on this device" error.

### 3.4 Static Open Graph tags — addresses PO-F9 (minimal form)
- `index.html` gets `og:title/description/image` with the og:image as an **absolute, committed URL**. Per-route dynamic OG for `/join/CODE` is **deferred** — crawlers don't execute SPA JS on GitHub Pages, so dynamic tags need a prerender/proxy decision that belongs with the sync-era infra work.

### 3.5 First-run empty state, with a failure path — fixes USER-F9
- Home shows a neutral loading state until seeding completes, then the populated state. **Seed failure must fall back to the empty state, never a perpetual spinner** (`seed.ts:29` resets `seedPromise` for retry — the loading gate must not wait on a rejected promise). The empty state's library mention is a **link**.

**Effort (wave):** ~1 day; pure strings + two render guards, low risk.

---

## Wave 4 — Instrumentation & retention *(ordered: 4.1 lands before 4.2)*

### 4.1 Funnel telemetry — **milestone-only, concise (owner amendment)** — addresses PO-F3
- **Owner decision:** telemetry must not be allowed to accumulate toward the Supabase free storage limit — keep it concise, or drop it. Concise wins if the volume math is bounded, so the event set shrinks to **low-frequency milestones only**:
  - **Keep:** `welcome_complete`, `first_session`, `streak_day_7`, `group_joined`, `reminder_set`, `reminder_opened` — each fires at most a handful of times per user, ever.
  - **Dropped:** `session_saved` (per-round — the high-volume, privacy-contentious ping) and `group_contribution` (per-contribution volume). These two carried most of the accumulation risk and the entire end-user privacy conflict.
- **Storage bound:** rows ≈ active users × ≤ 6 events, purged by the **existing 90-day purge** on `analytics_events` — KBs to low MBs against the free-tier DB, bounded forever by the purge. 2.2's ops checks verify the purge job is actually active. **If that bound can't be confirmed, 4.1 is dropped entirely** — per owner, an unbounded event stream never ships.
- **Accepted trade:** no per-session volume signal. Activation and retention milestones (`first_session`, `streak_day_7`) carry the decisions this plan defers (4.2 justification, Groups revisit); per-round granularity is not worth the storage or the trust cost.
- **Privacy copy still moves with it:** `welcome.s4Desc` (`locales.en.ts:82`) and the Settings privacy note are reworded to disclose the milestone-only anonymous events. With `session_saved` gone, the behavior delta from today's "everything stays on your device" promise is small — but the copy is still updated in the same change, never after.
- Read path stays $0: a documented owner-side SQL query for the funnel (run in the Supabase dashboard); no admin UI.
- **Effort:** S–M

### 4.2 Reminders: ship the minimal in-app loop — resolves PO-F2 (decision recorded)
- Local-only reminder planning: a preferred reminder time per plan/zikr, stored locally; an in-app notification center (bell on Home) listing due/overdue items today. No OS scheduling (iOS constraint), no push.
- Sized **L (4–6 days)** once the notification center's due/overdue grouping, empty states, and two-language copy at full 373-key parity are priced in.
- Docs updated to promise exactly what ships; Web Push (Android) explicitly deferred until 4.1 data justifies it.
- **Effort:** L

### 4.3 Backup nudge at milestones — the interim half of PO-F4
- After streak milestones (7/30/100), a one-time contextual toast: "X-day streak — back up your counts." It **deep-links straight into the Settings backup action**, not just a pointer — mobile friction is why backups don't happen. (Settings has no hash/query anchor plumbing today, so price the small scroll-to mechanism.) Real fix remains cross-device sync (deferred, below).
- **Effort:** S

### 4.4 Library submitter status — restores the PO-F6 minimum ask
- After a zikr push succeeds, the contributor's Library entry shows "Shared — awaiting review" (the outbox/pushed state already exists locally). Deferring the whole curation *pipeline* stays fine; sharing into a silent void does not — silent queues that purge at 180 days stop submissions.
- **Effort:** S

---

## Wave 5 — Engineering structural cleanup

### 5.1 Bound session-table reactivity — fixes ENG-F3
- `sessionStore` subscribes to a rolling window (e.g. 12 months) instead of `toArray()`.
- Lifetime totals move to a maintained aggregate row (`sessionTotals`, kept transactional with session writes, one-time backfill in a DB v7 upgrade) **plus a persisted pre-window anchor** (`totalsAsOf` offset row) — without it, "lifetime" silently becomes 12-month lifetime. The fallback (lazy totals + per-day cache) is accepted **only with** the same anchor row.
- **History visibility guard (end-user amendment):** the perf window is not a visibility bound. `sessionHistoryStore` history either paginates older entries on demand or shows "Showing the last 12 months — older entries are still on this device." History must never read as data loss.
- Metrics utils gain tests for the window boundary (a session exactly at the cutoff).
- **Import/aggregate coupling (engineer verification amendment):** `importData` replaces all sessions in its own transaction, bypassing `sessionService` (`exportService.ts:165-192`) — after a restore, `sessionTotals` would silently desync from the rows it summarizes. `importData` must recompute `sessionTotals` within its transaction (or trigger the backfill post-import), and the 1.1 round-trip test must assert aggregate-row equality post-restore.
- **Dexie v7 discipline (PO amendment; as-built update):** numbering is by ship order, sequential and additive only. **As built (2026-09-26):** the features wave shipped the `routines` table as **v7** (see `docs/solution-design.md` review log). When 5.1 lands it takes the **next available bump** for `sessionTotals` (+ the `totalsAsOf` anchor), and the sync design's decision D4 (syncId backfill + push queue, `docs/CrossDeviceSync-Design.md`) follows as the one after that — no back-to-back client migrations, each with its own upgrade test per the `migrationV6.test.ts` pattern. Each bump repeats all prior store definitions per the existing pattern (`db.ts:53-245`).
- **Effort:** M–L

### 5.2 Retire the write-only `streaks` writes — fixes ENG-F4
- Stop calling `updateStreak` on **both** the add path (`sessionService.ts:14`) **and** the delete path (`:90`) — removing only the add path leaves writes persisting via deletes. The table stays declared with historical rows intact (no destructive migration). `overallStreak.ts` remains the single source; AGENTS.md already corrected in 2.3.
- **Effort:** S

### 5.3 sessionService correctness — fixes ENG-F5, ENG-F6
- `updateSession`: re-read the row post-update and recalculate streak/plans for **both** old and new `zikrId` — these are the load-bearing fixes.
- Date normalization: do **not** normalize only in `updateSession` (that leaves the convention mixed — `countRecorder.ts:39` writes `date: now`); either normalize at every session write site or drop the clause (all readers use `formatDate`/`new Date()`, which tolerate both). Decide at implementation; default is drop.
- Delete `getSessionsByDate`/`getSessionsByDateRange` (verified uncallable as written; no callers).
- **Effort:** S–M, with service tests (DB-backed via `fake-indexeddb`).

### 5.4 Backup completeness documentation — fixes ENG-F7
- Settings backup copy states what a restore does **not** carry (anonymous identity, group memberships — rejoining is manual).
- Optional stretch: include the opaque `userId` in the export (it is not a credential) so a restored device can re-claim its identity; decide during implementation after confirming the server treats uid re-use safely.
- **Effort:** S

### 5.5 Group contribution retraction (optional, gated) — completes USER-F1 for group rounds
- Only if Wave 1 feedback demands it, with a concrete trigger: mis-tap-with-propagation observed at a meaningful rate in Wave 1 dogfooding (or later in 4.1 telemetry). Design caveats from the schema (engineer amendment): a retraction **cannot** reuse `contribute` (its `p_delta >= 1` guard, `0001_init.sql:684`) and needs its own RPC; the derived idempotency id must remain a valid `uuid` (typed `uuid` PK); and the retract row's `created_at` attributes it to the **current** period while the original sits in an old one — so the retract row must inherit the original's timestamp, or `periodTotal` sums (`:741-744`) can go negative after a period roll.
- Follows the full migration discipline: edit both migrations byte-identically → harness up/down → `npm run gen:db-types` → update `supabaseTypes.ts` → fix call sites. **Default is to defer** — server append-only is a documented, honest limitation until then.
- **Effort:** M

---

## Deferred (explicitly out of scope this cycle)

- **Cross-device sync implementation** per `docs/CrossDeviceSync-Design.md` — the next major initiative, started once Waves 1–4 ship (dated commitment, not a park). Its D4 backfill takes the next available bump after the features wave's v7 and 5.1's sessionTotals. (PO top recommendation; root fix for PO-F4.)
- **Library curation pipeline / admin UI** (PO-F6 beyond the 4.4 status floor) — revisit with telemetry.
- **Per-route dynamic OG for invite links** (PO-F9 full form) — needs prerender infra.
- **Session retention/pruning policy** — the 12-month window in 5.1 is the data bound; a delete policy is a product decision for later.
- **Groups: opt-in per-member progress, audience definition** (PO-F5) — parked under the Groups scope freeze; revisit with the milestone group event (`group_joined`) from 4.1.

## Sequencing & sizing

| Wave | Theme | Size | Ships in |
|------|-------|------|----------|
| 1 | Data integrity & counter safety | ~2–3 days | Next release |
| 2 | Quality gates & repo hygiene | ~1–2 days | Next release |
| 3 | Copy & i18n sweep | ~1 day | Next release |
| 4 | Instrumentation & retention (4.1 → 4.2 order) | ~6–8 days | Following release |
| 5 | Structural cleanup (v7 isolated here) | ~3–5 days | Following release(s) |

Sizes per the product owner's verification pass (Wave 4 was optimistic at 5–7 once 4.2's L is added to 4.1 and the two S items; Wave 5 understated an M–L 5.1 with the import coupling).

Waves 1→3 are independent enough to interleave; 5.1 (db v7) should not land in the same release as unrelated risky changes.

## Whole-plan acceptance

- Every P1 from the panel review demonstrably fixed with tests (backup round-trip, counter forgiveness incl. the withheld-Undo path, Bangla search, ship-broken detection incl. the in-body RPC probe).
- `npm run lint` green including the ESLint leg, enforced in CI; smoke check green on production after each deploy (auto-triggered).
- Copy sweep verified by grep; no user-facing "room" strings; typed dictionary parity intact.
- Honesty constraints hold: group-propagated rounds never offer a false undo; history windows never read as data loss; the Welcome/Settings privacy copy discloses the milestone-only anonymous telemetry that 4.1 actually sends; no per-round event ships.
- `npm run build` still under 200KB gzipped; `npm run test` fully green; CHANGELOG current.
