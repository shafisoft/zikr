import { create } from 'zustand';
import { db } from '../db/db';
import { Session } from '../db/types';
import { createRetryableSubscription } from '../services/errorRecovery';

interface SessionGroup {
  title: string;
  sessions: Session[];
  count: number;
  expanded: boolean;
}

interface SessionHistoryState {
  sessions: Session[];
  groupedByDate: Record<string, SessionGroup>;
  loading: boolean;
  error: string | null;
  currentSubscription: (() => void) | null; // Track current subscription for cleanup

  // Actions
  loadSessions: () => Promise<void>;
  groupByDate: () => void;
  refresh: () => Promise<void>;
  toggleGroup: (groupKey: string) => void;
  cleanup: () => void; // Add cleanup action
}

export const useSessionHistoryStore = create<SessionHistoryState>((set, get) => ({
  sessions: [],
  groupedByDate: {},
  loading: true,
  error: null,
  currentSubscription: null, // Initialize with null

  loadSessions: async () => {
    // Clean up existing subscription before creating new one
    const existing = get().currentSubscription;
    if (existing) {
      existing();
    }

    const unsubscribe = createRetryableSubscription(
      () => db.sessions
        .orderBy('timestamp')
        .reverse()
        .toArray(),
      (sessions) => {
        set({ sessions, loading: false, error: null });
        get().groupByDate();
      },
      (_error) => set({
        error: 'Failed to load sessions. Please check browser storage permissions.',
        loading: false
      })
    );

    // Store the unsubscribe function for cleanup
    set({ currentSubscription: unsubscribe });
  },

  groupByDate: () => {
    const sessions = get().sessions;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    // Titles are i18n KEYS — the component translates at render time so
    // buckets follow the active language (stores hold no localized copy).
    const groups: Record<string, SessionGroup> = {
      today: { title: 'history.bucketToday', sessions: [], count: 0, expanded: true },  // Default expanded (review feedback)
      yesterday: { title: 'history.bucketYesterday', sessions: [], count: 0, expanded: false },
      thisWeek: { title: 'history.bucketThisWeek', sessions: [], count: 0, expanded: false },
      older: { title: 'history.bucketOlder', sessions: [], count: 0, expanded: false }
    };

    sessions.forEach(session => {
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
    });

    // Update counts
    Object.keys(groups).forEach(key => {
      groups[key].count = groups[key].sessions.length;
    });

    set({ groupedByDate: groups });
  },

  refresh: async () => {
    await get().loadSessions();
  },

  toggleGroup: (groupKey: string) => {
    const groups = { ...get().groupedByDate };
    if (groups[groupKey]) {
      groups[groupKey].expanded = !groups[groupKey].expanded;
      set({ groupedByDate: groups });
    }
  },

  cleanup: () => {
    const existing = get().currentSubscription;
    if (existing) {
      existing();
      set({ currentSubscription: null });
    }
  }
}));