/**
 * Routine Store (Zustand) — the live routine list + the only way UI mutates
 * routines (R2, §5.1 — mirror of planStore's shape). State refresh flows
 * back through the liveQuery subscription; actions just orchestrate the
 * service inside its Dexie transactions. Error CODES, never localized copy.
 */

import { create } from 'zustand';
import { Routine } from '../db/types';
import { createRetryableSubscription } from '../services/errorRecovery';
import { db } from '../db/db';
import * as routineService from '../services/routineService';
import type { RoutinePresetKey } from '../utils/routineUtils';

export type { RoutinePresetKey };

export interface RoutineDraftInput {
  title?: string;
  items: Array<{ zikrId: number; target: number }>;
}

interface RoutineState {
  /** Non-soft-deleted routines, creation order. */
  routines: Routine[];
  loading: boolean;
  error: string | null;
  initialize: () => () => void;
  // Write actions — every mutation goes through here, never the service
  // directly from UI and never db from UI (layer rule).
  createPreset: (key: RoutinePresetKey) => Promise<string>;
  createCustom: (draft: RoutineDraftInput) => Promise<string>;
  updateItems: (id: string, items: Array<{ zikrId: number; target: number }>, title?: string) => Promise<number>;
  softDelete: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
}

export const useRoutineStore = create<RoutineState>((set) => ({
  routines: [],
  loading: true,
  error: null,

  initialize: () => {
    const unsubscribe = createRetryableSubscription(
      () => db.routines.filter(routine => !routine.deletedAt).toArray(),
      (routines) => set({ routines, loading: false, error: null }),
      (_error) => set({
        // Error CODE, not localized copy — the component translates it.
        error: 'load-failed',
        loading: false
      })
    );
    return unsubscribe;
  },

  createPreset: (key) => routineService.createPreset(key),

  createCustom: (draft) => routineService.createCustom(draft),

  updateItems: (id, items, title) => routineService.updateItems(id, items, title),

  softDelete: (id) => routineService.softDelete(id),

  restore: (id) => routineService.restore(id),
}));
