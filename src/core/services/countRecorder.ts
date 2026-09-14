/**
 * Count recorder — the single owner of "a counter session happened".
 *
 * Both counter surfaces (full-screen page and room modal) funnel through
 * recordCount(), which owns the business rules that used to live inside the
 * CounterSession UI component: the 3-day edit window, the counts-toward-
 * goals-and-rooms default, and best-effort room propagation. The session
 * write itself stays in sessionService (streak/goal recalculation included).
 */

import { Session } from '../db/types';
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
