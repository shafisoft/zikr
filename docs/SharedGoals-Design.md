# Shared Goals (Rooms) — Feature Design

Status: approved for implementation
Date: 2026-09-11

## Feature summary

Users can create a **room** (a shared goal) that defines:

- **What will be read** — a zikr (from the predefined list or custom)
- **The target** — a combined count the group aims for together
- **The time window** — when the goal starts and ends

The creator invites people with a **6-character code or link**. Members join **without any login** (anonymous device identity) and submit their counts. Everyone sees the **combined progress** toward the target.

## Privacy model (core principle)

**The backend stores only the goal and the total contribution.**

- No per-member submissions exist anywhere on the server — there is nothing to leak, breach, or misuse.
- Each member's contribution history lives **only in their device's IndexedDB**. "My contribution" is computed locally; clearing app data erases it. The room total is unaffected by a reinstall.
- The server keeps a **names-only membership list** so the room can show who is in the group and let the owner manage it. Names carry zero contribution data.
- One correctness exception: an `applied_event_ids` ledger (UUIDs only, auto-purged after ~7 days) so a retried increment can never double-count. It stores no counts, no user IDs, no contributions.

## Key decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Supabase free tier** as the sync backend (user keeps the project alive) | No server code to write or host: SQL schema + Row Level Security only. Anonymous sign-in maps directly to the no-login requirement. |
| D2 | **Polling, not Realtime** | Supabase Realtime's concurrent-connection caps don't suit an open app. One `get_room_state` RPC (~1 KB) on room-screen open, on app focus, and every 60 s while foreground. Realistic load is a few thousand requests/day per 1,000 daily users. |
| D3 | **Open join, totals only** | The room code is the only gate (30+ bits, unambiguous alphabet). Combined total is the only progress shown; individual history never leaves the device. |
| D4 | **No login: anonymous identity** | Supabase `signInAnonymously()` gives each device a stable `user_id`; RLS binds rows to it. Rejoining after reinstall = re-enter the code (fresh local history; room total unaffected). |
| D5 | **Zero new dependencies in the initial bundle** | `supabase-js` is lazy-loaded via dynamic import only for the Group tab (on-demand chunk; bundlesize checks each `dist/assets/*.js` ≤ 200 KB gzip). |

## Data model

### Backend (Supabase / Postgres)

```sql
rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text UNIQUE NOT NULL,      -- 6 chars, alphabet w/o 0/O/1/I
  title         text NOT NULL,
  zikr_name     text NOT NULL,             -- what will be read
  zikr_arabic   text,                      -- optional display text
  target        integer NOT NULL,
  total         integer NOT NULL DEFAULT 0,-- combined contribution (authoritative)
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,      -- server clock is authoritative
  owner_id      uuid NOT NULL,             -- anonymous auth uid of the creator
  status        text NOT NULL DEFAULT 'active',  -- 'active' | 'closed'
  created_at    timestamptz DEFAULT now()
)

members (                    -- names only; no contribution data
  room_id + user_id   uuid PRIMARY KEY,
  name                text NOT NULL,       -- ≤ 24 chars, sanitized
  joined_at           timestamptz DEFAULT now(),
  removed_at          timestamptz          -- null while active
)

applied_event_ids (
  event_id     uuid PRIMARY KEY,           -- idempotency of increments
  room_id      uuid NOT NULL,
  applied_at   timestamptz DEFAULT now()   -- purged after 7 days
)
```

### Client (Dexie, schema v3)

```
identity            {userId, displayName}            -- created lazily on first room use
sharedRooms         cached mirror of joined rooms (goal + total + members, fetchedAt)
sharedSubmissions   MY contribution history — LOCAL ONLY, never synced
syncOutbox          pending increments {eventId, roomCode, delta, attempts, nextAttemptAt}
```

## RPCs

- **`contribute(p_code text, p_delta integer, p_event_id uuid)`** — checks membership, active status, and window (server clock); applies `total = total + p_delta` atomically; idempotent via `applied_event_ids`; caps `p_delta ≤ 10000`; returns the new total.
- **`get_room_state(p_code text)`** — returns `{room (goal + total), members: [{name, joined_at}]}` in one call.
- **`create_room(...)`, `join_room(p_code, p_name)`, `remove_member(p_code, p_user_id)`, `close_room(p_code)`** — owner checks enforced via `owner_id = auth.uid()`.

RLS: rooms readable by anyone (code-gated app flow); members rows readable by room members; row changes are constrained by policies (owner inserts rooms, users join as themselves, owner-or-member updates rooms, self-or-owner updates membership rows). All RPCs are `security invoker` in the `public` schema and run under those policies with scoped table grants; the `zikr_private` schema itself is not exposed to the API. There is no submissions table to protect.

## Client architecture

```
GroupTab UI ──► sharedRoomStore (Zustand) ──► sharedRoomService
                                                │  writes: local Dexie first
                                                ▼
              syncOutbox ◄──► syncService (flush on start/online/write + 60s poll while open)
                                                │
                                     SharedRoomBackend contract (port)
                                       ├── SupabaseSharedRoomBackend  (production)
                                       └── MockSharedRoomBackend      (tests / offline demo)
```

All shared-room code lives in `src/core/services/sharedRoom/`:

- **`contract.ts`** — the port: `SharedRoomBackend` interface, payload shapes, error taxonomy. The rest of the app knows nothing beyond this file.
- **`supabaseBackend.ts`** — the production adapter; the only file in the codebase importing `supabase-js` (dynamically, on-demand chunk).
- **`mockBackend.ts`** — a dumb in-memory backend implementing the same rules (window checks, idempotent increments, membership, owner checks). Used by unit tests, and by the running UI via `VITE_SHARED_ROOMS_BACKEND=mock` — the Group tab works end-to-end with no Supabase at all.
- **`backendFactory.ts`** — names the active backend (the single seam).
- **`service.ts`** — local-first orchestration: identity, create/join/submit, outbox flush. Takes any `SharedRoomBackend` (dependency-injectable for tests).
- **`syncService.ts`** — background flush + 60s room poll.
- **`instance.ts` / `index.ts`** — the configured singleton and public surface.

- **Offline-first**: every write lands in Dexie first; the outbox retries with backoff. Failed/paused fetches degrade to "stale but readable" — nothing is ever lost or double-counted.
- **Idempotency**: each submit creates a client-side UUID event; a retried flush cannot double-apply.
- **Window rules**: the server is authoritative; a rejected increment surfaces as "time window ended".

## UI (Noor design system)

New **5th bottom tab "Group"** (Home, Goals, Group, Progress, Settings):

- **Group Home** — active / upcoming / ended rooms; Create + Join; explainer of the sharing model ("your personal count never leaves this device"). Noor empty states (arch + pattern).
- **Create flow** — title, zikr picker (predefined + custom), target, window presets (**Today / This week / Custom range**), then a share screen with the big code + copy-link button (`…/#/join/CODE`).
- **Join flow** — deep link prefills the code (`/#/join/:code` route), or manual entry; pick a display name; straight into the room.
- **Room screen** — gold `CircularProgress` ring with combined % and total, time remaining, member name chips (names only), **my contribution** section (local history), quick submit (+10 / +33 / custom), share code again, owner-only member management + close room. Ended rooms render as summary cards.

## Constraint check (CLAUDE.md)

- **$0 cost**: Supabase free tier + user-run keep-alive. ✅
- **Offline-first**: core app unchanged; rooms degrade to cached + queued when offline. ✅
- **200 KB bundle**: supabase-js in a lazy on-demand chunk; initial bundle untouched. ✅
- **iOS**: no push in v1 — code/link share sheet + in-app notices. ✅

## Trade-offs (accepted)

- **Loss of device data is non-recoverable, by design.** No account-recovery
  mechanism will be built: a new device is a new anonymous identity, and the
  user rejoins rooms via codes as a fresh member (room totals unaffected).
  Deliberately rejected: recovery IDs / secrets — any recoverable credential
  reintroduces accounts, secrets and takeover risk the no-login model exists
  to avoid.
- Progress updates are near-live (≤ 60 s), not instant.
- "My contribution" is device-bound: reinstall = fresh local history (room total unaffected).
- Owner can remove a member's name; increments already applied remain in the total (no per-member ledger to undo).
- Keep-alive must be monitored; downtime degrades to stale + queued, never data loss.
- No built-in rate limiting on free tier (delta cap + code entropy + window checks cover v1; an Edge Function limiter can come later).

## Usage metrics (privacy-preserving)

Since the backend never sees individual progress, usage analytics are built on
a **device token**, not people:

- On first use the backend issues a **server-generated 12-character token**
  (same unambiguous alphabet as room codes) via the
  `get_or_create_device_token()` RPC. The client stores it in IndexedDB
  (`identity.token`); the Supabase anonymous-auth JWT remains the transport
  credential — the token is only the analytics key.
- Best-effort events land in `analytics_events (device_token, name,
  properties, created_at)` via a never-throwing `track_event` RPC. **No
  client can read events** (insert-only RLS policy, no select grant; the
  table has no REST endpoint), and raw events purge after **90 days**.

Tracked events (usage shape only):

| Event | Properties |
|-------|------------|
| `app_opened` | — (once per session) |
| `room_created` | `{ window: 'today' \| 'week' \| 'custom' }` |
| `room_joined` / `room_opened` / `room_shared` | `room_shared: { kind: 'code' \| 'link' }` |
| `contribution_submitted` | **none — deliberately no amount** |
| `room_closed` / `room_left` / `member_removed` | — |

Deliberately not tracked: dhikr amounts, per-member anything, timings beyond
the event timestamp. The capability is part of the backend contract
(`SharedRoomUsageTracker`), so the mock backend fakes it for tests and any
future backend must provide it too.

## Implementation phases

1. **Supabase**: migration SQL (schema, RLS, RPCs) in `supabase/migrations/` — run on the project via the Supabase dashboard/CLI.
2. **Core**: `identityService`, `sharedRoomApi`, `sharedRoomService`, `syncService`, Dexie v3, Zustand store; vitest coverage for idempotency, window validation, offline queue.
3. **UI**: Group tab, create/join/room screens in the Noor design, `/join/:code` deep link.
4. **Polish**: Settings entry for display name, offline-queue UX, env config (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
