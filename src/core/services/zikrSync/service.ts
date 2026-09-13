/**
 * Zikr Sync Service — local-first orchestration for the shared zikr library.
 *
 * Depends ONLY on the ZikrSyncBackend contract, never a concrete backend.
 *
 * Push: sharing is requested at zikr creation ("share with others"). The
 * push is attempted immediately; transient failures land in zikrShareOutbox
 * and are retried by the background flusher (same outbox semantics as
 * sharedRoom: backoff, 20 attempts max, permanent errors dropped).
 *
 * Pull: manual (Library sync button). Pages through pullVerifiedZikrs from
 * the stored cursor, upserts each batch (by remoteId, then by name), and
 * persists the cursor only after every batch landed — a failed sync restarts
 * from the last known-good point. Admin edits re-deliver because verification
 * and edits bump updated_at past the cursor.
 */

import { db } from '../../db/db';
import { Zikr, ZikrShareOutboxItem } from '../../db/types';
import { backoffDelayMs } from '../../utils/sharedRoomUtils';
import {
  PullVerifiedPage,
  ShareZikrInput,
  ZikrSyncBackend,
  ZikrSyncCursor,
  ZikrSyncError,
} from './contract';

const CURSOR_SETTING_KEY = 'zikrSyncCursor';
const MAX_ATTEMPTS = 20;

export interface LibrarySyncResult {
  added: number;
  updated: number;
}

export interface ZikrShareFlushResult {
  applied: number;
  failed: number;
  deferred: number;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

async function readCursor(): Promise<ZikrSyncCursor | null> {
  const row = await db.settings.get(CURSOR_SETTING_KEY);
  if (!row?.value?.updatedAt || !row?.value?.id) return null;
  return row.value as ZikrSyncCursor;
}

async function writeCursor(cursor: ZikrSyncCursor): Promise<void> {
  await db.settings.put({ key: CURSOR_SETTING_KEY, value: cursor });
}

/** Apply one pull page to the local zikr table. One batch = one transaction. */
async function upsertBatch(page: PullVerifiedPage): Promise<LibrarySyncResult> {
  let added = 0;
  let updated = 0;

  await db.transaction('rw', db.zikrs, async () => {
    const byRemote = new Map<string, Zikr>();
    const byName = new Map<string, Zikr>();
    for (const z of await db.zikrs.toArray()) {
      if (z.remoteId) byRemote.set(z.remoteId, z);
      if (!z.deletedAt) byName.set(normalizeName(z.name), z);
    }

    const pulledAt = new Date();
    for (const item of page.items) {
      const fields = {
        name: item.name,
        nameBn: item.nameBn ?? undefined,
        arabicText: item.arabicText ?? undefined,
        translation: item.translation ?? undefined,
        translationBn: item.translationBn ?? undefined,
        remoteId: item.id,
        pulledAt,
      };

      const byRemoteMatch = byRemote.get(item.id);
      const byNameMatch = byName.get(normalizeName(item.name));
      const target = byRemoteMatch ?? byNameMatch;

      if (target) {
        await db.zikrs.update(target.id!, fields);
        // Keep the indexes coherent for later items in the same batch.
        if (!byRemoteMatch && target.remoteId !== item.id) byRemote.delete(target.remoteId!);
        byRemote.set(item.id, { ...target, ...fields });
        byName.set(normalizeName(item.name), { ...target, ...fields });
        updated++;
      } else {
        const id = await db.zikrs.add({
          custom: false,
          createdAt: pulledAt,
          ...fields,
        });
        byRemote.set(item.id, { id, ...fields } as Zikr);
        byName.set(normalizeName(item.name), { id, ...fields } as Zikr);
        added++;
      }
    }
  });

  return { added, updated };
}

export function createZikrSyncService(backend: ZikrSyncBackend) {
  let flushPromise: Promise<ZikrShareFlushResult> | null = null;
  let librarySyncPromise: Promise<LibrarySyncResult> | null = null;

  async function pushShare(item: ZikrShareOutboxItem): Promise<string> {
    const input: ShareZikrInput = {
      name: item.name,
      arabicText: item.arabicText || undefined,
      translation: item.translation || undefined,
    };
    const { id } = await backend.shareZikr(input);
    // Record the server id so a later pull recognizes this zikr once verified.
    await db.zikrs.update(item.zikrId, { remoteId: id });
    return id;
  }

  return {
    readonlyBackendName: backend.name,

    /** Whether the backend has everything it needs to operate. */
    isConfigured(): boolean {
      return backend.isConfigured();
    },

    /**
     * Share a freshly created zikr (creation-time push, per the design:
     * edits after creation are never synced). The local row is marked
     * sharedAt immediately; delivery is retried via the outbox on failure,
     * so this never throws for network reasons.
     */
    async shareZikr(zikr: Pick<Zikr, 'id' | 'name' | 'arabicText' | 'translation'>): Promise<void> {
      if (!zikr.id) return;
      if (!backend.isConfigured()) return;

      const item: ZikrShareOutboxItem = {
        zikrId: zikr.id,
        name: zikr.name,
        arabicText: zikr.arabicText,
        translation: zikr.translation,
        attempts: 0,
        nextAttemptAt: new Date(),
        createdAt: new Date(),
      };

      await db.transaction('rw', db.zikrs, db.zikrShareOutbox, async () => {
        await db.zikrs.update(zikr.id!, { sharedAt: new Date() });
        await db.zikrShareOutbox.add(item);
      });

      // Fire-and-forget first attempt; the outbox owns delivery.
      void this.flushShareOutbox();
    },

    /**
     * Retry pending share pushes. Single-flight; mirrors sharedRoom's
     * outbox semantics (permanent failures and attempts >= 20 are dropped).
     */
    flushShareOutbox(): Promise<ZikrShareFlushResult> {
      if (flushPromise) return flushPromise;
      flushPromise = (async () => {
        const result: ZikrShareFlushResult = { applied: 0, failed: 0, deferred: 0 };
        if (!backend.isConfigured()) {
          result.deferred = await db.zikrShareOutbox.count();
          return result;
        }

        const now = new Date();
        const due = await db.zikrShareOutbox
          .where('nextAttemptAt')
          .belowOrEqual(now)
          .sortBy('createdAt');

        for (const item of due) {
          try {
            await pushShare(item);
            await db.zikrShareOutbox.delete(item.id!);
            result.applied++;
          } catch (err) {
            const zse = err instanceof ZikrSyncError ? err : new ZikrSyncError('unknown');
            const attempts = item.attempts + 1;

            if (zse.permanent || attempts >= MAX_ATTEMPTS) {
              // Drop the share but keep the zikr local — sharing failed, the
              // zikr itself is unaffected.
              await db.zikrShareOutbox.delete(item.id!);
              await db.zikrs.update(item.zikrId, { sharedAt: undefined });
              result.failed++;
            } else {
              await db.zikrShareOutbox.update(item.id!, {
                attempts,
                nextAttemptAt: new Date(Date.now() + backoffDelayMs(attempts)),
              });
              result.deferred++;
            }
          }
        }
        return result;
      })().finally(() => {
        flushPromise = null;
      });
      return flushPromise;
    },

    /**
     * Pull verified zikrs into the local library (Library sync button).
     * Pages through the backend from the stored cursor; the cursor is
     * persisted only after all batches landed. Single-flight.
     */
    syncLibrary(): Promise<LibrarySyncResult> {
      if (librarySyncPromise) return librarySyncPromise;
      librarySyncPromise = (async () => {
        const total: LibrarySyncResult = { added: 0, updated: 0 };
        if (!backend.isConfigured()) return total;

        await backend.ensureUserId();

        let cursor = await readCursor();
        let guard = 0;
        // Batches loop; the guard bounds a pathological cursor regression.
        while (guard++ < 1000) {
          const page = await backend.pullVerifiedZikrs(cursor);
          if (page.items.length > 0) {
            const batchResult = await upsertBatch(page);
            total.added += batchResult.added;
            total.updated += batchResult.updated;
          }
          // Advance past everything consumed — including the final page —
          // so the next sync starts where this one ended.
          if (page.nextCursor) cursor = page.nextCursor;
          if (!page.hasMore) break;
        }

        if (cursor) await writeCursor(cursor);
        return total;
      })().finally(() => {
        librarySyncPromise = null;
      });
      return librarySyncPromise;
    },
  };
}

export type ZikrSyncService = ReturnType<typeof createZikrSyncService>;
