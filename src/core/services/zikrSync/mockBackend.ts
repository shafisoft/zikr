/**
 * Dumb backend for zikr library sync.
 *
 * Same two uses as sharedRoom's mock: deterministic unit tests, and running
 * the UI with no Supabase (VITE_SHARED_ROOMS_BACKEND=mock). Implements the
 * real contract rules — duplicate-name rejection, verification gate, cursor
 * pagination (page size 2 so tests exercise multi-page pulls cheaply).
 */

import { ZikrSyncError } from './contract';
import type {
  PullVerifiedPage,
  RemoteZikr,
  ShareZikrInput,
  ZikrSyncBackend,
  ZikrSyncCursor,
} from './contract';

const PAGE_SIZE = 2;

interface MockRow extends RemoteZikr {
  verified: boolean;
}

export class MockZikrSyncBackend implements ZikrSyncBackend {
  readonly name = 'mock';

  private rows: MockRow[] = [];
  private counter = 0;
  private currentUserId: string | null = null;

  reset(): void {
    this.rows = [];
    this.counter = 0;
    this.currentUserId = null;
  }

  /** Test helper: mark rows verified (simulates the admin review). */
  verifyAll(): void {
    for (const row of this.rows) {
      row.verified = true;
    }
  }

  get submittedCount(): number {
    return this.rows.length;
  }

  async ensureUserId(): Promise<string> {
    if (!this.currentUserId) this.currentUserId = `mock-user-${++this.counter}`;
    return this.currentUserId;
  }

  isConfigured(): boolean {
    return true;
  }

  async shareZikr(input: ShareZikrInput): Promise<{ id: string }> {
    const name = input.name.trim().toLowerCase();
    if (!name) throw new ZikrSyncError('invalid-input');
    if (this.rows.some(r => r.name.trim().toLowerCase() === name)) {
      throw new ZikrSyncError('duplicate-name');
    }
    const row: MockRow = {
      id: `mock-zikr-${++this.counter}`,
      name: input.name.trim(),
      nameBn: null,
      arabicText: input.arabicText ?? null,
      translation: input.translation ?? null,
      translationBn: null,
      updatedAt: new Date().toISOString(),
      verified: false,
    };
    this.rows.push(row);
    return { id: row.id };
  }

  async pullVerifiedZikrs(cursor: ZikrSyncCursor | null): Promise<PullVerifiedPage> {
    const verified = this.rows
      .filter(r => r.verified)
      .sort((a, b) =>
        a.updatedAt === b.updatedAt ? a.id.localeCompare(b.id) : a.updatedAt.localeCompare(b.updatedAt)
      )
      .filter(r => {
        if (!cursor) return true;
        const afterTime = r.updatedAt > cursor.updatedAt;
        const tie = r.updatedAt === cursor.updatedAt && r.id > cursor.id;
        return afterTime || tie;
      });

    const page = verified.slice(0, PAGE_SIZE);
    const hasMore = verified.length > PAGE_SIZE;
    const last = page[page.length - 1];
    return {
      items: page.map(({ verified: _v, ...item }) => item),
      nextCursor: last ? { updatedAt: last.updatedAt, id: last.id } : null,
      hasMore,
    };
  }
}
