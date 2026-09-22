/**
 * Session-history bucketing — a pure display derivation (today / yesterday /
 * this week / older). Titles are i18n KEYS; the component translates them at
 * render. Expand/collapse is UI state and lives with the component, so a new
 * session arriving can never collapse a group the user opened.
 */

import { Session } from '../db/types';

export interface SessionGroup {
  title: string;
  sessions: Session[];
  count: number;
}

export function groupSessionsByDate(
  sessions: Session[],
  now: Date = new Date()
): Record<string, SessionGroup> {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const thisWeek = new Date(today);
  thisWeek.setDate(thisWeek.getDate() - 7);

  const groups: Record<string, SessionGroup> = {
    today: { title: 'history.bucketToday', sessions: [], count: 0 },
    yesterday: { title: 'history.bucketYesterday', sessions: [], count: 0 },
    thisWeek: { title: 'history.bucketThisWeek', sessions: [], count: 0 },
    older: { title: 'history.bucketOlder', sessions: [], count: 0 },
  };

  for (const session of sessions) {
    const sessionDate = new Date(session.timestamp);
    if (sessionDate >= today) {
      groups.today.sessions.push(session);
    } else if (sessionDate >= yesterday) {
      groups.yesterday.sessions.push(session);
    } else if (sessionDate >= thisWeek) {
      groups.thisWeek.sessions.push(session);
    } else {
      groups.older.sessions.push(session);
    }
  }

  for (const key of Object.keys(groups)) {
    groups[key].count = groups[key].sessions.length;
  }

  return groups;
}
