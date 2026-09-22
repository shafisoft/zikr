import { db } from '../db/db';
import { Streak, Session } from '../db/types';
import { formatDate, daysBetween } from '../utils/dateUtils';

export async function getStreak(zikrId: number): Promise<Streak | undefined> {
  return await db.streaks.get(zikrId);
}

export async function getAllStreaks(): Promise<Streak[]> {
  return await db.streaks.toArray();
}

export async function updateStreak(zikrId: number, sessionDate: Date): Promise<Streak> {
  const existing = await getStreak(zikrId);
  const sessionDateFormatted = formatDate(sessionDate);

  // A backdated entry (manual entry accepts arbitrary past dates) must not
  // rewind lastProcessedDate — the next session would read that rewind as a
  // break and zero a real streak. Rebuild from all sessions instead.
  if (existing && daysBetween(existing.lastProcessedDate, sessionDate) < 0) {
    return recalculateStreak(zikrId);
  }
  let currentStreak = existing?.currentStreak || 0;
  let longestStreak = existing?.longestStreak || 0;
  let lastProcessedDate = existing?.lastProcessedDate || new Date(0);

  const lastProcessedFormatted = formatDate(lastProcessedDate);
  const daysSince = daysBetween(lastProcessedDate, sessionDate);

  if (sessionDateFormatted !== lastProcessedFormatted) {
    if (daysSince > 1) {
      currentStreak = 0;
    } else if (daysSince === 1) {
      currentStreak++;
    }

    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }

    lastProcessedDate = sessionDate;
  }

  const streak: Streak = {
    zikrId,
    currentStreak,
    longestStreak,
    lastProcessedDate
  };

  await db.streaks.put(streak);
  return streak;
}

// NEW (v2): Update streak for session changes
export async function updateForSession(
  session: Session,
  operation: 'add' | 'update' | 'delete',
  oldValue?: Session
): Promise<void> {
  // For add and update operations, use the session date
  if (operation === 'add' || operation === 'update') {
    await updateStreak(session.zikrId, session.timestamp);
    // oldValue is logged but not used in current implementation
    if (operation === 'update' && oldValue) {
      console.log('Session updated from', oldValue.timestamp, 'to', session.timestamp);
    }
  }
  // For delete operations, need to recalculate from scratch
  else if (operation === 'delete') {
    await recalculateStreak(session.zikrId);
  }
}

// NEW (v2): Recalculate streak from all sessions (for delete operations
// and backdated entries) — returns the rebuilt streak.
async function recalculateStreak(zikrId: number): Promise<Streak> {
  const sessions = await db.sessions
    .where('zikrId')
    .equals(zikrId)
    .toArray();

  if (sessions.length === 0) {
    const empty: Streak = {
      zikrId,
      currentStreak: 0,
      longestStreak: 0,
      lastProcessedDate: new Date(0)
    };
    await db.streaks.put(empty);
    return empty;
  }

  // Sort sessions by date ascending
  sessions.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  let currentStreak = 1;
  let longestStreak = 1;
  let lastProcessedDate = sessions[0].timestamp;

  // Calculate streak from all sessions
  for (let i = 1; i < sessions.length; i++) {
    const daysSince = daysBetween(lastProcessedDate, sessions[i].timestamp);

    if (daysSince === 1) {
      currentStreak++;
    } else if (daysSince > 1) {
      currentStreak = 1; // Reset streak
    }

    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }

    lastProcessedDate = sessions[i].timestamp;
  }

  const streak: Streak = {
    zikrId,
    currentStreak,
    longestStreak,
    lastProcessedDate
  };

  await db.streaks.put(streak);
  return streak;
}

export async function resetStreak(zikrId: number): Promise<void> {
  const streak: Streak = {
    zikrId,
    currentStreak: 0,
    longestStreak: 0,
    lastProcessedDate: new Date(0)
  };

  await db.streaks.put(streak);
}

export const streakService = {
  getStreak,
  getAllStreaks,
  updateStreak,
  updateForSession,
  resetStreak
};
