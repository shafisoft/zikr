# Cross-Device Progress Sync — Feature Design

Status: proposed (needs sign-off on the open decisions in §9)
Date: 2026-09-25

## Feature summary

A user counts dhikr on their phone in the morning and their PC at night —
today those are two strangers. This feature gives every user a **sync key**:
enter it (or scan its QR) on each device and their progress — sessions,
zikrs, plans — converges across all of them. No email, no password, no
account creation; the key *is* the account. The server stores only
**ciphertext** and can neither read progress nor tie it to an identity.

## Goals

- Progress (sessions, custom zikrs, personal plans) converges across
  mobile/PC/mobile within seconds of both devices being online.
- The app stays loginless and $0/month (same Supabase project).
- A lost or wiped device loses nothing that another paired device has.
- The privacy stance is *preserved, not weakened*: the backend holds
  encrypted blobs it cannot decrypt — even a full DB breach yields nothing
  readable.

## Non-goals (v1)

- Realtime collaboration or presence (this is one user's own data).
- Syncing group mirrors (`sharedRooms`, `sharedSubmissions`) — those already
  live server-side and are re-fetched per device.
- Syncing derived state: streaks (recomputed from sessions), progress
  checkpoints (`zikrLastCount`), the in-flight round — all device-local.
- Settings sync (language/haptics are per-device preferences; revisit v2).
- Web upload/download of export files (manual `exportService` stays as the
  belt-and-braces backup).

## Privacy & threat model

The shipped anon key is public by design (`EXPOSURE-RULES.md` §0); a sync
feature multiplies what a hostile actor could enumerate — unless the payload
is ciphertext. Therefore:

- **End-to-end encryption.** AES-256-GCM via WebCrypto; the sync key never
  leaves the device (only its SHA-256 hash identifies the account server-
  side). Per-record rows are encrypted individually.
- The server sees: an opaque account id, opaque record ids, ciphertext,
  timestamps, sizes. No dzikr names, counts, or timestamps in plaintext.
- **Lost key is not a disaster but is unrecoverable server-side**: each
  device keeps full local data, so the key can be re-exported from any
  still-signed-in device; if ALL devices are lost, server data is
  undecryptable (accepted — same trade as the manual export file).

## Key decisions

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Sync key as identity** (no email/auth upgrade) | Keeps the loginless principle; pairing is "knowing the key". Supabase anonymous auth continues to provide the per-device JWT that the RPC surface already requires. |
| D2 | **E2E-encrypted rows**, account id = `sha256(syncKey)` | Privacy stance preserved; server stays a dumb, breach-proof store; no new PII on the server. |
| D3 | **Per-record sync, last-writer-wins** on `(updatedAt, deviceId)` | Data volumes are small (≈1 MB/yr); row-granular LWW merges cleanly with zero loss for append-mostly data (sessions) and rare concurrent edits (zikr/plan renames). |
| D4 | **`syncId` UUIDs alongside local numeric ids** | Dexie autoincrement ids collide across devices. Every syncable record gains an immutable `syncId` (uuid v4) at creation + one-time backfill (Dexie v7). Plans' `zikrIds` and all existing relations keep using local ids — sync maps `syncId ↔ local id` per device. |
| D5 | **Tombstones for deletes** | Zikrs already soft-delete (`deletedAt`); plans/sessions get tombstone rows so a delete on device A propagates instead of resurrecting on pull. |
| D6 | **Dexie middleware captures every write** to the four syncable tables into a push queue | "Every write syncs" enforced in exactly one place — new services can't forget it. (Alternative considered: explicit enqueue per service owner — more code paths, easy to miss one.) |
| D7 | **Polling, not Realtime** (same as rooms, D2 there) | Pull on app open, on tab becoming visible, after each push, and every 5 min in foreground. Trivial load on the free tier. |
| D8 | **2 new RPCs, following the exposure governance** | `sync_push` + `sync_pull` join the documented surface (13 → 15), with composite return types, machine guards, and harness tests — the full pipeline built in 1.4.0. |

## Server design (migration `0004_device_sync.sql` + canonical 0001)

Tables in `zikr_app` (RLS: rows are reachable only through the RPCs, which
run as invoker and re-check the account):

```sql
create table zikr_app.sync_records (
  account_id text        not null,   -- sha256(syncKey), base64url, 43 chars
  record_id  text        not null,   -- client uuid (syncId)
  kind       text        not null check (kind in ('session','zikr','plan','plan_owner','tombstone')),
  updated_at timestamptz not null,   -- client LWW stamp
  device_id  text        not null,   -- tiebreak + diagnostics only
  payload    text        not null,   -- AES-GCM ciphertext (base64)
  primary key (account_id, record_id)
);
create table zikr_app.sync_cursors (
  account_id text not null,
  device_id  text not null,
  pulled_at  timestamptz not null default now(),
  primary key (account_id, device_id)
);
```

RPCs in `public` (SECURITY INVOKER, anon JWT required, revoke-then-grant):

- `sync_push(p_account text, p_batch jsonb) returns json` — upsert ≤ 200
  ciphertext rows per call; returns the new server high-water mark.
- `sync_pull(p_account text, p_account_cursor …) returns sync_page_dto` —
  rows changed since the caller's cursor, cursor-paginated (same shape and
  pattern as `pull_verified_zikrs`), ≤ 200 ciphertext rows per page.

Size guards (constraint + server cap ≈ 16 KB/row) keep one user from
parking gigabytes; `purge_expired()` gains a tombstone sweep (e.g. > 180
days).

## Client architecture (mirrors the sharedRoom/zikrSync ports)

```
src/core/services/deviceSync/
├── contract.ts          # port: enable(key), disable, syncNow, status types
├── crypto.ts            # key → account id; AES-GCM encrypt/decrypt (WebCrypto)
├── syncKey.ts           # key generation (128-bit), display grouping, QR payload
├── supabaseBackend.ts   # the 2 RPCs via SupabaseRpc (machine-guarded)
├── mockBackend.ts       # reference/testing
└── service.ts           # merge engine + cursors + queue flush loop

src/core/stores/deviceSyncStore.ts   # enabled, status, lastSyncAt, error codes
```

- **Sync scope:** `sessions`, `zikrs`, `plans`, `planOwners` (§ Non-goals).
- **Push:** Dexie middleware watches the four tables → `deviceSync.pushQueue`
  (new Dexie table, v7 — `syncOutbox` is taken by sharedRoom). Flush is
  debounced (~3 s) + on `pagehide` + on pull.
- **Pull:** cursor per table stored in settings (pattern: `zikrSyncCursor`);
  decrypted rows merge by the rules below; local ids remapped via a
  `syncId → localId` table.
- **Merge rules:** same `syncId` → higher `(updatedAt, deviceId)` wins;
  missing `syncId` → insert (and adopt it); tombstone beats older live row;
  a local row newer than the pulled row is re-pushed (no ping-pong: stamps
  only move forward).
- **Startup:** `App.tsx` initializes the store when enabled; a stale/cleared
  anon session re-signs in anonymously (existing `ensureUserId` flow) — the
  sync key, not the anon uid, carries the account.

## UX flow (Settings → "Sync between devices")

1. **Enable** → generate key → show QR + grouped code (`ZIKR XXXX XXXX
   XXXX XXXX`) + copy button + the warning: *this key is your account —
   anyone with it can read your progress; we can't recover it*.
2. **Second device:** paste the code or scan the QR → immediate pull +
   merge → status line "Last synced 2 min ago" appears on all devices.
3. **Ongoing:** silent background sync; manual "Sync now" for reassurance.
4. **Disable:** stops syncing; offers "delete server copy" (purge by
   account) — local data is never touched by disable.
5. QR rendering via `qrcode-generator` (~4 KB gzipped — fits the 200 KB
   budget; camera *scanning* deferred: typed entry + copy/paste covers
   mobile↔PC where the QR is usually displayed on one and typed on the
   other).

## Rollout

| Milestone | Content | Gate |
|---|---|---|
| M1 Server | Migration 0004 + canonical 0001 additions, EXPOSURE-RULES 13→15, `gen:db-types`, machine guards, harness SQL tests | `npm run lint` + harness suite green |
| M2 Sync core | crypto, syncKey, Dexie v7 (syncId backfill, push queue), merge engine, store — behind `VITE_DEVICE_SYNC` flag | unit tests: crypto roundtrip, LWW/tombstone/insert merges, outbox flush |
| M3 UX | Settings section, QR/code pairing, status, disable/purge | manual 3-device matrix (mobile/PC/mobile profiles) |
| M4 Polish | pull cadence tuning, `track_event` sync telemetry (opt-in, no payload), docs + CHANGELOG | release checklist |

## Testing

- Unit: key derivation vectors, AES roundtrip + tamper rejection, merge
  table (all LWW/tombstone permutations), cursor pagination, push queue
  dedup/ordering.
- Harness (`supabase/local-test`): RPC authz (wrong account sees nothing),
  batch caps, size limits, cursor correctness — impersonated clients like
  `example.tests.sql`.
- Manual matrix: phone ↔ PC ↔ second phone with airplane-mode interleavings.

## Open decisions (need sign-off)

1. **E2E encryption confirmed?** Recommended yes (D2). The alternative —
   plaintext rows under anon-auth RLS — is simpler client-side but puts
   readable progress on the server and weakens the privacy story.
2. **Lost-key trade-off accepted?** Recommended yes (data also lives on
   each device; re-pair from any surviving device).
3. **Settings sync in v1?** Recommended no; v2 if asked for.
4. **Naming:** "Sync key" vs "Sync phrase" — wording for the UI.
