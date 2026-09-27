// Round-trip test for backup restore (remediation 1.1, ENG-F1): JSON has no
// Date type, so importData must rehydrate the allowlisted fields or every
// date comparison (streak days, edit window, plan windows) silently breaks.
// Runs the REAL export → serialize-to-disk-shape → import path against
// fake-indexeddb.
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';

import { db } from '../../../src/core/db/db';
import { buildExportData, importData } from '../../../src/core/services/exportService';
import { streakService } from '../../../src/core/services/streakService';
import { todayTotal, totalDhikr, planRingProgress } from '../../../src/core/utils/metrics';

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await db.delete();
  await db.open();
});

async function seed(): Promise<void> {
  const created = new Date('2026-01-05T10:00:00.000Z');
  const added = await db.zikrs.add({
    name: 'SubhanAllah',
    custom: false,
    createdAt: created,
    arabicText: 'سُبْحَانَ ٱللَّٰهِ',
  });
  const zikrId = typeof added === 'number' ? added : Number(added);
  await db.zikrs.update(zikrId, { pulledAt: new Date('2026-02-01T09:30:00.000Z') });

  const midnight = new Date('2026-03-10T00:00:00');
  const when = new Date('2026-03-10T07:15:00');
  await db.sessions.add({
    zikrId,
    count: 33,
    source: 'app',
    timestamp: when,
    date: midnight,
    editableUntil: new Date(when.getTime() + 3 * DAY_MS),
    createdAt: when,
    updatedAt: when,
    countsToGoals: true,
  });

  const planId = 'plan-round-trip-1';
  await db.plans.add({
    id: planId,
    title: 'Round trip',
    mode: 'per-zikr',
    period: 'one-time',
    zikrs: [{ zikrId, name: 'SubhanAllah', target: 100 }],
    startDate: new Date('2026-03-01T00:00:00'),
    endDate: new Date('2026-04-01T23:59:59'),
    status: 'active',
    createdAt: created,
  });
  await db.planOwners.add({ planId, ownerKind: 'user', ownerId: 'me' });

  await db.streaks.add({
    zikrId,
    currentStreak: 2,
    longestStreak: 5,
    lastProcessedDate: midnight,
  });

  await db.settings.bulkAdd([
    // Contract: the sync cursor is passed verbatim to an RPC — updatedAt is
    // and must remain a plain string (zikrSync/contract.ts).
    { key: 'zikrSyncCursor', value: { updatedAt: '2026-02-28T12:00:00.000Z', id: 'abc' } },
    { key: 'hapticsEnabled', value: true },
  ]);
}

/** Flatten an export through JSON and restore it into an emptied database. */
async function restoreFromDiskShape(): Promise<void> {
  const json = JSON.stringify(await buildExportData());
  await db.delete();
  await db.open();
  await importData(new File([json], 'zikr-backup.json', { type: 'application/json' }));
}

describe('export → import round trip (Date rehydration)', () => {
  it('restores Date instances with equal values and leaves the cursor a string', async () => {
    await seed();
    await restoreFromDiskShape();

    const [zikr] = await db.zikrs.toArray();
    expect(zikr.createdAt).toBeInstanceOf(Date);
    expect(zikr.createdAt.toISOString()).toBe('2026-01-05T10:00:00.000Z');
    expect(zikr.pulledAt).toBeInstanceOf(Date);
    expect(zikr.pulledAt!.toISOString()).toBe('2026-02-01T09:30:00.000Z');

    const [session] = await db.sessions.toArray();
    expect(session.timestamp).toBeInstanceOf(Date);
    expect(session.date).toBeInstanceOf(Date);
    expect(session.editableUntil).toBeInstanceOf(Date);
    expect(session.createdAt).toBeInstanceOf(Date);
    expect(session.updatedAt).toBeInstanceOf(Date);
    expect(session.date.toISOString()).toBe(new Date('2026-03-10T00:00:00').toISOString());
    expect(session.timestamp.toISOString()).toBe(new Date('2026-03-10T07:15:00').toISOString());

    const [plan] = await db.plans.toArray();
    expect(plan.startDate).toBeInstanceOf(Date);
    expect(plan.endDate).toBeInstanceOf(Date);
    expect(plan.startDate!.toISOString()).toBe(new Date('2026-03-01T00:00:00').toISOString());
    expect(plan.endDate!.toISOString()).toBe(new Date('2026-04-01T23:59:59').toISOString());

    const [streak] = await db.streaks.toArray();
    expect(streak.lastProcessedDate).toBeInstanceOf(Date);
    expect(streak.lastProcessedDate.toISOString()).toBe(
      new Date('2026-03-10T00:00:00').toISOString()
    );

    const cursorRow = await db.settings.get('zikrSyncCursor');
    expect(cursorRow?.value).toEqual({ updatedAt: '2026-02-28T12:00:00.000Z', id: 'abc' });
    expect(typeof cursorRow?.value.updatedAt).toBe('string');

    // Non-date settings survive untouched.
    expect((await db.settings.get('hapticsEnabled'))?.value).toBe(true);
  });

  it('feeds streak recalculation and metrics without throwing after a restore', async () => {
    await seed();
    const beforeSessions = await db.sessions.toArray();
    const totalBefore = totalDhikr(beforeSessions);
    await restoreFromDiskShape();

    const sessions = await db.sessions.toArray();
    // Metrics read session.date directly — raw strings would corrupt these.
    expect(totalDhikr(sessions)).toBe(totalBefore);
    expect(todayTotal(sessions)).toBe(todayTotal(beforeSessions));

    const [plan] = await db.plans.toArray();
    expect(() => planRingProgress([plan], sessions)).not.toThrow();

    // Streak recalculation reads lastProcessedDate / session.date.
    const [session] = sessions;
    const [zikr] = await db.zikrs.toArray();
    await expect(
      streakService.updateStreak(zikr.id!, session.date)
    ).resolves.toMatchObject({ zikrId: zikr.id });
    const stored = await db.streaks.get(zikr.id!);
    expect(stored?.lastProcessedDate).toBeInstanceOf(Date);
  });

  it('round-trips routines: schedule, items, soft-delete and Date fields', async () => {
    await seed();
    const [zikr] = await db.zikrs.toArray();
    await db.routines.bulkAdd([
      {
        id: 'routine-preset-1',
        source: 'preset',
        presetKey: 'night',
        schedule: { part: 'night' },
        items: [
          { zikrId: zikr.id!, name: 'SubhanAllah', target: 33 },
          { zikrId: 9999, name: 'Ayat al-Kursi', target: 1 },
        ],
        createdAt: new Date('2026-03-01T20:00:00.000Z'),
      },
      {
        id: 'routine-custom-1',
        source: 'custom',
        title: 'After Fajr personal',
        items: [{ zikrId: zikr.id!, name: 'SubhanAllah', target: 100 }],
        createdAt: new Date('2026-03-02T05:30:00.000Z'),
      },
      {
        id: 'routine-deleted-1',
        source: 'custom',
        title: 'Retired routine',
        items: [{ zikrId: zikr.id!, name: 'SubhanAllah', target: 10 }],
        createdAt: new Date('2026-03-03T05:30:00.000Z'),
        deletedAt: new Date('2026-03-04T05:30:00.000Z'),
      },
    ]);
    await restoreFromDiskShape();

    const byId = new Map((await db.routines.toArray()).map(r => [r.id, r]));
    // A deleted preset row must survive the restore — it records the user's
    // "never re-offer this preset" dismissal (ensurePresets respects it).
    expect(byId.size).toBe(3);

    const preset = byId.get('routine-preset-1');
    expect(preset?.presetKey).toBe('night');
    expect(preset?.schedule).toEqual({ part: 'night' });
    expect(preset?.items).toEqual([
      { zikrId: zikr.id, name: 'SubhanAllah', target: 33 },
      { zikrId: 9999, name: 'Ayat al-Kursi', target: 1 },
    ]);
    expect(preset?.createdAt).toBeInstanceOf(Date);
    expect(preset?.createdAt.toISOString()).toBe('2026-03-01T20:00:00.000Z');

    const custom = byId.get('routine-custom-1');
    expect(custom?.title).toBe('After Fajr personal');
    expect(custom?.schedule).toBeUndefined();
    expect(custom?.createdAt).toBeInstanceOf(Date);

    const deleted = byId.get('routine-deleted-1');
    expect(deleted?.deletedAt).toBeInstanceOf(Date);
    expect(deleted?.deletedAt!.toISOString()).toBe('2026-03-04T05:30:00.000Z');
  });
});
