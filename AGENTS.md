# AGENTS.md

This file is the canonical source of guidance for AI coding agents (Claude Code, Codex, Cursor, ZCode, etc.) working in this repository. Tool-specific files (e.g. CLAUDE.md) are thin pointers to this document.

## Project Overview

**Zikr** is a Progressive Web App (PWA) for Islamic dhikr practice. Core differentiators: custom zikr lists, manual progress entry (for physical tasbeeh), personalized plans, and guided routines (including post-salah adhkar).

## Key Constraints

- **$0/month operational cost** - All core data local (IndexedDB); the optional Supabase backend stays on the free tier
- **Mobile-first design** - Thumb-zone interaction, haptic feedback, dark mode
- **Offline-first** - Service worker; core practice flows work fully offline (network only for the optional groups/library sync)
- **Bundle size limit**: 200KB gzipped (configured in bundlesize)

## Tech Stack

- **Frontend:** React + Vite + TypeScript
- **State:** Zustand + Dexie.js (IndexedDB)
- **UI:** Tailwind CSS
- **PWA:** vite-plugin-pwa
- **Backend (optional):** Supabase — groups + shared zikr library only (RPC calls; tables are API-invisible)
- **Prayer times:** adhan (computed on-device, offline)
- **Testing:** Vitest + happy-dom + fake-indexeddb

## Common Commands

```bash
# Development
npm install              # Install dependencies
npm run dev             # Start dev server (localhost:5173)
npm run build           # Production build (tsc + vite)
npm run preview         # Preview production build

# Testing
npm run test            # Run Vitest tests
npm run test:ui         # Vitest UI mode
npm run test:watch      # Watch mode

# Deployment
# GitHub Pages via Actions (push to main2) — see docs/DEPLOYMENT.md
```

```bash
# Linting & Quality
npm run lint             # Layer checker + migrations drift check + ESLint
npm run lint:layers      # Enforce ui → stores → services → db boundaries
npm run check:migrations # Supabase migration drift check (also part of lint)
npm run gen:db-types     # Regenerate Supabase DB types (local docker harness must be up)
npm run size-check       # Verify bundle size against 200KB limit
```

## Architecture

### Data Layer (Dexie.js + IndexedDB)

**Database:** `zikr-db` with versioned schema (currently v7 — v4 folded the legacy goal `zikrId` into `zikrIds`; v5 added zikr-library sync fields on Zikr (`remoteId`, `sharedAt`, `pulledAt`) and the `zikrShareOutbox` table; v6 introduced **Plans**: `goals` migrated into `plans` + a `planOwners` ownership join, and shared rooms were slimmed into persistent groups whose targets live on group-owned plan rows; v7 added the `routines` table — purely additive, no upgrade logic)

**Stores:** zikrs, sessions, plans, planOwners, streaks, settings, sessionFormState, zikrLastCount, sharedRooms, sharedSubmissions, syncOutbox, identity, zikrShareOutbox, routines (the `goals` table is legacy-emptied but stays declared for the historical v1→v2 upgrade)

**Type definitions:** `src/core/db/types.ts` - defines all interfaces

**Migrations:** versioned `.upgrade()` hooks in `src/core/db/db.ts` (+ `src/core/services/migrationService.ts` for the v1→v2 data move, run inside the upgrade transaction)

**Predefined library:** `src/core/data/zikrCatalog.ts` is the single source for the predefined zikr library (Arabic, en/bn names & meanings, default targets, Quick Start flag). The seeder writes these onto Zikr records and backfills older rows; `src/ui/utils/zikrMapping.ts` is a thin record-first display adapter. Custom zikrs carry user-entered `arabicText`/`translation` on the record. Duplicate (case/whitespace-insensitive) zikr names are rejected at creation.

**Pattern:** Database operations are wrapped in transactions for data integrity:
```typescript
await db.transaction('rw', db.sessions, db.streaks, db.plans, db.planOwners, async () => {
  // Multiple operations in single transaction
  await db.sessions.add(session);
  await updateStreak(session.zikrId, session.date);
});
```

### Service Layer

**Location:** `src/core/services/`

**Pattern:** Each domain has a service file with CRUD operations and business logic:

- `zikrService.ts` - Zikr CRUD with soft delete
- `sessionService.ts` - Session CRUD with auto-updating streaks/plans
- `streakService.ts` - Streak calculation/recalculation (re-derived from history; "never miss twice" grace rule)
- `planService.ts` - Personal plan CRUD (owner `('user','me')`), progress for combined AND per-zikr target modes, auto complete/reactivate on session changes
- `routineService.ts` - Routine CRUD (soft delete) for ordered zikr sequences with per-item counts
- `countRecorder.ts` - Durable per-zikr counter checkpoints (round auto-save + resume)
- `migrationService.ts` - v1→v2 data move (inside db.ts's upgrade transaction)
- `exportService.ts` - JSON backup/restore (lossless round trip; includes routines)
- `errorRecovery.ts` - Retryable subscriptions with exponential backoff
- `zikrSync/` - Shared zikr library sync (port/adapter pattern like sharedRoom): push custom zikrs on creation ("share with others"), pull admin-verified zikrs via the Library sync button. Push is creation-only; pulls are cursor-paginated (100/batch) with the cursor stored in settings (`zikrSyncCursor`); pending pushes retry via the `zikrShareOutbox` table.
- `sharedRoom/` - Groups & plans sync (port/adapter). A group is a PERSISTENT GROUP (code, title, owner, members — never auto-purged); targets live on `plans` rows owned via `planOwners ('group', groupCode)`. The owner can run several plans at once (creation is PER-ZIKR ONLY — each zikr gets its own target; one-time windows or recurring daily/weekly/monthly resetting in the plan's timezone). Legacy combined group plans still render and count, but creation no longer offers the mode. Contributions (`contribute(code, planId, zikrName, delta, eventId)`) are member-anonymous, idempotent increments; ended plans stay as group history.

**Server database agreement (Supabase):**
- **Terminology is GROUP everywhere** — tables (`groups`, `members`), helpers (`is_group_member`), and RPCs (`get_group_state`, `create_group`, `join_group`, `leave_group`, `close_group`). The v1 "room" naming is gone from the server surface; the client's internal `sharedRoom` naming (store/service/types, error codes like `room-not-found`) is a client-side protocol constant — don't mix the two layers up.
- **Tables live in schema `zikr_app` with RLS and are API-invisible.** **Callable RPCs live in schema `public` as SECURITY INVOKER** (grants + RLS authorize them; explicit `raise exception 'code'` strings are the app's error protocol).
- **"Exposed schemas" in the Supabase dashboard MUST be `public` ONLY.** With multiple schemas exposed, PostgREST serves the FIRST as the default profile — un-profiled `/rpc/*` calls would search the wrong schema and fail with PGRST202 even though the functions exist. (This exact misconfiguration broke Groups on production.)
- **Migration layout:** `0001_init.sql` = canonical schema, fresh installs run ONLY it (+ `0003_shared_zikrs.sql`). `0002_group_plans.sql` = the one-time v1→canonical upgrade for the production database (idempotent; renames rooms→groups, migrates legacy goal-rooms into plans, drops v1 leftovers). Shared function bodies in the two files are byte-identical — enforced by `npm run check:migrations` (also part of `npm run lint`). Edit one, mirror the other.
- **Client-side RPC contract:** `src/core/services/supabaseTypes.ts` is the single TypeScript mirror of the RPC surface — every function's SQL parameter names and json return shape (`SupabaseRpc`). Both Supabase adapters route all calls through it, so signature/payload drift between the migrations and the client fails `tsc` instead of shipping a runtime crash (this class of bug — client reading `room` where the server sends `group` — reached production once). Parameter names and the function set are additionally machine-guarded against `src/core/services/supabaseDatabase.generated.ts` — regenerate it with `npm run gen:db-types` (local docker harness must be up) whenever a migration changes a signature; return shapes stay hand-typed because the generator cannot see inside `returns json`. Workflow when changing a function: edit the migration → `down -v`/`up` the harness → `npm run gen:db-types` → update the types/guards → fix the call sites `tsc` flags. The port contracts (`sharedRoom/contract.ts`, `zikrSync/contract.ts`) alias its shapes under backend-agnostic names.

**Key pattern:** Services export both named functions and a service object:
```typescript
export async function add(...) { ... }
export const sessionService = { add, update, delete };
```

### State Layer (Zustand)

**Location:** `src/core/stores/`

**Pattern:** Zustand stores with Dexie `liveQuery()` for reactive updates:

```typescript
const unsubscribe = createRetryableSubscription(
  () => db.zikrs.toArray(),
  (zikrs) => set({ zikrs, loading: false }),
  (error) => set({ error, loading: false })
);
```

**Stores:**
- `zikrStore.ts` - Zikr list
- `sessionStore.ts` - Active session state
- `sessionHistoryStore.ts` - Session list (raw data; bucketing is a pure util)
- `planStore.ts` - Personal plan list (user-owned view of the plans/planOwners join)
- `routineStore.ts` - Routines list
- `settingsStore.ts` - App settings
- `sharedRoomStore.ts` - Groups: identity, joined groups, mirrored group plans

**Error recovery:** All liveQuery subscriptions use `createRetryableSubscription()` with configurable retry logic.

### Directory Structure

```
src/
├── core/           # Data + logic layer — NEVER imports from ui/
│   ├── data/       # Predefined zikr catalog + prayer city list (single sources)
│   ├── db/         # IndexedDB schema, migrations, seeding
│   ├── services/   # Domain services (+ sharedRoom/, zikrSync/ backend abstractions)
│   ├── stores/     # Zustand state
│   ├── i18n/       # Locales (en/bn) + useI18n hook
│   └── utils/      # Core utilities (date formatting, plan rules, prayer times, routines, grouping)
├── ui/             # Everything that renders (the Noor design system)
│   ├── components/ # navigation/, cards/, counter/, prayer/, routines/, decor/, forms/, progress/, modals
│   ├── containers/ # Feature containers (one per part of a page; the only UI that touches stores)
│   ├── layout/     # AppLayout — sole owner of the shell, top bar, bottom nav, bar-clearance spacing
│   ├── pages/      # Route pages (Home, Counter, Plans, Group, Room, Join, Progress, Library, Settings)
│   ├── hooks/      # useRipple, useHaptic, useNow, usePostSalahWindow, useShare
│   ├── types/      # Component prop types
│   └── utils/      # Display helpers (zikrMapping: record-first adapter over the catalog)
docs/design/        # Static HTML design mockups (reference only, not built)
```

**Placement rule:** new UI goes in `src/ui`, new logic goes in `src/core`.
`core` must never import from `ui`.

**Layer rule (enforced by `npm run lint:layers`):** `src/ui` talks ONLY to
stores (`core/stores`) and pure utils (`core/utils`, `ui/utils`) — never to
`core/db/db` or `core/services/*`. All writes go through store actions
(zikr/plan/session/settings/sharedRoom/routine stores own every mutation); services
keep the business logic and transactions, and stores stay thin. Derived
metrics (streak, totals, ring, weekly chart) come from `core/utils/metrics.ts`
+ `overallStreak.ts` via `useMemo` — never recompute them inline in pages,
and never `useEffect`+`setState` for derived values. Stores hold error CODES,
not localized strings; translation happens at render.

**Layout rule:** every page renders inside `AppLayout` (`src/ui/components/layout/`)
and only declares its chrome (`topBar`, `bottomNav`, `contentClassName`) — never
hand-roll the shell div, `<header>`, `BottomNav`, or bar-clearance padding.
Bar clearance is applied by AppLayout on a wrapper element; screen padding goes
in `contentClassName` (Tailwind `p*-N` on one element would override, not add).
Top-right actions come from `useNavActions()` (Library + Settings); `BottomNav`
derives its active tab from the URL — pages never pass `activeId`.

**Component hierarchy rule (strict, applies to all new/modified UI):** every
page composes as `page → containers → components`.
- **Page** — decides WHICH container shows and when (route/flow state); owns no
  data access and no presentational detail.
- **Container** — owns ONE part of the page and is the only place that touches
  data: subscribes to stores (`core/stores`, per the layer rule — never
  `core/db/db` or services directly), derives what it renders via `useMemo`
  utils, and passes data down + callbacks up.
- **Component** — presentational only: receives props, calls callbacks; no
  store subscriptions, no data fetching, no derived metrics.
When a page or a component accumulates a second responsibility, split it along
this line (extract a container, or push a component down). New containers live
in `src/ui/containers/<feature>/`; reusable presentational components stay in
`src/ui/components/`.

### UI: "Noor" Design System (src/ui/)

The only UI. Refined Islamic identity: deep emerald + gold on warm parchment (light) / deep green-black (dark).

- **Theme tokens:** CSS variables in `src/index.css` (`--color-*`), mapped in `tailwind.config.js` with `<alpha-value>`; the `.dark` class swaps every token, so semantic classes (`bg-surface`, `text-primary`) are dark-mode aware automatically
- **Typography:** Plus Jakarta Sans (headlines), Source Sans 3 (body), Amiri (`font-display-arabic`) for Arabic script — always pair Arabic text with `lang="ar" dir="rtl"`
- **Signature elements:** `PatternBackdrop` (khatam star pattern), `OrnamentDivider` (gold star divider), arch-topped cards (`rounded-t-full` mihrab niches), gold-on-green active nav pill
- **Buttons:** use `bg-primary-container text-on-primary` (works in both themes); `bg-primary` is a text-grade token in dark mode
- **Dark mode:** `darkMode: 'class'`; `App.tsx` syncs the `.dark` class from the settings store + system preference

## Development Notes

- **Routing:** `BrowserRouter` (clean paths, e.g. `/join/CODE` invite links). The host MUST serve `index.html` for unknown paths — `public/_redirects` (Netlify/Cloudflare Pages) and `vercel.json` (Vercel) are included; for nginx use `try_files $uri /index.html;`, for GitHub Pages use the 404.html trick.
- **Date handling:** Always use `dateUtils.ts` helpers - dates are normalized to midnight for "date" fields
- **Streaks:** Track consecutive days - critical for user retention. Use `streakService.updateForSession()` after any session change
- **Transactions:** Wrap related DB operations in `db.transaction()` to ensure atomicity
- **Soft delete:** Zikrs use `deletedAt` timestamp, never hard delete in production code
- **Session editing:** Sessions are editable for 3 days after creation (`editableUntil` field)
- **iOS limitations:** No scheduled local notifications - use in-app notification center
- **Manual progress:** Core differentiator - users track physical tasbeeh sessions
- **Counter rounds:** The counter auto-saves a round when the target is reached and keeps counting past it (each further target's worth saves as its own round); unfinished counts ride durable per-zikr checkpoints (`countRecorder.ts`) and resume next time — the resume snapshot is computed at render in CounterFlowContainer (a post-mount state update would never reach the board's `useState(startCount)`). Leaving the counter SAVES the unsaved remainder as a session (the exit flush in CounterFlowContainer); the checkpoint is only the tab-close/kill safety net. Opens from a personal plan row seed the board with the row's displayed progress and delta-save (`resumedBase` → `saveableBase = startCount`), landing the plan exactly on its target; group plans keep the round-based counter. Don't reintroduce count state in two places without a sync guard.
- **Routines:** Ordered zikr sequences with per-item counts (db v7). Scheduling/day-part logic is pure code in `routineUtils.ts`; the guided flow rides the counter checkpoints. Progress is SCOPED per routine (`sessionCountsTowardRoutine`): guided saves carry `session.routineId` and always count for their routine; free counting counts toward a scheduled routine only inside its part of day (`dayPart`, or derived from the clock); manual entries carry the user's chosen part. Both fields are additive and non-indexed — no db bump. Four Hisn-ul-Muslim presets seed on first run; a deleted preset never creeps back.
- **After-salah set:** The offer follows the prayer PERIOD — from each prayer until the next (Isha runs overnight until Fajr), not a 30-minute window; when the next prayer arrives an unfinished set moves on SILENTLY (no "missed" state), and its tracker chip opens an offline mark-done ask (records attributed sessions for the remaining amounts). Completion is ATTRIBUTED, never free (`session.postSalah` = the prayer, written by the ?postSalah= flow on every save path AND the mark-done dialog; `attributedCounts` counts sessions inside the prayer's period or marked later the same day). The older "any session inside the 30-minute window counts" rule completed sets the user never ran (all-day tasbeeh counting; the night preset's 33/33/34 landing in the isha window) — don't reintroduce window-presence crediting. Guided flows also expose a step rail (skip ‹ › in CounterFlowContainer's `navOverride`): skipping moves the board, it never marks an item done.
- **Prayer times:** Computed on-device with `adhan` (`core/utils/prayerTimes.ts`); offline city list in `core/data/prayerCities.ts`. Post-salah offers live in a 30-minute window after each prayer (`usePostSalahWindow`); the location never leaves the device.
- **Predefined content:** `zikrCatalog.ts` is source-pinned — `tests/core/data/contentIntegrity.test.ts` verifies every revealed text and dhikr count against its source, and the seeder treats the shipped catalog as authoritative on boot (custom zikrs are never touched).
- **Plans:** A plan covers 1..5 zikrs (personal plans bind `plan.zikrs[].zikrId`; group plans bind by NAME — members' local libraries differ). Mode (`combined` vs per-zikr) is a data-level concept: personal plans may be either (combined is the default), and NEW group plans are always per-zikr — only legacy group plans are combined. Never assume a single zikr. Personal plan progress: `planService.computePlanProgress` (it filters by the plan's zikr set itself; per-zikr mode completes only when EVERY zikr hits its target). Group plan progress comes from the server mirror (`planUtils.sharedPlanProgress` over `total`/`periodTotal`). Never assume a single zikr.
- **Testing:** Tests live in `tests/` (`core/` for data/db/services/utils, `ui/` for components/containers/pages). Use happy-dom for DOM tests, keep tests pure unit tests when possible (DB-backed service tests use `fake-indexeddb/auto`; DB migrations have dedicated tests, e.g. `migrationV6`/`migrationV7`)

## Project Context

See **CHANGELOG.md** for shipped, user-facing changes — update its
`Unreleased` section with every user-facing change (agents included); date
it only when the change ships to GitHub Pages.

See **docs/architecture.md** for complete data schema and architecture diagrams.
See **docs/Tasks.md** for v1 task breakdown across 5 epics.
See **docs/Idea.md** for problem statement and target users.
