/**
 * Overall streak — the single source of truth for the "N Day Streak" number
 * shown on Home and Progress.
 *
 * A streak is consecutive calendar days with at least one session (any zikr).
 * Grace rule: if today has no session yet, the streak counts from yesterday —
 * a streak only breaks when a full day passes without practice, not because
 * the user hasn't opened the app yet today.
 */

import { formatDate, getToday } from './dateUtils';

/** Unique, normalized session dates (any order; duplicates allowed). */
export function calculateOverallStreak(sessionDates: Date[]): number {
  const daySet = new Set(sessionDates.map(d => formatDate(d)));
  const cursor = getToday();

  if (!daySet.has(formatDate(cursor))) {
    cursor.setDate(cursor.getDate() - 1); // today not practiced yet — don't break the streak
  }
  let streak = 0;
  while (daySet.has(formatDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
