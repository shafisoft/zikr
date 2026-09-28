# Changelog

Notable, user-facing changes to Zikr. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/); dates are ship dates to
GitHub Pages (`main2` push). Update the `Unreleased` section with every
user-facing change and date it when it ships.

## [Unreleased]

### Changed
- **The counter screen is now just a counter.** Library and Settings are gone
  from its top bar (Close and the haptics toggle remain); the meaning line
  hides behind a small "Translation" toggle so the screen stays on the
  dhikr itself; the manual "Save N & Finish" button is removed — rounds save
  themselves at the target, and anything unsaved when you leave waits on
  your checkpoint and resumes next time; Reset moved into the screen's
  bottom-right corner (it still always asks first). The room counter keeps
  its explicit "Save & Finish", since a group's unsaved counts have no
  checkpoint. Long top-bar names no longer wrap the header into two lines,
  and long Arabic text scrolls within the counter instead of clipping
  (existing behavior, kept).

## [1.5.1] — 2026-09-27

### Fixed
- **Ayat al-Kursi was missing "ٱلْحَىُّ ٱلْقَيُّومُ" (the Ever-Living, the Sustainer of
  existence).** The whole verse has been replaced with the canonical Uthmani
  text, verified against the Quran, word for word — and an automated test now
  pins every revealed text in the app to its source so this class of error can
  never ship again. The same test corrected two other details: the full
  Al-Ikhlas/Falaq/Nas texts now match the mushaf exactly, and the bedtime dua
  "Allahumma aslamtu nafsi ilayk" carries its complete closing ("āmantu
  bi-kitābika…") with the correct wording, as in Bukhari.
- **Dhikr counts now follow their hadith anchors.** "Allahumma a'inni ala
  dhikrika" and "Hasbunallahu wa ni'mal wakeel" had no transmitted count (both
  are recited once, not 10× or 33×), and "La ilaha illallahu wahdahu la
  sharika lah" is 10× after Fajr and Maghrib (Muslim), not 100×. Every
  remaining target is now cited to its source in the code tests.
- **Existing installs receive content corrections automatically.** The
  predefined zikr library is now treated as authoritative on boot: if a
  shipped correction changes a text or count, your library updates to match
  (custom zikrs you created are never touched).

### Added
- **Your day, ritual by ritual: four ready-made routines, now on the clock.**
  The app now seeds four Hisn-ul-Muslim routines for you — morning adhkar,
  evening adhkar, the before-sleep set (Ayat al-Kursi; the three surahs
  Ikhlas, Falaq and Nas in full; the bedtime duas; and Tasbih Fatimah
  33 · 33 · 34), and the Friday sunnahs (Surah Al-Kahf, Salawat ×100,
  istighfar ×100) — complete with fully vocalized Arabic, Bangla and English
  meanings, and the traditional counts. Home greets you with a quiet
  "current ritual" card right below your streak: it names the routine whose
  part of day it is right now (morning, evening, night, or Friday), shows
  your progress item by item, and one tap starts the guided counter flow —
  after dark it points at the night set, at midday it tells you what's
  next, and when today's set is done it says so gently instead of
  disappearing. If your after-salah card is already up, the ritual card
  steps aside and shows what comes next instead. Every routine stays fully
  yours: edit the items, delete a preset without it ever creeping back, or
  ignore it all — nothing else on the app changes.
- **Post-salah mode: the app now knows the moment after prayer.** Save your
  location once in Settings — pick from an offline city list (all Bangladesh
  districts and major diaspora cities, searchable in Bangla or English),
  type coordinates, or use a one-shot device fix — and Zikr can offer your
  after-salah set (33 · 33 · 34 · 100) right after each of the five prayers.
  For 30 minutes after a prayer time, Home shows a quiet card naming the
  prayer; one tap runs the set in the counter, item by item, resuming where
  you left off. Everything is computed on your device and works fully
  offline — your location never leaves your phone, and the feature stays
  invisible until you both save a location and turn it on. If prayer times
  can't be computed for your location, the feature quietly stays out of the
  way and Settings says so.
- **Routines: your morning/evening adhkar as one object.** A routine is an
  ordered list of your zikrs with per-item counts — no dates, no deadlines,
  just "did I do it today". Start with one tap from the ready-made
  morning/evening set (the six-item Hisn-ul-Muslim cluster, with its
  traditional counts, referencing your existing library entries), or build
  your own sequence from any zikrs with editable per-item counts (up to 12
  items, 5 routines). Tapping a routine runs it in the counter,
  item-by-item: reaching an item's count saves it and moves on; quit and
  return any time — the flow resumes exactly where you left off, and
  anything you counted outside the routine (plain counter, manual entry)
  already counts toward it. When every item is done, the routine says so —
  and keeps its own daily streak under the same gentle "never miss twice"
  rule as the overall streak (a partial day counts for your overall
  streak, but the routine streak means the whole sequence). If a zikr in a
  routine is removed from your library, the row gently says so and stays
  editable. Home shows one quiet, dismissible offer for the preset when
  you have no routines — and nothing at all otherwise; deleting a routine
  never touches your zikrs or history.

### Fixed
- **Opening the counter no longer shows "No Zikrs Available" with a full
  library.** Every "Start" on Home could land on the counter's empty state
  instead of the zikr: the screen's top-bar title handshake reported "no
  step" for one frame before the zikr resolved, and the screen mistook that
  first report for an empty library and tore the counter down mid-load. The
  empty state now appears only when the library really is empty.
- **Restoring a backup no longer corrupts your dates.** Session, plan, and
  settings dates could come back from a restore as plain text instead of
  real dates, silently breaking streaks, plan windows, and history sorting.
  Import now rehydrates every date field, and an export → restore round
  trip is lossless — existing backup files work as-is. Backups now also
  carry your routines (presets, custom sets, schedules, and dismissals), so
  a restore brings your whole practice back.
- **Reset on the counter no longer erases an unsaved round in one tap.**
  Reset now asks for confirmation first ("Delete" / "Keep counting") on
  every platform, including desktop's Escape path.

### Added
- **One missed day no longer breaks your streak ("never miss twice").**
  Come back the day after a miss and the streak badge holds its value in a
  quieter grace state — "your streak is safe" — instead of showing zero,
  with a one-tap "Log yesterday?" prompt that opens the backdated entry
  form with yesterday prefilled (it asks at most once a day and stays
  dismissible). Practicing again, or logging the missed day, silently
  continues the streak at its old value plus one. Only a second consecutive
  missed day ends a streak, and even then the app just says a fresh streak
  starts today — never guilt copy, in either language. Home and Progress
  always show the same number from the same rule, and the rule is re-derived
  from history, so edits, restores, and backdated logs all agree.
- **Advanced counter controls (optional, off by default).** A new Settings
  toggle enables two forgiveness affordances for the counter: long-press the
  count circle to take one back (with a one-time "Hold to take one back"
  hint the first time a count passes ~10), and a short "Round saved — Undo"
  toast after an auto-save that deletes just that round. The Undo is honest
  about its limits: a round already shared with your group says plainly it
  can't be undone here, instead of offering a link that wouldn't retract the
  shared total. Counting is never blocked while the toast shows.
- **Bangla and Arabic work in search and pickers.** Library search now
  matches the Bangla name and the Arabic text as well as the English name
  (name matching ignores case and stray spaces — search "সুবহানাল্লাহ",
  "subhan", or the Arabic string and find SubhanAllah). In Bangla mode the
  Library list, the manual-entry zikr dropdown, and the plan form's zikr
  pickers show Bangla names when available. The invite-join page's name
  field now uses the localized placeholder ("যেমন, আহমেদ") instead of a
  hardcoded "e.g., Ahmed", so the deep-link page renders fully in the
  device language.

## 1.4.0 — 2026-09-25

### Fixed
- **Server: the shared-library pull function could never succeed.**
  `pull_verified_zikrs` referenced its pagination CTE outside the CTE's
  statement, so every call failed with `relation "page" does not exist`,
  and its end-of-pages check would have stalled syncs even if it ran —
  fixed and now exercised by the local migration harness. The upgrade
  migration also carried three latent errors (an invalid `RENAME COLUMN
  IF EXISTS`, cleanup drops that removed two live RPCs, and a missing
  UPDATE grant that made `contribute` impossible) — all fixed; the
  harness's full behavioral suite now passes from a fresh database.
  Operators: see `supabase/README.md` (exposed-schemas check + re-run the
  migration files).
- **Joining or creating a group no longer fails with "Something went
  wrong".** The client read the group summary from the payload's `room`
  key while the server sends `group`, so every Supabase-backed state
  response (join, create, refresh) threw on the client after the RPC had
  already succeeded. The wire contract (`sharedRoom/contract.ts`), mock
  backend, and tests now all use the server's `group` key.
- **The counter now resumes where you left off.** An unfinished round
  used to live only in the tab's local storage — one zikr at a time,
  dropped after 48 hours, and reset to zero whenever you counted a
  different zikr in between. In-progress counts now auto-save durably
  per zikr as you count, and the counter picks them back up.
- **Haptic feedback no longer pretends to work where it can't.** iOS
  browsers have no web vibration API, so the counter's toggle silently
  did nothing on iPhones. The counter now says haptics aren't supported
  on such devices (taps still count); Android behavior is unchanged.

### Changed
- **Counting no longer stops at the target.** Reaching the target saves
  the round as before, but the counter keeps going — 1001, 1002, … — and
  every further target's worth of counts saves itself as its own round.
  Surplus past a target persists like any other count: mid-segment exits
  ride on the durable checkpoint, and "Another Round" starts from zero
  instead of re-counting anything already saved.

## 1.3.0 — 2026-09-22

### Fixed
- **Logging a past date no longer zeroes your streak.** A backdated manual
  entry used to rewind the streak's bookkeeping, so the next day's session
  read as a break and reset a real streak to zero. Backdated entries now
  rebuild the streak from history instead.
- **Editing a one-time plan no longer shifts its dates a day earlier.** The
  edit form read the stored dates as UTC, so users east of London saw —
  and could silently save — the wrong day.
- **The haptics toggle now applies everywhere, immediately.** Counter
  screens ignored a setting change until reopened, and Quick Start cards
  always vibrated regardless of the setting.
- **Group rows in "Your Goals" stay fresh.** Counts shown on Home now come
  from the local mirror reactively, so a round counted from the group or
  the counter updates them immediately instead of at the next group visit.
- **Session history keeps your expanded groups.** Recording a session no
  longer collapses the buckets you had opened.

### Added
- **"Continue next zikr" on the counter.** When a counter is opened from a
  per-zikr plan, completing a round now offers a button that jumps
  straight to the plan's next zikr (with its own target), so a
  multi-zikr plan runs as one flow instead of five separate trips.
- **A "Your Goals" section on Home.** The zikrs counted by the user's
  active personal plans and group targets now appear (with their live
  progress) right before the quick-start rail; tapping one opens the
  counter toward that plan's own number — group rows propagate to the
  group on save. The quick-start rail itself was renamed "Remember for
  Some Moments".

### Fixed
- **The counter ignored a plan's target.** Starting a zikr from a plan
  card opened the counter toward the zikr's library default (or 33 for
  custom zikrs) instead of the number the plan set — the round even
  auto-completed at the wrong count. The plan's target (per-zikr or
  combined) now carries into the counter; starting from Home keeps the
  library default.
- **App icons degraded to plain text when offline.** The Material Symbols
  icon font is loaded from Google's CDN, and the service worker only
  cached the font stylesheet — never the font files themselves. The font
  binaries are now cached after the first online visit, so icons survive
  offline like the rest of the app.
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
