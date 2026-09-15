// Dexie v6 migration: goals → plans (+ user owner rows) and shared rooms →
// slim groups + one legacy plan each (+ group owner rows, backfilled
// submissions/outbox). The test builds a database at the OLD (v5) shape,
// reopens it with the real schema, and verifies the upgrade output.
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';

// Import AFTER fake-indexeddb so the singleton opens on the mock IDB.
import { db } from '../../../src/core/db/db';

/** The v5 schema — exactly what shipped before plans existed. */
const V5_STORES = {
  zikrs: '++id, name, custom, createdAt, deletedAt, remoteId',
  sessions: '++id, zikrId, date, editableUntil, [zikrId+date]',
  goals: '++id, status',
  streaks: 'zikrId',
  settings: 'key',
  sessionFormState: '++id, createdAt',
  zikrLastCount: 'zikrId, updatedAt',
  sharedRooms: 'code, status, endsAt',
  sharedSubmissions: '++id, roomCode, submittedAt, eventId',
  syncOutbox: '++id, nextAttemptAt, eventId',
  identity: 'userId',
  zikrShareOutbox: '++id, zikrId, nextAttemptAt',
};

async function buildV5Database() {
  const old = new Dexie('zikr-db');
  old.version(5).stores(V5_STORES);
  await old.open();
  return old;
}

beforeEach(async () => {
  await db.delete();
});

describe('v6 upgrade — personal goals become user-owned plans', () => {
  it('migrates goals to plans with resolved zikrs and a ("user","me") owner row', async () => {
    const old = await buildV5Database();
    await old.table('zikrs').bulkAdd([
      { id: 1, name: 'SubhanAllah', custom: false, createdAt: new Date(), arabicText: 'سبحان الله' },
      { id: 2, name: 'Alhamdulillah', custom: false, createdAt: new Date() },
    ]);
    await old.table('goals').bulkAdd([
      {
        id: 10,
        zikrIds: [1, 2],
        name: 'Morning Adhkar',
        target: 100,
        period: 'daily',
        status: 'active',
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 11,
        zikrIds: [1],
        target: 1000,
        period: 'custom',
        status: 'completed',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-31'),
        completedAt: new Date('2026-08-20'),
        createdAt: new Date('2026-07-30'),
      },
      // Unreachable goal (zikrs all deleted) is dropped, not migrated.
      { id: 12, zikrIds: [], target: 5, period: 'daily', status: 'active', createdAt: new Date() },
    ]);
    await old.table('sessions').add({
      zikrId: 1, count: 33, source: 'app', timestamp: new Date(), date: new Date(),
      editableUntil: new Date(), createdAt: new Date(), updatedAt: new Date(),
    });
    await old.close();

    await db.open();

    const plans = await db.plans.toArray();
    expect(plans).toHaveLength(2);

    const daily = plans.find((p) => p.title === 'Morning Adhkar')!;
    expect(daily.mode).toBe('combined');
    expect(daily.period).toBe('daily');
    expect(daily.target).toBe(100);
    expect(daily.status).toBe('active');
    expect(daily.zikrs.map((z) => z.name)).toEqual(['SubhanAllah', 'Alhamdulillah']);
    expect(daily.zikrs[0].zikrId).toBe(1);
    expect(daily.zikrs[0].arabic).toBe('سبحان الله');

    // 'custom' period → 'one-time' carrying its dates; completion stamps kept.
    const oneTime = plans.find((p) => p.target === 1000)!;
    expect(oneTime.period).toBe('one-time');
    expect(oneTime.startDate).toEqual(new Date('2026-08-01'));
    expect(oneTime.status).toBe('completed');
    expect(oneTime.completedAt).toBeTruthy();

    // Both plans are owned by the local user; the goals table is emptied.
    for (const plan of plans) {
      expect(await db.planOwners.get([plan.id, 'me'])).toEqual({
        planId: plan.id,
        ownerKind: 'user',
        ownerId: 'me',
      });
    }
    expect(await db.goals.count()).toBe(0);
    // Sessions untouched.
    expect(await db.sessions.count()).toBe(1);
  });
});

describe('v6 upgrade — shared rooms split into groups + plans', () => {
  it('moves the goal onto a plan with a ("group",code) owner row and slims the room', async () => {
    const old = await buildV5Database();
    await old.table('sharedRooms').bulkAdd([
      {
        code: 'ABC234',
        id: 'room-uuid-1',
        title: 'Family Khatma',
        zikrName: 'SubhanAllah',
        zikrArabic: 'سبحان الله',
        target: 1000,
        total: 320,
        startsAt: new Date('2026-09-01'),
        endsAt: new Date('2026-09-15'),
        ownerId: 'owner-uid',
        status: 'active',
        joinedAt: new Date('2026-09-01'),
        fetchedAt: new Date('2026-09-10'),
      },
      {
        code: 'XYZ789',
        id: 'room-uuid-2',
        title: 'Ended Room',
        zikrName: 'Astaghfirullah',
        zikrArabic: null,
        target: 100,
        total: 100,
        startsAt: new Date('2026-08-01'),
        endsAt: new Date('2026-08-10'),
        ownerId: 'owner-2',
        status: 'closed',
        joinedAt: new Date('2026-08-01'),
        fetchedAt: new Date('2026-08-10'),
      },
    ]);
    // A pending submission + a queued outbox item that must be backfilled.
    await old.table('sharedSubmissions').add({
      roomCode: 'ABC234',
      delta: 33,
      submittedAt: new Date(),
      eventId: 'evt-1',
      syncState: 'pending',
    });
    await old.table('syncOutbox').add({
      eventId: 'evt-1',
      roomCode: 'ABC234',
      delta: 33,
      attempts: 0,
      nextAttemptAt: new Date(),
      createdAt: new Date(),
    });
    await old.close();

    await db.open();

    // The room lost its goal fields.
    const room = await db.sharedRooms.get('ABC234');
    expect(room).toMatchObject({
      code: 'ABC234',
      id: 'room-uuid-1',
      title: 'Family Khatma',
      ownerId: 'owner-uid',
      status: 'active',
    });
    expect(Object.keys(room!)).not.toContain('zikrName');
    expect(Object.keys(room!)).not.toContain('target');
    expect(Object.keys(room!)).not.toContain('total');

    // Its plan carries the legacy goal, bound to the group.
    const plans = await db.plans.toArray();
    expect(plans).toHaveLength(2);

    const khatma = plans.find((p) => p.roomCode === 'ABC234')!;
    expect(khatma).toMatchObject({
      mode: 'combined',
      period: 'one-time',
      target: 1000,
      total: 320,
      status: 'active',
    });
    expect(khatma.zikrs[0]).toMatchObject({ name: 'SubhanAllah', arabic: 'سبحان الله', total: 320 });
    expect(await db.planOwners.get([khatma.id, 'ABC234'])).toEqual({
      planId: khatma.id,
      ownerKind: 'group',
      ownerId: 'ABC234',
    });

    // Closed rooms migrate identically (the group keeps its history).
    const ended = plans.find((p) => p.roomCode === 'XYZ789')!;
    expect(ended.total).toBe(100);

    // Pending rows were backfilled with the plan id + zikr name.
    const submission = (await db.sharedSubmissions.toArray())[0];
    expect(submission.planId).toBe(khatma.id);
    expect(submission.zikrName).toBe('SubhanAllah');
    const outboxItem = (await db.syncOutbox.toArray())[0];
    expect(outboxItem.planId).toBe(khatma.id);
    expect(outboxItem.zikrName).toBe('SubhanAllah');
  });
});

describe('v6 — fresh installs', () => {
  it('opens cleanly with empty plans/planOwners tables', async () => {
    await db.open();
    expect(await db.plans.count()).toBe(0);
    expect(await db.planOwners.count()).toBe(0);
    expect(await db.sharedRooms.count()).toBe(0);
    expect(await db.goals.count()).toBe(0);
  });
});
