# Changelog

Notable, user-facing changes to Zikr. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are ship dates to
GitHub Pages (`main2` push). Update the `Unreleased` section with every
user-facing change and date it when it ships.

## Unreleased

### Fixed
- **Groups failed with "Something went wrong" for everyone.** The
  production database was still on the original v1 schema — the server
  functions the Groups feature calls (including the device-identity call
  that runs right after sign-in) did not exist there, and the v2
  migration silently rolled back on its first run because it referenced
  functions only a fresh database would have. The migration now upgrades
  the existing database in place and carries the legacy groups over to
  the new plan model. Also requires the Supabase "Exposed schemas"
  setting to be `public` only (see below) — until both are applied the
  Groups tab and the shared-Zikr Library sync stay down, now with an
  honest "server did not recognize this request" message instead of a
  generic failure, and the raw cause logged to the browser console.

### Changed
- **The server surface commits to group terminology.** The v1 "room"
  naming is gone from the database: `get_room_state`, `join_room`,
  `leave_room`, `close_room` and the `rooms` table are now
  `get_group_state`, `join_group`, `leave_group`, `close_group` and
  `groups`. Fresh-install and upgrade migrations define the same
  canonical surface, guarded by a new `npm run check:migrations` drift
  check. The database agreement (tables API-invisible in `zikr_app`,
  callable functions in `public`, Exposed schemas = `public` only) is
  now documented in AGENTS.md.
- Requires running the updated `supabase/migrations/0002_group_plans.sql`
  and `0002_shared_zikrs.sql` on the server (the latter once more after
  its policy fix), and setting Supabase "Exposed schemas" to `public`.

## 1.2.1 — 2026-09-18

### Fixed
- The Groups security check now follows the official Turnstile pattern:
  sign-in shows a small "Security check" card with a live verification —
  invisible while Cloudflare passes you passively, showing a solvable
  checkbox inside the card only when Cloudflare demands interaction. The
  previous invisible background widget could demand an unnoticed checkbox
  (timing out after a minute) and submitted stale tokens that Cloudflare
  rejected — the likely cause of persistent "Security check failed"
  errors.

## 1.2.0 — 2026-09-17

### Added
- **Install nudge.** When the app runs in a browser tab (not installed),
  a small banner offers to install it: a one-tap "Install" button on
  Chrome and other Chromium browsers, and manual "Share → Add to Home
  Screen" instructions on iOS. The banner auto-closes after a few
  seconds, shows at most once per session, and stays hidden for a week
  if closed by hand. Installed-app users never see it.

### Changed
- **Creating a group requires connecting first.** If the Groups sign-in
  hasn't completed (offline, security check failed), the "New Group"
  button is disabled with an explanation and a "Try again" action;
  joining with a code still retries sign-in on tap.
- **Group plans count per zikr.** New group plans always give each zikr
  its own target — the "Combined" (single shared goal) option is gone from
  group plan creation, so progress rows and per-zikr attribution are
  unambiguous. Already-created combined plans keep working and rendering.
- **Plan creation starts with no zikr pre-selected** (group and personal):
  the first zikr used to be silently checked, which created plans counting
  zikrs the user never intended.
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
- **Practice History works again.** The history list required a database
  index that never existed, so it failed silently and showed "No practice
  yet" even with sessions recorded (and its edit/delete entries were
  unreachable). Sessions now load with an in-memory sort, and a failed load
  shows an honest error with a retry button instead of an empty state.
- **The Weekly Progress chart now shows bars.** Bar heights were computed
  as percentages against an auto-height container and always rendered at
  0px; today's bar now fills the chart as expected.
- **New devices no longer run a CAPTCHA challenge on the welcome screen.**
  The startup usage ping used to create a device identity (and its
  Cloudflare Turnstile sign-in) on every cold start for first-time users;
  it now reports only when an identity already exists. The Groups tab still
  signs in when you actually use it.
- An unfinished counter round now survives a full reload or the app being
  killed (previously only in-app navigation kept it). Rounds older than
  48 hours are considered finished and no longer resume.
- Settings toggle rows (Dark Mode, Vibration, Count towards goals) respond
  to taps anywhere on the row, not just the small switch.
- Library search no longer returns "0 zikrs found" for queries with leading
  or trailing spaces.
- Deleting a plan asks for confirmation in the active language (was
  hardcoded English), and the Welcome screen shows the real app version.
- All browser-native `confirm()`/`alert()` popups are replaced with styled
  in-app dialogs that follow the theme and translate to the active language
  (plan deletion, session edit/delete, zikr deletion, data import/clear,
  room end-plan/remove-member/close/leave, and every error/success notice).
- If the Groups sign-in security check fails, the error now offers a
  "Try again" button instead of a dead end, and the Cloudflare widget —
  when it needs interaction — appears above the bottom bar instead of
  covering on-screen buttons.
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
