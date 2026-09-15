// DB-backed tests for the plan business rules that touch IndexedDB.
// fake-indexeddb provides an in-memory IndexedDB implementation, so these
// run the real Dexie schema (created directly at the latest version).
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';

import { db } from '../../../src/core/db/db';
import { planService } from '../../../src/core/services/planService';
import { zikrService } from '../../../src/core/services/zikrService';
import { Plan, Session } from '../../../src/core/db/types';

async function seedSession(zikrId: number, count: number, date = new Date()): Promise<Session> {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  const id = await db.sessions.add({
    zikrId,
    count,
    source: 'app',
    timestamp: date,
    date: midnight,
    editableUntil: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return (await db.sessions.get(id))!;
}

function makePlan(overrides: Partial<Plan> = {}): Omit<Plan, 'id'> {
  return {
    mode: 'combined',
    zikrs: [{ zikrId: 1, name: 'SubhanAllah' }],
    target: 10,
    period: 'daily',
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('zikrService.add — duplicate guard', () => {
  it('rejects an exact duplicate name', async () => {
    await zikrService.add({ name: 'SubhanAllah', custom: false, createdAt: new Date() });
    await expect(
      zikrService.add({ name: 'SubhanAllah', custom: false, createdAt: new Date() })
    ).rejects.toThrow('DUPLICATE_ZIKR');
  });

  it('rejects case/whitespace variants of an existing name', async () => {
    await zikrService.add({ name: 'My Zikr', custom: true, createdAt: new Date() });
    await expect(
      zikrService.add({ name: '  my zikr ', custom: true, createdAt: new Date() })
    ).rejects.toThrow('DUPLICATE_ZIKR');
  });

  it('allows reusing the name of a soft-deleted zikr', async () => {
    const zikr = await zikrService.add({ name: 'Old Name', custom: true, createdAt: new Date() });
    await zikrService.softDelete(zikr);
    const id = await zikrService.add({ name: 'Old Name', custom: true, createdAt: new Date() });
    expect(id).toBeGreaterThan(0);
  });
});

describe('planService — multi-zikr plans', () => {
  it('writes the plan plus its user owner row on add', async () => {
    const id = await planService.add(makePlan());
    expect(await db.plans.get(id)).toMatchObject({ id, target: 10 });
    expect(await db.planOwners.get([id, 'me'])).toEqual({
      planId: id,
      ownerKind: 'user',
      ownerId: 'me',
    });
  });

  it('finds plans by any zikr they cover', async () => {
    await planService.add(makePlan({
      zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }],
    }));
    await planService.add(makePlan({ zikrs: [{ zikrId: 3, name: 'C' }] }));

    const forOne = await planService.getPlansByZikr(1);
    const forThree = await planService.getPlansByZikr(3);
    const forFour = await planService.getPlansByZikr(4);

    expect(forOne).toHaveLength(1);
    expect(forOne[0].zikrs.map(z => z.zikrId)).toEqual([1, 2]);
    expect(forThree).toHaveLength(1);
    expect(forFour).toHaveLength(0);
  });

  it('getUserPlans returns only user-owned plans (not group mirrors)', async () => {
    await planService.add(makePlan({ target: 10 }));
    // Simulate a group mirror: plan + ('group', code) owner row.
    const mirror: Plan = { ...makePlan(), id: 'mirror-1', roomCode: 'ABC234', total: 5 };
    await db.plans.put(mirror);
    await db.planOwners.put({ planId: 'mirror-1', ownerKind: 'group', ownerId: 'ABC234' });

    const mine = await planService.getUserPlans();
    expect(mine).toHaveLength(1);
    expect(mine[0].id).not.toBe('mirror-1');
  });

  it('deletes owner rows along with the plan', async () => {
    const id = await planService.add(makePlan());
    await planService.delete(id);
    expect(await db.plans.get(id)).toBeUndefined();
    expect(await db.planOwners.get([id, 'me'])).toBeUndefined();
  });

  it('completes a multi-zikr combined plan when counts reach the target', async () => {
    const id = await planService.add(makePlan({
      zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }],
      target: 10,
    }));
    await seedSession(1, 6);
    await seedSession(2, 4);

    // A session on either covered zikr triggers the recalculation
    const latest = await seedSession(2, 1);
    await planService.recalculatePlansForSession(latest, 'add');

    const plan = await db.plans.get(id);
    expect(plan?.status).toBe('completed');
    expect(plan?.completedAt).toBeTruthy();
  });

  it('completes a per-zikr plan only when EVERY zikr reaches its target', async () => {
    const id = await planService.add(makePlan({
      mode: 'per-zikr',
      target: undefined,
      zikrs: [
        { zikrId: 1, name: 'A', target: 10 },
        { zikrId: 2, name: 'B', target: 10 },
      ],
    }));
    await seedSession(1, 10);
    const partial = await seedSession(2, 5);
    await planService.recalculatePlansForSession(partial, 'add');
    expect((await db.plans.get(id))?.status).toBe('active');

    const rest = await seedSession(2, 5);
    await planService.recalculatePlansForSession(rest, 'add');
    expect((await db.plans.get(id))?.status).toBe('completed');
  });

  it('reactivates a completed plan when progress falls back below target', async () => {
    const id = await planService.add(makePlan({
      zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }],
      target: 10,
    }));
    await seedSession(1, 6);
    const second = await seedSession(2, 5);
    await db.plans.update(id, { status: 'completed', completedAt: new Date() });

    // An edit/deletion drops progress to 6/10 — plan must reactivate
    await db.sessions.delete(second.id!);
    await planService.recalculatePlansForSession(second, 'delete');

    const plan = await db.plans.get(id);
    expect(plan?.status).toBe('active');
    expect(plan?.completedAt).toBeUndefined();
  });
});

describe('zikrService.hardDelete — multi-zikr plan handling', () => {
  it('removes the zikr from a multi-zikr plan without deleting the plan', async () => {
    const id = await planService.add(makePlan({
      zikrs: [{ zikrId: 1, name: 'A' }, { zikrId: 2, name: 'B' }],
    }));
    await db.zikrs.add({ id: 1, name: 'A', custom: false, createdAt: new Date() });
    await db.zikrs.add({ id: 2, name: 'B', custom: false, createdAt: new Date() });

    await zikrService.hardDelete(1);

    const plan = await db.plans.get(id);
    expect(plan).toBeTruthy();
    expect(plan!.zikrs.map(z => z.zikrId)).toEqual([2]);
  });

  it('deletes a plan that only covered the removed zikr (and its owner row)', async () => {
    const id = await planService.add(makePlan({ zikrs: [{ zikrId: 1, name: 'A' }] }));
    await db.zikrs.add({ id: 1, name: 'A', custom: false, createdAt: new Date() });

    await zikrService.hardDelete(1);

    expect(await db.plans.get(id)).toBeUndefined();
    expect(await db.planOwners.get([id, 'me'])).toBeUndefined();
    expect(await db.zikrs.get(1)).toBeUndefined();
  });

  it('never touches group plans (zikrs are name-bound, not id-bound)', async () => {
    const mirror: Plan = {
      ...makePlan(),
      id: 'mirror-1',
      roomCode: 'ABC234',
      zikrs: [{ name: 'A', total: 0 }], // no zikrId
    };
    await db.plans.put(mirror);
    await db.planOwners.put({ planId: 'mirror-1', ownerKind: 'group', ownerId: 'ABC234' });
    await db.zikrs.add({ id: 1, name: 'A', custom: false, createdAt: new Date() });

    await zikrService.hardDelete(1);

    expect(await db.plans.get('mirror-1')).toBeTruthy();
  });

  it('removes the deleted zikr sessions', async () => {
    await db.zikrs.add({ id: 1, name: 'A', custom: false, createdAt: new Date() });
    await seedSession(1, 5);

    await zikrService.hardDelete(1);
    expect(await db.sessions.where('zikrId').equals(1).count()).toBe(0);
  });
});
