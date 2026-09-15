/**
 * Shared Rooms — public surface.
 *
 * The app (stores, pages) imports from this module only. Concrete backends
 * live behind the SharedRoomBackend contract (see ./contract.ts):
 *   - supabaseBackend.ts — production adapter (the only Supabase-aware file)
 *   - mockBackend.ts     — dumb in-memory backend for tests / offline demos
 * Swap or test backends without touching anything above this layer.
 */

export { SharedRoomError } from './contract';
export type {
  SharedRoomErrorCode,
  SharedRoomBackend,
  CreatePlanInput,
  CreateRoomInput,
  PlanSummary,
  PlanZikrSummary,
  PlanModeDTO,
  PlanPeriodDTO,
  RoomStatePayload,
  RoomSummary,
  RoomMemberPayload,
} from './contract';
export { createSharedRoomService } from './service';
export type { SharedRoomService, FlushResult } from './service';
export { SupabaseSharedRoomBackend } from './supabaseBackend';
export { MockSharedRoomBackend } from './mockBackend';
export { createSharedRoomBackend } from './backendFactory';
export { sharedRoomService, default } from './instance';
export { setActiveRoom, ensureSharedRoomSync, stopSharedRoomSync } from './syncService';
