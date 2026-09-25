/**
 * Zikr Library Sync — backend contract (the port).
 *
 * Mirrors the sharedRoom contract pattern: everything the app knows about
 * the library-sync backend lives here; concrete backends (Supabase adapter,
 * mock) implement it. Swapping backends = another adapter + factory entry.
 * Wire shapes are hosted in ../supabaseTypes.ts (types only — the port
 * stays backend-agnostic) and aliased here under port names.
 */

import type { SupabaseSharedZikr } from '../supabaseTypes';

// ---------- Error taxonomy ----------

export type ZikrSyncErrorCode =
  | 'not-configured'
  | 'not-authenticated'
  | 'network'
  | 'duplicate-name'
  | 'invalid-input'
  | 'unknown';

export class ZikrSyncError extends Error {
  readonly code: ZikrSyncErrorCode;
  /** Permanent errors will never succeed on retry — dropped from the outbox. */
  readonly permanent: boolean;

  constructor(code: ZikrSyncErrorCode, message?: string) {
    super(message || code);
    this.name = 'ZikrSyncError';
    this.code = code;
    this.permanent = !['network', 'unknown', 'not-authenticated'].includes(code);
  }
}

// ---------- Payload shapes (transport-agnostic; dates as ISO strings) ----------

/** A verified zikr as delivered by the backend. */
export type RemoteZikr = SupabaseSharedZikr;

/** Opaque pagination cursor — pass back what the last page returned. */
export interface ZikrSyncCursor {
  updatedAt: string;
  id: string;
}

export interface PullVerifiedPage {
  items: RemoteZikr[];
  nextCursor: ZikrSyncCursor | null;
  hasMore: boolean;
}

/** A zikr this device wants to share (submitted unverified). */
export interface ShareZikrInput {
  name: string;
  arabicText?: string;
  translation?: string;
}

// ---------- The port ----------

export interface ZikrSyncBackend {
  /** Human-readable backend name (diagnostics). */
  readonly name: string;

  /** Whether the backend has everything it needs to operate. */
  isConfigured(): boolean;

  /** Ensure a stable no-login identity for this device; returns its uid. */
  ensureUserId(): Promise<string>;

  /**
   * Submit a zikr for review. Backends MUST reject duplicate names
   * (case-insensitive) with 'duplicate-name'.
   */
  shareZikr(input: ShareZikrInput): Promise<{ id: string }>;

  /**
   * Fetch the next page of verified zikrs strictly after `cursor`
   * (null = from the beginning). Page size is backend-defined (Supabase: 100).
   * `nextCursor` is the position of the last returned row — clients persist
   * it after every page, including the final one, so completed syncs don't
   * re-pull the same rows.
   */
  pullVerifiedZikrs(cursor: ZikrSyncCursor | null): Promise<PullVerifiedPage>;
}
