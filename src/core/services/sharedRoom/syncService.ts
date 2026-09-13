/**
 * Shared Room Sync — background delivery + refresh.
 *
 * - Flushes the outbox on app focus and when connectivity returns.
 * - While a room screen is open (visible + foreground), refreshes its state
 *   every 60s so the combined total stays near-live. Polling, not Realtime:
 *   see docs/SharedGoals-Design.md.
 *
 * Started once (idempotent); the active room code is set by the store.
 * Also flushes the zikr library share outbox (same cadence) so pending
 * "share with others" pushes eventually deliver after a network failure.
 */

import { sharedRoomService } from './instance';
import { zikrSyncService } from '../zikrSync';

const POLL_INTERVAL_MS = 60_000;

let started = false;
let activeRoomCode: string | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;

  void sharedRoomService.flushOutbox().catch(() => {});
  void zikrSyncService.flushShareOutbox().catch(() => {});

  if (activeRoomCode) {
    sharedRoomService.refreshRoom(activeRoomCode).catch(() => {});
  }
}

export function setActiveRoom(code: string | null) {
  activeRoomCode = code && code.trim() ? code.trim().toUpperCase() : null;
}

export function ensureSharedRoomSync() {
  if (started || typeof window === 'undefined') return;
  started = true;

  // Deliver queued contributions when connectivity returns.
  window.addEventListener('online', () => {
    void sharedRoomService.flushOutbox().catch(() => {});
    void zikrSyncService.flushShareOutbox().catch(() => {});
  });

  // Flush when the app regains focus.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void sharedRoomService.flushOutbox().catch(() => {});
      void zikrSyncService.flushShareOutbox().catch(() => {});
    }
  });

  timer = setInterval(tick, POLL_INTERVAL_MS);
}

/** Test hook / teardown. */
export function stopSharedRoomSync() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
  activeRoomCode = null;
}
