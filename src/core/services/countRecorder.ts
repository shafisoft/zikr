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

import { DayPart, PostSalahPrayer, Session } from '../db/types';
import { db } from '../db/db';
import { add as addSession } from './sessionService';
import { sharedRoomService } from './sharedRoom';
import { dayPartOfTime } from '../utils/routineUtils';

const EDIT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export interface RecordCountResult {
  /** The saved session row (id included) — Undo deletes exactly this. */
  session: Session;
  /**
   * True when the count actually reached at least one group plan. The
   * counter's Undo toast must withhold undo for shared rounds — the server
   * total cannot be retracted here (remediation 1.2c).
   */
  propagated: boolean;
}

export async function recordCount(input: {
  zikrId: number;
  /** Zikr display name — required for room propagation; omit to skip rooms. */
  zikrName?: string;
  count: number;
  /**
   * Guided routine-flow attribution — written onto the session so the
   * routine's day-state counts it and sibling routines don't.
   */
  routineId?: string;
  /**
   * The part of day the count belongs to; derived from the clock when
   * omitted (every counter path), so unattributed sessions scope to
   * matching scheduled routines (sessionCountsTowardRoutine).
   */
  dayPart?: DayPart;
  /**
   * Guided post-salah-flow attribution (the prayer whose set this run is).
   * After-salah completion counts ONLY these attributed sessions — see
   * attributedCounts in prayerTimes.ts.
   */
  postSalah?: PostSalahPrayer;
  /** Resolves the countsToGoalsAndGroups setting (default true). */
  countsToGoalsResolver?: () => boolean | undefined;
}): Promise<RecordCountResult> {
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
    routineId: input.routineId,
    dayPart: input.dayPart ?? dayPartOfTime(now),
    postSalah: input.postSalah,
  };
  const id = await addSession(session);
  const saved = { ...session, id } as Session;

  // Best-effort: the same count also goes to every joined active room
  // counting this zikr, unless the user turned that behaviour off.
  // Propagation is awaited inside the save, so its real outcome is known
  // here and surfaced to the UI (previously the result was discarded).
  let propagated = false;
  if (countsToGoals && input.zikrName) {
    try {
      propagated = (await sharedRoomService.propagateToRooms(input.zikrName, input.count)) > 0;
    } catch {
      // rooms are best-effort; the session itself is already saved
    }
  }
  return { session: saved, propagated };
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
