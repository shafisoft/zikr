# Changelog

Notable, user-facing changes to Zikr. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are ship dates to
GitHub Pages (`main2` push). Update the `Unreleased` section with every
user-facing change and date it when it ships.

## Unreleased

### Changed
- **Groups are forever.** A shared-goals room no longer dies with its time
  window (and is no longer auto-deleted 60 days later): a group keeps its
  code, members, and history, and ended plans stay visible under "Past
  plans". Only the owner can close a group.
- **Goals become Plans.** Personal goals are now "Plans" (same data,
  migrated automatically; `/goals` redirects to `/plans`). A plan covers
  one or more zikrs (up to 5) with either one combined target or a target
  per zikr — for personal plans too, which previously only supported the
  combined style.
- **Group plans.** The group owner can start several plans at once inside
  a group, each with its own zikrs, target mode, and schedule: one-time
  windows (today / this week / custom dates) or recurring daily / weekly /
  monthly plans that reset automatically for everyone at the same moment
  (the creator's timezone). Contributing targets a specific zikr of a
  specific plan; the counter still propagates automatically to every
  matching plan.

_(nothing yet)_

### Fixed
- Rescue for installed PWAs stuck on an old version: the service worker now
  activates new deploys by itself (`skipWaiting` + `clientsClaim`) instead of
  waiting for a tap on the update banner. Devices running a build whose
  banner was unreachable (it rendered under the navbar) could never accept an
  update — they now pick up the latest version on the next app launch.

## 1.1.1 — 2026-09-14

### Changed
- Under the hood: single-source-of-truth refactor completed — the UI now
  talks only to stores (no direct service/database imports, enforced by a
  layer checker in `npm run lint`), Home and Progress derive their numbers
  from one shared set of pure functions, and the session-history buckets
  follow the app language instead of hardcoded English.

## 1.1.0 — 2026-09-14
- Share intent: the system share sheet can share a room invite (title +
  `/join/CODE` link) from the Room page, and the app itself from
  Settings → About. Falls back to copying the link when the browser has
  no share API.

### Fixed
- Finishing a zikr now returns to the screen you started from (Home,
  Goals) instead of always going Home.
- The "new version available" banner is no longer hidden underneath the
  top bar; the offline-ready banner no longer shows at all (noise).

### Changed
- Copy review: the Goals tab is called "Goals" everywhere (was "Intentions
  & Reminders", which promised reminders that don't exist); Group/Room
  copy says "do dhikr together" instead of "read together"; the counter's
  finish button shows the live count ("Save 12 & Finish"); the
  counts-toward-goals toggle describes both on and off; "1 Days" streak
  plural fixed.
- Home and Progress now show the same streak number (shared calculation;
  previously two different definitions, and Home showed 0 before the
  day's first session).
- Under the hood: single-source-of-truth refactor begun — dead stores and
  legacy utils removed, write actions moving into Zustand stores so the
  UI stops calling services directly.

## 2026-09-13

### Added
- Backend-driven zikr library: share custom zikrs to Supabase for review
  ("share with others" toggle), admin-verifiable in the DB, and pull
  verified zikrs into your library via the Library sync button.
- Counter modal inside rooms: the room's ring opens the counter without
  leaving the page.
- Dedicated Zikr Library page (search, add, edit, delete) with AppLayout
  as the single shell owner.

### Changed
- Counter sessions now count toward goals and group rooms by default
  (toggle in Settings).

## 2026-09-12

### Added
- Shared goals (rooms): create/join by code, combined totals, members
  (names only), invite links, Turnstile captcha protection on anonymous
  sign-in, in-app error messages for every failure mode.

### Fixed
- Counter counts tap gestures, not individual fingers (multi-touch no
  longer skips counts).
- Join-page name field missing its Bangla translation.
- Share links respect the deploy base path.

## 2026-09-11

### Added
- Multi-zikr goals with optional names; counter auto-saves a session when
  the target is reached and offers "Another Round / Done".
- Expanded predefined library (11 additional authentic adhkar); cards show
  Arabic plus the selected language; curated Quick Start rail.

### Fixed
- App centered in a phone-width column on desktop; zikr cards line-clamp
  long text; Salawat uses the short formula; equal-width bottom-nav tabs.

## 2026-09-10

### Fixed
- PWA installability; deploy auto-detects custom domain; deploy pipeline
  and lockfile reliability fixes.

## 2026-06-16 — 1.0.0

Initial release: counter, manual progress entry, goals, streaks, zikr
library, dark mode, Bengali/English, offline-first PWA.
