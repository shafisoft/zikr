import { create } from 'zustand';
import { db } from '../db/db';
import { Zikr } from '../db/types';
import { createRetryableSubscription } from '../services/errorRecovery';
import * as zikrService from '../services/zikrService';
import { zikrSyncService } from '../services/zikrSync';
import type { LibrarySyncResult } from '../services/zikrSync';

export interface LibrarySyncStatus {
  isSyncing: boolean;
  /** Last completed sync's result, or an error marker for the banner. */
  lastResult: LibrarySyncResult | 'error' | null;
}

interface ZikrState extends LibrarySyncStatus {
  zikrs: Zikr[];
  loading: boolean;
  error: string | null;
  initialize: () => () => void;
  // Write actions — the only way UI mutates zikrs. State refresh flows back
  // through the liveQuery subscription; actions just orchestrate services.
  addZikr: (zikr: Omit<Zikr, 'id'> & { shareWithOthers?: boolean }) => Promise<number>;
  updateZikr: (id: number, patch: Partial<Zikr>) => Promise<number>;
  softDeleteZikr: (id: number) => Promise<void>;
  syncLibrary: () => Promise<LibrarySyncResult | 'error'>;
}

export const useZikrStore = create<ZikrState>((set) => ({
  zikrs: [],
  loading: true,
  error: null,
  isSyncing: false,
  lastResult: null,

  initialize: () => {
    const unsubscribe = createRetryableSubscription(
      // Soft-deleted zikrs (deletedAt set in Settings) stay in the DB for
      // their sessions' history but must not appear anywhere in the UI.
      () => db.zikrs.filter(zikr => !zikr.deletedAt).toArray(),
      (zikrs) => set({ zikrs, loading: false, error: null }),
      (_error) => set({
        // Error CODE, not localized copy — the component translates it.
        error: 'load-failed',
        loading: false
      })
    );

    return unsubscribe;
  },

  addZikr: async (zikr) => {
    const { shareWithOthers, ...record } = zikr;
    const id = await zikrService.add(record);
    if (shareWithOthers && record.custom) {
      // Fire-and-forget share; the zikrSync outbox owns delivery.
      void zikrSyncService.shareZikr({ id, ...record }).catch(() => {});
    }
    return id;
  },

  updateZikr: (id, patch) => zikrService.update(id, patch),

  softDeleteZikr: (id) => zikrService.softDelete(id),

  syncLibrary: async () => {
    set({ isSyncing: true });
    try {
      const result = await zikrSyncService.syncLibrary();
      set({ isSyncing: false, lastResult: result });
      return result;
    } catch (err) {
      console.error('Library sync failed:', err);
      set({ isSyncing: false, lastResult: 'error' });
      return 'error' as const;
    }
  },
}));
