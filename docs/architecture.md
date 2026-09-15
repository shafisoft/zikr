# Zikr PWA - Architecture Plan (Draft)

**Status:** Early planning | **Created:** 2025-01-14 | **Updated:** 2025-01-14

## Overview

This document outlines the technical architecture for the Zikr PWA. Decisions are pending - this is a starting point for discussion.

## Technology Stack

### Frontend Framework

**Selected: React + Vite + TypeScript**
- Largest ecosystem, good PWA support via vite-plugin-pwa
- Familiar patterns, easy to hire/maintain
- TypeScript for type safety across components and services
- vite-plugin-pwa for service worker and manifest generation

### State Management

**Selected: Zustand + Dexie.js**
- Zustand for simple, explicit state management
- Dexie.js for clean IndexedDB interaction
- Reactive patterns without Redux complexity

### UI Components

**Selected: Tailwind CSS**
- Fast development with utility classes
- Good dark mode support
- Can tree-shake unused styles to optimize bundle
- Mobile-first responsive utilities built-in

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        PWA Client                            │
├─────────────────────────────────────────────────────────────┤
│  UI Layer              │  State Layer     │  Data Layer      │
│  ─────────            │  ────────────    │  ──────────────   │
│  - Counter screen     │  - Store (Redux/ │  - IndexedDB      │
│  - Goals screen       │    Zustand/Signal)│  - Sessions       │
│  - Progress screen    │                   │  - Zikrs         │
│  - Settings screen    │                   │  - Goals         │
├─────────────────────────────────────────────────────────────┤
│  Services                                                      │
│  ─────────                                                     │
│  - NotificationService (Web Push + in-app)                    │
│  - StreakService (consecutive day tracking)                  │
│  - ExportService (JSON backup/restore)                       │
│  - sharedRoom/ (Supabase-backed shared goals via RPCs)        │
│  - zikrSync/ (shared zikr library: push custom zikrs for      │
│    admin verification, pull verified ones — cursor-paginated) │
├─────────────────────────────────────────────────────────────┤
│  PWA Layer                                                     │
│  ─────────                                                     │
│  - Service Worker (offline, caching)                         │
│  - Manifest (installability)                                  │
│  - Push API (Android notifications)                          │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow (Happy Path)

### User performs zikr with in-app counter:

```
User taps counter
  └─▶ Haptic feedback
  └─▶ UI updates (+1)
  └─▶ IndexedDB: Session {count, source: 'app', timestamp}
  └─▶ Goal progress recalculation
  └─▶ Streak update if threshold met
```

### User adds manual progress (physical tasbeeh):

```
User opens "Add Session" screen
  └─▶ Select zikr from list
  └─▶ Enter count (e.g., 33, 100)
  └─▶ Select date/time (default: now)
  └─▶ IndexedDB: Session {count, source: 'manual', timestamp}
  └─▶ Goal progress recalculation
  └─▶ Streak update
```

## Data Schema (IndexedDB)

Source of truth: `src/core/db/types.ts` + `src/core/db/db.ts` (versioned Dexie schema, currently v6). Sketch:

```javascript
// Database: zikr-db, Version: 6
// Stores: zikrs, sessions, plans, planOwners, streaks, settings,
//         sessionFormState, zikrLastCount, sharedRooms, sharedSubmissions,
//         syncOutbox, identity, zikrShareOutbox
// (goals is legacy-emptied but stays declared for the historical v1→v2 upgrade)

// Store: plans (keyPath: id) — ONE entity for personal and group targets
Plan {
  id: string (uuid)
  title?: string
  mode: 'combined' | 'per-zikr'      // one shared target, or a target per zikr
  period: 'daily' | 'weekly' | 'monthly' | 'one-time'
  target?: number                    // combined mode
  zikrs: PlanZikr[]                  // 1..5; personal plans bind zikrId,
                                     // group plans bind by NAME
    { name, arabic?, zikrId?, target?, total?, periodTotal? }
  startDate?, endDate?: Date         // one-time window
  timeZone?: string                  // group recurring plans (shared reset moment)
  status: 'active' | 'paused' | 'completed' | 'ended'
  createdAt: Date; completedAt?; endedAt?
  // mirror-only fields on group plans:
  roomCode?, total?, periodTotal?, fetchedAt?
}

// Store: planOwners (keyPath: [planId+ ownerId]) — the ownership relation
PlanOwner { planId, ownerKind: 'user' | 'group', ownerId }
//   ('user', 'me')        → personal plan (device-only, never synced)
//   ('group', roomCode)   → server-mirrored plan inside a group

// Store: sharedRooms (keyPath: code) — a PERSISTENT GROUP
SharedRoom { code, id, title, ownerId, status: 'active' | 'closed',
             joinedAt, joinedWithUserId?, fetchedAt }
//   The group keeps its code, members, and plan history forever; only the
//   owner closes it. Targets live on plans (see above).

// Store: sharedSubmissions (local-only, never synced)
SharedSubmission { roomCode, planId, zikrName, delta, submittedAt,
                   eventId, syncState: 'pending' | 'synced' | 'failed', note? }

// Store: zikrs / sessions / settings / streaks — unchanged (see types.ts)
```


## Notification Architecture

### Android (Web Push API)

```
App requests permission
  └─▶ User grants
  └─▶ Service worker subscribes to push server
  └─▶ Push server sends scheduled notifications
  └─▶ Service worker receives + displays notification
```

### iOS (Fallback)

```
No scheduled local notifications available
  └─▶ In-app notification center
  └─▶ "Remind me later" button (sets browser alarm API)
  └─▶ Transparent communication: "iOS limits reminders"
```

## Streak Calculation Logic

```javascript
// Pseudocode
function calculateStreak(zikrId, today) {
  const streak = getStreak(zikrId);
  const lastSession = getLastSessionDate(zikrId);
  
  // Check if streak is broken (gap > 1 day)
  const daysSinceLastSession = diffDays(today, lastSession);
  if (daysSinceLastSession > 1) {
    streak.currentStreak = 0;
  }
  
  // Check if session today
  const hasSessionToday = hasSessionOnDate(zikrId, today);
  if (hasSessionToday && daysSinceLastSession <= 1) {
    streak.currentStreak++;
    streak.longestStreak = Math.max(streak.currentStreak, streak.longestStreak);
  }
  
  saveStreak(streak);
}
```

## Offline-First Strategy

1. **All data stored locally** (IndexedDB)
2. **No network calls in v1** - purely local app
3. **PWA installation** - Assets cached in service worker
4. **Export/Import** - JSON backup for data portability

## Security Considerations

- All data is local (no server, no auth in v1)
- Export/Import files are plain JSON (user responsibility)
- Future v2: If cloud sync added, implement auth + encryption

## Performance Targets

- **First Contentful Paint:** < 1.5s (mobile 4G)
- **Time to Interactive:** < 3s (mobile 4G)
- **Bundle size:** < 200KB gzipped (PWA install friendly)
- **Tap to counter increment:** < 50ms perceived latency

## Accessibility

- **WCAG 2.1 AA** compliance minimum
- **Screen reader support** for counter and all screens
- **Keyboard navigation** for all actions
- **Touch targets:** Minimum 44x44px (mobile)
- **Color contrast:** 4.5:1 for text

## Open Questions

### Resolved
- ~~Framework choice?~~ → **React + Vite**
- ~~State management?~~ → **Zustand + Dexie.js**
- ~~CSS approach?~~ → **Tailwind CSS**
- ~~Predefined zikr list?~~ → **Include common zikrs** (SubhanAllah, Alhamdulillah, Allahu Akbar, La ilaha illallah)

### Pending (v1.1+)
1. **Reminder frequency?** Daily vs customizable times?
2. **Streak freeze?** Allow pausing streaks for travel/illness? (deferred to v1.1)
3. **Analytics granularity?** What level of detail for progress visualization?

## Next Steps

1. **Evaluate frameworks** - Build minimal POC with each option
2. **Choose framework** - Decision based on bundle size + DX
3. **Design system** - Mobile-first, dark-mode UI mockups
4. **Database setup** - Dexie.js schema implementation
5. **Core screens** - Counter, goals, progress visualization

---

*This is a living document. Update as decisions are made.*
