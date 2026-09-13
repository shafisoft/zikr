/**
 * Zikr Library Sync — public surface.
 *
 * The app (pages, forms) imports from this module only. Concrete backends
 * live behind the ZikrSyncBackend contract (see ./contract.ts):
 *   - supabaseBackend.ts — production adapter
 *   - mockBackend.ts     — dumb in-memory backend for tests / offline demos
 */

export { ZikrSyncError } from './contract';
export type {
  ZikrSyncErrorCode,
  ZikrSyncBackend,
  ZikrSyncCursor,
  RemoteZikr,
  PullVerifiedPage,
  ShareZikrInput,
} from './contract';
export { createZikrSyncService } from './service';
export type {
  ZikrSyncService,
  LibrarySyncResult,
  ZikrShareFlushResult,
} from './service';
export { SupabaseZikrSyncBackend } from './supabaseBackend';
export { MockZikrSyncBackend } from './mockBackend';
export { createZikrSyncBackend } from './backendFactory';
export { zikrSyncService, default } from './instance';
