/**
 * Count recorder — the single owner of "a counter session happened".
 *
 * Both counter surfaces (full-screen page and room modal) funnel through
 * recordCount(), which owns the business rules that used to live inside the
 * CounterSession UI component: the 3-day edit window, the counts-toward-
 * goals-and-rooms default, and best-effort room propagation. The session
 * write itself stays in sessionService (streak/goal recalculation included).
 *
 * It also owns progress checkpoints: an unfinished round is auto-saved to
 * the durable zikrLastCount table as it counts (debounced per zikr), so
 * the counter can resume where it left off even after the tab is evicted
 * or the app is killed. A round that actually saves clears its checkpoint.
 */

import { Session } from '../db/types';
import { db } from '../db/db';
import { add as addSession } from './sessionService';
import { sharedRoomService } from './sharedRoom';

const EDIT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export async function recordCount(input: {
  zikrId: number;
  /** Zikr display name — required for room propagation; omit to skip rooms. */
  zikrName?: string;
  count: number;
  /** Resolves the countsToGoalsAndGroups setting (default true). */
  countsToGoalsResolver?: () => boolean | undefined;
}): Promise<Session> {
  const countsToGoals = input.countsToGoalsResolver?.() ?? true;
  const now = new Date();

  const session: Omit<Session, 'id'> = {
    zikrId: input.zikrId,
    count: input.count,
    source: 'app',
    timestamp: now,
    date: now,
    editableUntil: new Date(now.getTime() + EDIT_WINDOW_MS),
    createdAt: now,
    updatedAt: now,
    countsToGoals,
  };
  await addSession(session);

  // Best-effort: the same count also goes to every joined active room
  // counting this zikr, unless the user turned that behaviour off.
  if (countsToGoals && input.zikrName) {
    try {
      await sharedRoomService.propagateToRooms(input.zikrName, input.count);
    } catch {
      // rooms are best-effort; the session itself is already saved
    }
  }
  return session as Session;
}

// ---------- Progress checkpoints (the durable "where you left off") ----------

const CHECKPOINT_DEBOUNCE_MS = 1000;

const pendingCheckpoints = new Map<number, ReturnType<typeof setTimeout>>();

/**
 * Auto-save the in-progress count for a zikr (debounced — one write per
 * burst of taps, not one per tap). Count 0 (fresh round, reset of an
 * unsaved base) clears immediately so a killed app can never resurrect a
 * count the user already threw away.
 */
export async function checkpointProgress(input: {
  zikrId: number;
  count: number;
}): Promise<void> {
  const { zikrId, count } = input;
  const pending = pendingCheckpoints.get(zikrId);
  if (pending) clearTimeout(pending);

  if (count <= 0) {
    pendingCheckpoints.delete(zikrId);
    await db.zikrLastCount.delete(zikrId);
    return;
  }

  pendingCheckpoints.set(
    zikrId,
    setTimeout(() => {
      pendingCheckpoints.delete(zikrId);
      void db.zikrLastCount.put({ zikrId, count, updatedAt: new Date() });
    }, CHECKPOINT_DEBOUNCE_MS)
  );
}

/**
 * The round saved (or was discarded): drop its checkpoint, including any
 * write still waiting on the debounce — a late write must not resurrect
 * progress that recordCount just persisted.
 */
export async function clearCheckpoint(zikrId: number): Promise<void> {
  const pending = pendingCheckpoints.get(zikrId);
  if (pending) {
    clearTimeout(pending);
    pendingCheckpoints.delete(zikrId);
  }
  await db.zikrLastCount.delete(zikrId);
}

export const countRecorder = { recordCount, checkpointProgress, clearCheckpoint };
