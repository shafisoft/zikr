import { create } from 'zustand';
import { db } from '../db/db';
import { Session, SessionUpdate } from '../db/types';
import { createRetryableSubscription } from '../services/errorRecovery';
import * as sessionService from '../services/sessionService';
import { recordCount } from '../services/countRecorder';
import { useSettingsStore } from './settingsStore';

interface CurrentSession {
  zikrId: number | null;
  count: number;
}

interface SessionState {
  sessions: Session[];
  currentSession: CurrentSession;
  loading: boolean;
  error: string | null;
  initialize: () => () => void;
  setCurrentSession: (session: CurrentSession) => void;
  clearCurrentSession: () => void;
  // Write actions — the only way UI mutates sessions. State refresh flows
  // back through the liveQuery subscription; actions just orchestrate.
  saveSession: (session: Omit<Session, 'id'>) => Promise<number>;
  updateSession: (id: number, update: SessionUpdate) => Promise<number>;
  deleteSession: (id: number) => Promise<void>;
  /**
   * Record a counter round: the 3-day edit window, counts-toward-goals
   * default, and best-effort room propagation live in countRecorder.
   */
  recordCount: (input: { zikrId: number; zikrName?: string; count: number }) => Promise<Session>;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSession: { zikrId: null, count: 0 },
  loading: true,
  error: null,

  initialize: () => {
    const unsubscribe = createRetryableSubscription(
      () => db.sessions.toArray(),
      (sessions) => set({ sessions, loading: false, error: null }),
      (_error) => set({
        error: 'Failed to load sessions. Please check browser storage permissions.',
        loading: false
      })
    );

    return unsubscribe;
  },

  setCurrentSession: (session) => set({ currentSession: session }),

  clearCurrentSession: () => set({ currentSession: { zikrId: null, count: 0 } }),

  saveSession: (session) => sessionService.add(session),

  updateSession: (id, update) => sessionService.updateSession(id, update),

  deleteSession: (id) => sessionService.deleteSession(id),

  recordCount: (input) =>
    recordCount({
      ...input,
      countsToGoalsResolver: () =>
        useSettingsStore.getState().settings.countToGoalsAndGroups ?? true,
    }),
}));
