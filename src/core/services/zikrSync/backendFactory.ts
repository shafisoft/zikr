/**
 * Zikr library sync backend factory.
 *
 *   - VITE_SHARED_ROOMS_BACKEND=mock  → MockZikrSyncBackend (no network)
 *   - otherwise                        → SupabaseZikrSyncBackend
 *
 * Shares the env flag with shared rooms: both features talk to the same
 * Supabase project, so one switch controls the whole backend.
 */

import type { ZikrSyncBackend } from './contract';
import { SupabaseZikrSyncBackend } from './supabaseBackend';
import { MockZikrSyncBackend } from './mockBackend';

export function createZikrSyncBackend(): ZikrSyncBackend {
  const mode = import.meta.env.VITE_SHARED_ROOMS_BACKEND;
  if (mode === 'mock') {
    return new MockZikrSyncBackend();
  }
  return new SupabaseZikrSyncBackend();
}
