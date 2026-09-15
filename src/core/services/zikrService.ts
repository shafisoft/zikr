import { db } from '../db/db';
import { Zikr } from '../db/types';

export async function add(zikr: Omit<Zikr, 'id'>): Promise<number> {
  // Reject names that already exist on a live (non-deleted) zikr — duplicate
  // rows would later be collapsed by the seed dedupe, orphaning child data.
  const nameKey = zikr.name.trim().toLowerCase();
  const all = await db.zikrs.toArray();
  const isDuplicate = all.some(
    z => !z.deletedAt && z.name.trim().toLowerCase() === nameKey
  );
  if (isDuplicate) {
    throw new Error('DUPLICATE_ZIKR');
  }
  const id = await db.zikrs.add(zikr);
  return typeof id === 'number' ? id : parseInt(id as string, 10);
}

export async function update(id: number, zikr: Partial<Zikr>): Promise<number> {
  return await db.zikrs.update(id, zikr);
}

export async function softDelete(id: number): Promise<void> {
  await db.zikrs.update(id, { deletedAt: new Date() });
}

export async function hardDelete(id: number): Promise<void> {
  await db.transaction('rw', db.zikrs, db.sessions, db.plans, db.planOwners, db.streaks, async () => {
    await db.zikrs.delete(id);
    await db.sessions.where('zikrId').equals(id).delete();
    // Personal plans bind zikrs via plan.zikrs[].zikrId — only remove plans
    // that are solely about this zikr; multi-zikr plans just lose one entry.
    // Group plans reference zikrs by name and are never touched here.
    const owners = await db.planOwners.toArray();
    const userPlanIds = new Set(
      owners.filter(o => o.ownerKind === 'user').map(o => o.planId)
    );
    const soleZikrPlanIds: string[] = [];
    for (const plan of await db.plans.toArray()) {
      if (!userPlanIds.has(plan.id)) continue;
      const entries = plan.zikrs ?? [];
      if (!entries.some(z => z.zikrId === id)) continue;
      if (entries.length === 1) {
        soleZikrPlanIds.push(plan.id);
      } else {
        await db.plans.update(plan.id, {
          zikrs: entries.filter(z => z.zikrId !== id),
        });
      }
    }
    if (soleZikrPlanIds.length > 0) {
      await db.plans.bulkDelete(soleZikrPlanIds);
      await db.planOwners.where('planId').anyOf(soleZikrPlanIds).delete();
    }
    await db.streaks.delete(id);
  });
}

export async function deleteZikr(id: number): Promise<void> {
  await db.zikrs.delete(id);
}

export async function getZikrById(id: number): Promise<Zikr | undefined> {
  return await db.zikrs.get(id);
}

export async function getAllZikrs(): Promise<Zikr[]> {
  return await db.zikrs.toArray();
}

export async function getCustomZikrs(): Promise<Zikr[]> {
  return await db.zikrs.filter(zikr => zikr.custom === true).toArray();
}

export async function getPredefinedZikrs(): Promise<Zikr[]> {
  return await db.zikrs.filter(zikr => zikr.custom === false).toArray();
}

// Service export
export const zikrService = {
  add,
  update,
  softDelete,
  hardDelete,
  deleteZikr,
  getZikrById,
  getAllZikrs,
  getCustomZikrs,
  getPredefinedZikrs
};
