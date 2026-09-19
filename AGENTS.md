# AGENTS.md

This file is the canonical source of guidance for AI coding agents (Claude Code, Codex, Cursor, ZCode, etc.) working in this repository. Tool-specific files (e.g. CLAUDE.md) are thin pointers to this document.

## Project Overview

**Zikr** is a Progressive Web App (PWA) for Islamic dhikr practice. Core differentiators: custom zikr lists, manual progress entry (for physical tasbeeh), and personalized goals.

## Key Constraints

- **$0/month operational cost** - No backend, all local data (IndexedDB)
- **Mobile-first design** - Thumb-zone interaction, haptic feedback, dark mode
- **Offline-first** - Service worker, no network calls in v1
- **Bundle size limit**: 200KB gzipped (configured in bundlesize)

## Tech Stack

- **Frontend:** React + Vite + TypeScript
- **State:** Zustand + Dexie.js (IndexedDB)
- **UI:** Tailwind CSS
- **PWA:** vite-plugin-pwa
- **Testing:** Vitest + happy-dom

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

# Linting & Quality
npm run lint            # Layer checker + ESLint
npm run lint:layers     # Enforce ui → stores → services → db boundaries
npm run size-check      # Verify bundle size against 200KB limit
```

## Architecture

### Data Layer (Dexie.js + IndexedDB)

**Database:** `zikr-db` with versioned schema (currently v6 — v4 folded the legacy goal `zikrId` into `zikrIds`; v5 added zikr-library sync fields on Zikr (`remoteId`, `sharedAt`, `pulledAt`) and the `zikrShareOutbox` table; v6 introduced **Plans**: `goals` migrated into `plans` + a `planOwners` ownership join, and shared rooms were slimmed into persistent groups whose targets live on group-owned plan rows)

**Stores:** zikrs, sessions, plans, planOwners, streaks, settings, sessionFormState, zikrLastCount, sharedRooms, sharedSubmissions, syncOutbox, identity, zikrShareOutbox (the `goals` table is legacy-emptied but stays declared for the historical v1→v2 upgrade)

**Type definitions:** `src/core/db/types.ts` - defines all interfaces

**Migrations:** versioned `.upgrade()` hooks in `src/core/db/db.ts` (+ `src/core/db/migrations.ts` for v2 data moves)

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
- `zikrSync/` - Shared zikr library sync (port/adapter pattern like sharedRoom): push custom zikrs on creation ("share with others"), pull admin-verified zikrs via the Library sync button. Push is creation-only; pulls are cursor-paginated (100/batch) with the cursor stored in settings (`zikrSyncCursor`); pending pushes retry via the `zikrShareOutbox` table.
- `sharedRoom/` - Groups & plans sync (port/adapter). A group is a PERSISTENT GROUP (code, title, owner, members — never auto-purged); targets live on `plans` rows owned via `planOwners ('group', groupCode)`. The owner can run several plans at once (creation is PER-ZIKR ONLY — each zikr gets its own target; one-time windows or recurring daily/weekly/monthly resetting in the plan's timezone). Legacy combined group plans still render and count, but creation no longer offers the mode. Contributions (`contribute(code, planId, zikrName, delta, eventId)`) are member-anonymous, idempotent increments; ended plans stay as group history.

**Server database agreement (Supabase):**
- **Terminology is GROUP everywhere** — tables (`groups`, `members`), helpers (`is_group_member`), and RPCs (`get_group_state`, `create_group`, `join_group`, `leave_group`, `close_group`). The v1 "room" naming is gone from the server surface; the client's internal `sharedRoom` naming (store/service/types, error codes like `room-not-found`) is a client-side protocol constant — don't mix the two layers up.
- **Tables live in schema `zikr_app` with RLS and are API-invisible.** **Callable RPCs live in schema `public` as SECURITY INVOKER** (grants + RLS authorize them; explicit `raise exception 'code'` strings are the app's error protocol).
- **"Exposed schemas" in the Supabase dashboard MUST be `public` ONLY.** With multiple schemas exposed, PostgREST serves the FIRST as the default profile — un-profiled `/rpc/*` calls would search the wrong schema and fail with PGRST202 even though the functions exist. (This exact misconfiguration broke Groups on production.)
- **Migration layout:** `0001_init.sql` = canonical schema, fresh installs run ONLY it (+ `0002_shared_zikrs.sql`). `0002_group_plans.sql` = the one-time v1→canonical upgrade for the production database (idempotent; renames rooms→groups, migrates legacy goal-rooms into plans, drops v1 leftovers). Shared function bodies in the two files are byte-identical — enforced by `npm run check:migrations` (also part of `npm run lint`). Edit one, mirror the other.
- `sessionService.ts` - Session CRUD with auto-updating streaks/goals
- `streakService.ts` - Streak calculation and recalculation
- `planService.ts` - Personal plan CRUD (owner `('user','me')`), progress for combined AND per-zikr target modes, auto complete/reactivate on session changes
- `migrationService.ts` - Database version migrations
- `progressiveSaveService.ts` - Chunked bulk operations
- `exportService.ts` - JSON backup/restore
- `errorRecovery.ts` - Retryable subscriptions with exponential backoff

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
- `sessionHistoryStore.ts` - Session list with filters
- `sessionFormStore.ts` - Manual entry form state
- `planStore.ts` - Personal plan list (user-owned view of the plans/planOwners join)
- `streakStore.ts` - Streak data
- `settingsStore.ts` - App settings
- `uiStore.ts` - Modal states

**Error recovery:** All liveQuery subscriptions use `createRetryableSubscription()` with configurable retry logic.

### Directory Structure

```
src/
├── core/           # Data + logic layer — NEVER imports from ui/
│   ├── data/       # Predefined zikr catalog (single source for the library)
│   ├── db/         # IndexedDB schema, migrations, seeding
│   ├── services/   # Domain services (+ sharedRoom/ backend abstraction)
│   ├── stores/     # Zustand state
│   ├── i18n/       # Locales (en/bn) + useI18n hook
│   ├── utils/      # Core utilities (date formatting, shared-room rules)
│   └── components/ # Shared UI components (ErrorBoundary, etc.)
├── ui/             # Everything that renders (the Noor design system)
│   ├── components/ # navigation/, cards/, decor/, forms/, progress/, modals
│   ├── layout/     # AppLayout — sole owner of the shell, top bar, bottom nav, bar-clearance spacing
│   ├── pages/      # Route pages (Home, Counter, Plans, Group, Progress, Library, Settings)
│   ├── hooks/      # useRipple, useHaptic
│   ├── types/      # Component prop types
│   └── utils/      # Display helpers (zikrMapping: record-first adapter over the catalog)
└── utils/          # V1-era utils (goalUtils, validation) — used by core + tests
docs/design/        # Static HTML design mockups (reference only, not built)
```

**Placement rule:** new UI goes in `src/ui`, new logic goes in `src/core`.
`core` must never import from `ui`.

**Layer rule (enforced by `npm run lint:layers`):** `src/ui` talks ONLY to
stores (`core/stores`) and pure utils (`core/utils`, `ui/utils`) — never to
`core/db/db` or `core/services/*`. All writes go through store actions
(zikr/goal/session/settings/sharedRoom stores own every mutation); services
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

### UI: "Noor" Design System (src-v2/)

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
- **Counter rounds:** The counter auto-saves a session when the target is reached and offers "Another Round / Done" — no manual save button at target. Don't reintroduce count state in two places without a sync guard.
- **Plans:** A plan covers 1..5 zikrs (personal plans bind `plan.zikrs[].zikrId`; group plans bind by NAME — members' local libraries differ). Mode (`combined` vs per-zikr) is a data-level concept: personal plans may be either (combined is the default), and NEW group plans are always per-zikr — only legacy group plans are combined. Never assume a single zikr. Personal plan progress: `planService.computePlanProgress` (it filters by the plan's zikr set itself; per-zikr mode completes only when EVERY zikr hits its target). Group plan progress comes from the server mirror (`planUtils.sharedPlanProgress` over `total`/`periodTotal`). Never assume a single zikr.
- **Testing:** Utilities are well-tested. Use happy-dom for DOM tests, keep tests pure unit tests when possible (DB-backed service tests use `fake-indexeddb/auto`)

## Project Context

See **CHANGELOG.md** for shipped, user-facing changes — update its
`Unreleased` section with every user-facing change (agents included); date
it only when the change ships to GitHub Pages.

See **docs/architecture.md** for complete data schema and architecture diagrams.
See **docs/Tasks.md** for v1 task breakdown across 5 epics.
See **docs/Idea.md** for problem statement and target users.
