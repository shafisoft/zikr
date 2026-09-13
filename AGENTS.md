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
npm run lint            # ESLint
npm run size-check      # Verify bundle size against 200KB limit
```

## Architecture

### Data Layer (Dexie.js + IndexedDB)

**Database:** `zikr-db` with versioned schema (currently v4 — goals carry `zikrIds: number[]` + optional `name`; the legacy single-zikr `zikrId` column was folded into `zikrIds` by the v4 upgrade)

**Stores:** zikrs, sessions, goals, streaks, settings, sessionFormState, zikrLastCount, sharedRooms, sharedSubmissions, syncOutbox, identity

**Type definitions:** `src/core/db/types.ts` - defines all interfaces

**Migrations:** versioned `.upgrade()` hooks in `src/core/db/db.ts` (+ `src/core/db/migrations.ts` for v2 data moves)

**Predefined library:** `src/core/data/zikrCatalog.ts` is the single source for the predefined zikr library (Arabic, en/bn names & meanings, default targets, Quick Start flag). The seeder writes these onto Zikr records and backfills older rows; `src/ui/utils/zikrMapping.ts` is a thin record-first display adapter. Custom zikrs carry user-entered `arabicText`/`translation` on the record. Duplicate (case/whitespace-insensitive) zikr names are rejected at creation.

**Pattern:** Database operations are wrapped in transactions for data integrity:
```typescript
await db.transaction('rw', db.sessions, db.streaks, db.goals, async () => {
  // Multiple operations in single transaction
  await db.sessions.add(session);
  await updateStreak(session.zikrId, session.date);
});
```

### Service Layer

**Location:** `src/core/services/`

**Pattern:** Each domain has a service file with CRUD operations and business logic:

- `zikrService.ts` - Zikr CRUD with soft delete
- `sessionService.ts` - Session CRUD with auto-updating streaks/goals
- `streakService.ts` - Streak calculation and recalculation
- `goalService.ts` - Goal progress tracking
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
- `goalStore.ts` - Goal list
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
│   ├── pages/      # Route pages (Home, Counter, Goals, Group, Progress, Library, Settings)
│   ├── hooks/      # useRipple, useHaptic
│   ├── types/      # Component prop types
│   └── utils/      # Display helpers (zikrMapping: record-first adapter over the catalog)
└── utils/          # V1-era utils (goalUtils, validation) — used by core + tests
docs/design/        # Static HTML design mockups (reference only, not built)
```

**Placement rule:** new UI goes in `src/ui`, new logic goes in `src/core`.
`core` must never import from `ui`. (Known debt: V1-era `src/utils` and
`src/core/utils` both exist.)

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
- **Multi-zikr goals:** A goal covers `zikrIds: number[]` with combined progress. Always resolve a goal's zikrs via `goalService.getGoalZikrIds()` and compute progress via `calculateProgress` (it filters by the goal's zikr set itself). Never assume a single zikr.
- **Testing:** Utilities are well-tested. Use happy-dom for DOM tests, keep tests pure unit tests when possible (DB-backed service tests use `fake-indexeddb/auto`)

## Project Context

See **docs/architecture.md** for complete data schema and architecture diagrams.
See **docs/Tasks.md** for v1 task breakdown across 5 epics.
See **docs/Idea.md** for problem statement and target users.
