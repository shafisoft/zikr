import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../src/core/db/db';
import { createZikrSyncService } from '../../../src/core/services/zikrSync/service';
import {
  ZikrSyncBackend,
  PullVerifiedPage,
  RemoteZikr,
  ZikrSyncCursor,
  ZikrSyncError,
} from '../../../src/core/services/zikrSync/contract';

// ---------- helpers ----------

let isoCounter = 0;

function makeRemote(overrides: Partial<RemoteZikr> = {}): RemoteZikr {
  const n = ++isoCounter;
  return {
    id: `remote-${n}`,
    name: `Zikr ${n}`,
    nameBn: null,
    arabicText: `عربي ${n}`,
    translation: `Meaning ${n}`,
    translationBn: null,
    updatedAt: new Date(2026, 0, 1, 0, 0, n).toISOString(), // strictly increasing
    ...overrides,
  };
}

interface BackendScript {
  pages: PullVerifiedPage[];
  shareBehavior?: (name: string) => Promise<{ id: string }>;
}

function makeBackend(script: BackendScript) {
  const shared: Array<{ name: string; id: string }> = [];
  let pageIndex = 0;
  const backend: ZikrSyncBackend = {
    name: 'test-double',
    isConfigured: () => true,
    ensureUserId: async () => 'uid-1',
    shareZikr: async input => {
      if (script.shareBehavior) return script.shareBehavior(input.name);
      const row = { name: input.name, id: `server-${shared.length + 1}` };
      shared.push(row);
      return { id: row.id };
    },
    pullVerifiedZikrs: async (cursor: ZikrSyncCursor | null) => {
      if (!script.pages.length) return { items: [], nextCursor: null, hasMore: false };
      if (!cursor) pageIndex = 0;
      else if (pageIndex < script.pages.length - 1) pageIndex++;
      return script.pages[pageIndex];
    },
  };
  return { backend, shared };
}

function pageOf(items: RemoteZikr[], hasMore: boolean): PullVerifiedPage {
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: last ? { updatedAt: last.updatedAt, id: last.id } : null,
    hasMore,
  };
}

async function addZikr(name: string, extra: Partial<Parameters<typeof db.zikrs.add>[0]> = {}) {
  const id = await db.zikrs.add({
    name,
    custom: true,
    createdAt: new Date(),
    ...extra,
  });
  return id as number;
}

beforeEach(async () => {
  await Promise.all([
    db.zikrs.clear(),
    db.settings.clear(),
    db.zikrShareOutbox.clear(),
  ]);
});

// ---------- pull ----------

describe('zikrSyncService — syncLibrary', () => {
  it('inserts verified zikrs and paginates through all pages', async () => {
    const a = makeRemote();
    const b = makeRemote();
    const c = makeRemote();
    const { backend } = makeBackend({
      pages: [pageOf([a, b], true), pageOf([c], false)],
    });
    const service = createZikrSyncService(backend);

    const result = await service.syncLibrary();

    expect(result).toEqual({ added: 3, updated: 0 });
    const names = (await db.zikrs.toArray()).map(z => z.name).sort();
    expect(names).toEqual([a.name, b.name, c.name].sort());
    for (const z of await db.zikrs.toArray()) {
      expect(z.remoteId).toMatch(/^remote-/);
      expect(z.pulledAt).toBeInstanceOf(Date);
      expect(z.custom).toBe(false);
    }
  });

  it('persists the cursor only after every page landed', async () => {
    const a = makeRemote();
    const failing: ZikrSyncBackend = {
      name: 'failing',
      isConfigured: () => true,
      ensureUserId: async () => 'uid-1',
      shareZikr: async () => ({ id: 'x' }),
      pullVerifiedZikrs: async (cursor) => {
        if (!cursor) return pageOf([a], true);
        throw new ZikrSyncError('network');
      },
    };

    await expect(createZikrSyncService(failing).syncLibrary()).rejects.toThrow();
    expect(await db.settings.get('zikrSyncCursor')).toBeUndefined();
  });

  it('reuses the stored cursor for incremental syncs', async () => {
    const old = makeRemote();
    const fresh = makeRemote();
    const requestedCursors: Array<ZikrSyncCursor | null> = [];
    const { backend } = makeBackend({
      pages: [pageOf([old], false), pageOf([fresh], false)],
    });
    const wrapped: ZikrSyncBackend = {
      ...backend,
      pullVerifiedZikrs: async cursor => {
        requestedCursors.push(cursor);
        return backend.pullVerifiedZikrs(cursor);
      },
    };
    const service = createZikrSyncService(wrapped);

    await service.syncLibrary(); // consumes page 1
    const cursor = await db.settings.get('zikrSyncCursor');
    expect(cursor?.value).toEqual({ updatedAt: old.updatedAt, id: old.id });

    const result = await service.syncLibrary();
    expect(requestedCursors[1]).toEqual({ updatedAt: old.updatedAt, id: old.id });
    expect(result.added).toBe(1); // only the fresh item
  });

  it('updates an existing zikr matched by remoteId with the remote fields', async () => {
    const remote = makeRemote({ name: 'Updated Name', translation: 'Fixed by admin' });
    const id = await addZikr('Original Name', { remoteId: remote.id });
    const { backend } = makeBackend({ pages: [pageOf([remote], false)] });

    const result = await createZikrSyncService(backend).syncLibrary();

    expect(result).toEqual({ added: 0, updated: 1 });
    const zikr = await db.zikrs.get(id);
    expect(zikr?.name).toBe('Updated Name');
    expect(zikr?.translation).toBe('Fixed by admin');
  });

  it('attaches remoteId to a live zikr matched by name (case-insensitive)', async () => {
    const remote = makeRemote({ name: 'My Zikr' });
    const id = await addZikr('  my zikr ');
    const { backend } = makeBackend({ pages: [pageOf([remote], false)] });

    const result = await createZikrSyncService(backend).syncLibrary();

    expect(result).toEqual({ added: 0, updated: 1 });
    const zikr = await db.zikrs.get(id);
    expect(zikr?.remoteId).toBe(remote.id);
    expect(zikr?.name).toBe('My Zikr'); // remote spelling wins
  });

  it('ignores a soft-deleted zikr when matching by name', async () => {
    const remote = makeRemote({ name: 'My Zikr' });
    await addZikr('My Zikr', { deletedAt: new Date() });
    const { backend } = makeBackend({ pages: [pageOf([remote], false)] });

    const result = await createZikrSyncService(backend).syncLibrary();

    expect(result.added).toBe(1); // inserted, not resurrected the deleted row
    const live = (await db.zikrs.toArray()).filter(z => !z.deletedAt);
    expect(live).toHaveLength(1);
    expect(live[0].remoteId).toBe(remote.id);
  });
});

// ---------- push ----------

describe('zikrSyncService — shareZikr', () => {
  it('pushes immediately and records remoteId + sharedAt', async () => {
    const { backend, shared } = makeBackend({ pages: [] });
    const service = createZikrSyncService(backend);
    const id = await addZikr('Morning Adhkar', { arabicText: 'أذكار', translation: 'Morning remembrance' });

    await service.shareZikr({
      id,
      name: 'Morning Adhkar',
      arabicText: 'أذكار',
      translation: 'Morning remembrance',
    });
    await service.flushShareOutbox(); // await the background push deterministically

    expect(shared).toEqual([{ name: 'Morning Adhkar', id: 'server-1' }]);
    const zikr = await db.zikrs.get(id);
    expect(zikr?.remoteId).toBe('server-1');
    expect(zikr?.sharedAt).toBeInstanceOf(Date);
    expect(await db.zikrShareOutbox.count()).toBe(0);
  });

  it('queues in the outbox and retries with backoff on network failure', async () => {
    let calls = 0;
    const { backend } = makeBackend({
      pages: [],
      shareBehavior: async () => {
        calls++;
        if (calls < 2) throw new ZikrSyncError('network');
        return { id: 'server-late' };
      },
    });
    const service = createZikrSyncService(backend);
    const id = await addZikr('Patient Zikr');

    await service.shareZikr({ id, name: 'Patient Zikr' });
    await service.flushShareOutbox(); // first attempt fails
    expect(await db.zikrShareOutbox.count()).toBe(1);

    // Make the retry due immediately instead of waiting for the backoff.
    await db.zikrShareOutbox.toCollection().modify({ nextAttemptAt: new Date() });
    await service.flushShareOutbox();

    expect(calls).toBe(2);
    expect(await db.zikrShareOutbox.count()).toBe(0);
    expect((await db.zikrs.get(id))?.remoteId).toBe('server-late');
  });

  it('drops the share permanently on a permanent error (duplicate name)', async () => {
    const { backend } = makeBackend({
      pages: [],
      shareBehavior: async () => {
        throw new ZikrSyncError('duplicate-name');
      },
    });
    const service = createZikrSyncService(backend);
    const id = await addZikr('Taken Name');

    await service.shareZikr({ id, name: 'Taken Name' });
    await service.flushShareOutbox();

    expect(await db.zikrShareOutbox.count()).toBe(0); // dropped, not retried
    const zikr = await db.zikrs.get(id);
    expect(zikr?.sharedAt).toBeUndefined(); // share rolled back, zikr intact
    expect(zikr?.name).toBe('Taken Name');
  });
});
