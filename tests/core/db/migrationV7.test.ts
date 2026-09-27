// Dexie v7 migration: ROUTINES (R2). Purely additive — the upgrade test
// builds a database at the OLD (v6) shape with data in every prior store,
// reopens it with the real schema, and verifies the new `routines` table
// exists (empty, indexed, queryable) while every old row is intact.
//
// As-built note: the design's "v8" number assumed remediation 5.1 ships
// first; it does not, so routines take v7 (strictly sequential, additive
// migrations only — the §2.2 invariant, never a fixed feature number).
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

// Import AFTER fake-indexeddb so the singleton opens on the mock IDB.
import { db } from '../../../src/core/db/db';

/** The v6 schema — exactly what shipped before routines existed. */
const V6_STORES = {
  zikrs: '++id, name, custom, createdAt, deletedAt, remoteId',
  sessions: '++id, zikrId, date, editableUntil, [zikrId+date]',
  goals: '++id, status',
  plans: 'id, status',
  planOwners: '[planId+ownerId], planId, ownerId',
  streaks: 'zikrId',
  settings: 'key',
  sessionFormState: '++id, createdAt',
  zikrLastCount: 'zikrId, updatedAt',
  sharedRooms: 'code, status',
  sharedSubmissions: '++id, roomCode, submittedAt, eventId',
  syncOutbox: '++id, nextAttemptAt, eventId',
  identity: 'userId',
  zikrShareOutbox: '++id, zikrId, nextAttemptAt',
};

async function buildV6Database() {
  const old = new Dexie('zikr-db');
  old.version(6).stores(V6_STORES);
  await old.open();
  return old;
}

beforeEach(async () => {
  await db.delete();
});

describe('v7 upgrade — routines table is purely additive', () => {
  it('upgrades a populated v6 database: routines present and empty, old data intact', async () => {
    const old = await buildV6Database();
    await old.table('zikrs').bulkAdd([
      { id: 1, name: 'SubhanAllah', custom: false, createdAt: new Date(), defaultTarget: 33 },
      { id: 2, name: 'Alhamdulillah', custom: false, createdAt: new Date(), defaultTarget: 33 },
    ]);
    await old.table('plans').bulkAdd([
      {
        id: 'plan-1',
        title: 'Daily dhikr',
        mode: 'combined',
        period: 'daily',
        target: 100,
        zikrs: [{ zikrId: 1, name: 'SubhanAllah', arabic: null }],
        status: 'active',
        createdAt: new Date('2026-01-01'),
      },
    ]);
    await old.table('planOwners').bulkAdd([
      { planId: 'plan-1', ownerKind: 'user', ownerId: 'me' },
    ]);
    await old.table('sessions').add({
      zikrId: 1, count: 33, source: 'app', timestamp: new Date(), date: new Date(),
      editableUntil: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });
    await old.table('settings').add({ key: 'hapticsEnabled', value: true });
    await old.table('zikrLastCount').add({ zikrId: 1, count: 12, updatedAt: new Date() });
    await old.table('sharedRooms').add({
      code: 'ABC234',
      id: 'room-uuid-1',
      title: 'Family Khatma',
      ownerId: 'owner-uid',
      status: 'active',
      joinedAt: new Date(),
      fetchedAt: new Date(),
    });
    await old.close();

    await db.open();

    // The new table exists, is empty, and its indexes work.
    expect(await db.routines.count()).toBe(0);
    await db.routines.bulkPut([
      {
        id: 'routine-smoke',
        source: 'preset',
        presetKey: 'morning',
        items: [{ zikrId: 1, name: 'SubhanAllah', target: 33 }],
        createdAt: new Date('2026-09-20'),
      },
      {
        id: 'routine-deleted',
        source: 'custom',
        title: 'Old one',
        items: [{ zikrId: 2, name: 'Alhamdulillah', target: 33 }],
        createdAt: new Date('2026-09-19'),
        deletedAt: new Date('2026-09-21'),
      },
    ]);
    expect(await db.routines.get('routine-smoke')).toBeTruthy();
    // The declared indexes (deletedAt, createdAt) both serve queries.
    expect(await db.routines.where('deletedAt').above(new Date(0)).count()).toBe(1);
    expect(
      await db.routines.where('createdAt').above(new Date('2026-09-19T12:00')).count()
    ).toBe(1);

    // Every prior store kept its data, byte for byte in the ways that matter.
    expect(await db.zikrs.count()).toBe(2);
    expect((await db.zikrs.get(1))?.name).toBe('SubhanAllah');
    expect(await db.plans.count()).toBe(1);
    expect((await db.plans.get('plan-1'))?.title).toBe('Daily dhikr');
    expect(await db.planOwners.get(['plan-1', 'me'])).toEqual({
      planId: 'plan-1',
      ownerKind: 'user',
      ownerId: 'me',
    });
    expect(await db.sessions.count()).toBe(1);
    expect((await db.settings.get('hapticsEnabled'))?.value).toBe(true);
    expect((await db.zikrLastCount.get(1))?.count).toBe(12);
    expect((await db.sharedRooms.get('ABC234'))?.title).toBe('Family Khatma');
  });

  it('fresh installs open cleanly with an empty routines table', async () => {
    await db.open();
    expect(await db.routines.count()).toBe(0);
    // No upgrade ran anything: the smoke row of the previous test is gone.
    expect(await db.routines.get('routine-smoke')).toBeUndefined();
  });
});
