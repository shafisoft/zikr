import { create } from 'zustand';
import { db } from '../db/db';
import { Session } from '../db/types';
import { createRetryableSubscription } from '../services/errorRecovery';

interface SessionHistoryState {
  sessions: Session[];
  loading: boolean;
  error: string | null;
  currentSubscription: (() => void) | null; // Track current subscription for cleanup

  // Actions
  loadSessions: () => Promise<void>;
  refresh: () => Promise<void>;
  cleanup: () => void;
}

/**
 * Raw session data only — bucketing is a display derivation owned by
 * core/utils/historyGrouping (the component derives it via useMemo), and
 * expand/collapse is component state. Keeping both out of the store means
 * a newly recorded session can never reset what the user has expanded.
 */
export const useSessionHistoryStore = create<SessionHistoryState>((set, get) => ({
  sessions: [],
  loading: true,
  error: null,
  currentSubscription: null,

  loadSessions: async () => {
    // Clean up existing subscription before creating new one
    const existing = get().currentSubscription;
    if (existing) {
      existing();
    }

    const unsubscribe = createRetryableSubscription(
      // No orderBy('timestamp') here — the schema has no timestamp index, so
      // ordering must happen in memory after the plain toArray().
      () => db.sessions.toArray(),
      (sessions) => {
        sessions.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        set({ sessions, loading: false, error: null });
      },
      (_error) => set({
        // Error CODE, not localized copy — the component translates it.
        error: 'load-failed',
        loading: false
      })
    );

    // Store the unsubscribe function for cleanup
    set({ currentSubscription: unsubscribe });
  },

  refresh: async () => {
    await get().loadSessions();
  },

  cleanup: () => {
    const existing = get().currentSubscription;
    if (existing) {
      existing();
      set({ currentSubscription: null });
    }
  }
}));
