import { create } from 'zustand';
import { db } from '../db/db';
import { Session, SessionUpdate } from '../db/types';
import { createRetryableSubscription } from '../services/errorRecovery';
import * as sessionService from '../services/sessionService';
import {
  recordCount,
  checkpointProgress,
  clearCheckpoint,
} from '../services/countRecorder';
import { useSettingsStore } from './settingsStore';

interface CurrentSession {
  zikrId: number | null;
  count: number;
}

// The unsaved round survives full reloads and app kills, not just in-app
// navigation — memory alone loses it whenever the OS discards the tab.
// A round abandoned longer than 48 hours is treated as finished.
const UNSAVED_ROUND_KEY = 'zikr-unsaved-round';
const UNSAVED_ROUND_MAX_AGE_MS = 48 * 60 * 60 * 1000;

interface PersistedUnsavedRound extends CurrentSession {
  savedAt: number;
}

function loadUnsavedRound(): CurrentSession {
  try {
    const raw = localStorage.getItem(UNSAVED_ROUND_KEY);
    if (!raw) return { zikrId: null, count: 0 };
    const parsed = JSON.parse(raw) as Partial<PersistedUnsavedRound>;
    const fresh =
      typeof parsed.savedAt === 'number' &&
      Date.now() - parsed.savedAt <= UNSAVED_ROUND_MAX_AGE_MS;
    if (!fresh || typeof parsed.count !== 'number' || parsed.count < 0) {
      return { zikrId: null, count: 0 };
    }
    return { zikrId: parsed.zikrId ?? null, count: parsed.count };
  } catch {
    return { zikrId: null, count: 0 };
  }
}

function saveUnsavedRound(session: CurrentSession): void {
  try {
    const persisted: PersistedUnsavedRound = { ...session, savedAt: Date.now() };
    localStorage.setItem(UNSAVED_ROUND_KEY, JSON.stringify(persisted));
  } catch {
    // Storage unavailable — the in-memory resume path still works.
  }
}

interface SessionState {
  sessions: Session[];
  currentSession: CurrentSession;
  /** Durable in-progress counts per zikr (zikrLastCount mirror) — the resume source. */
  checkpoints: Record<number, number>;
  loading: boolean;
  error: string | null;
  initialize: () => () => void;
  setCurrentSession: (session: CurrentSession) => void;
  clearCurrentSession: () => void;
  /** Auto-save the in-progress count (debounced in countRecorder). */
  checkpointProgress: (zikrId: number, count: number) => Promise<void>;
  /** The round saved or was reset: drop its checkpoint. */
  clearProgressCheckpoint: (zikrId: number) => Promise<void>;
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
  currentSession: loadUnsavedRound(),
  checkpoints: {},
  loading: true,
  error: null,

  initialize: () => {
    const unsubscribeSessions = createRetryableSubscription(
      () => db.sessions.toArray(),
      (sessions) => set({ sessions, loading: false, error: null }),
      (_error) => set({
        // Error CODE, not localized copy — translation happens at render.
        error: 'load-failed',
        loading: false
      })
    );

    // Progress checkpoints hydrate best-effort: a failed load leaves the
    // last known snapshot; it must not flip the sessions error state.
    const unsubscribeCheckpoints = createRetryableSubscription(
      () => db.zikrLastCount.toArray(),
      (rows) =>
        set({
          checkpoints: Object.fromEntries(rows.map(row => [row.zikrId, row.count])),
        }),
      (error) => console.error('[sessionStore] checkpoint load failed:', error)
    );

    return () => {
      unsubscribeSessions();
      unsubscribeCheckpoints();
    };
  },

  setCurrentSession: (session) => {
    saveUnsavedRound(session);
    set({ currentSession: session });
  },

  clearCurrentSession: () => {
    saveUnsavedRound({ zikrId: null, count: 0 });
    set({ currentSession: { zikrId: null, count: 0 } });
  },

  checkpointProgress: (zikrId, count) => checkpointProgress({ zikrId, count }),

  clearProgressCheckpoint: (zikrId) => clearCheckpoint(zikrId),

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
