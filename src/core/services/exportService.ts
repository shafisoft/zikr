import { db } from '../db/db';
import { Zikr, Session, Plan, PlanOwner, Streak, Setting } from '../db/types';
import { newPlanId } from '../utils/planUtils';

interface ExportData {
  version: string;
  exportDate: string;
  data: {
    zikrs: Zikr[];
    sessions: Session[];
    plans: Plan[];
    planOwners: PlanOwner[];
    streaks: Streak[];
    settings: Setting[];
  };
}

/** A pre-v6 backup (goals with zikrIds arrays) — converted on import. */
interface LegacyExportData {
  version: string;
  exportDate: string;
  data: {
    zikrs: Zikr[];
    sessions: Session[];
    goals: Array<{
      id?: number;
      zikrIds: number[];
      name?: string;
      target: number;
      period: 'daily' | 'weekly' | 'monthly' | 'custom';
      startDate?: Date;
      endDate?: Date;
      status: 'active' | 'completed' | 'paused';
      createdAt: Date;
      completedAt?: Date;
    }>;
    streaks: Streak[];
    settings: Setting[];
  };
}

/** Personal plans + their owner rows from the device (group mirrors excluded). */
async function personalPlans(): Promise<{ plans: Plan[]; planOwners: PlanOwner[] }> {
  const [plans, owners] = await Promise.all([db.plans.toArray(), db.planOwners.toArray()]);
  const mine = new Set(
    owners.filter(o => o.ownerKind === 'user' && o.ownerId === 'me').map(o => o.planId)
  );
  return {
    plans: plans.filter(p => mine.has(p.id)),
    planOwners: owners.filter(o => mine.has(o.planId)),
  };
}

/** Convert a legacy goals backup into plans + owner rows. */
function legacyGoalsToPlans(legacy: LegacyExportData): { plans: Plan[]; planOwners: PlanOwner[] } {
  const plans: Plan[] = [];
  const planOwners: PlanOwner[] = [];
  for (const goal of legacy.data.goals ?? []) {
    const zikrMeta = new Map(legacy.data.zikrs.map(z => [z.id, z]));
    const zikrs = (goal.zikrIds ?? []).map(zikrId => {
      const z = zikrMeta.get(zikrId);
      return { zikrId, name: z?.name ?? `Zikr ${zikrId}`, arabic: z?.arabicText ?? null };
    });
    if (zikrs.length === 0) continue;
    const id = newPlanId();
    plans.push({
      id,
      title: goal.name,
      mode: 'combined',
      period: goal.period === 'custom' ? 'one-time' : goal.period,
      target: goal.target,
      zikrs,
      startDate: goal.startDate,
      endDate: goal.endDate,
      status: goal.status,
      createdAt: goal.createdAt,
      completedAt: goal.completedAt,
    });
    planOwners.push({ planId: id, ownerKind: 'user', ownerId: 'me' });
  }
  return { plans, planOwners };
}

export async function exportData(): Promise<void> {
  try {
    const [zikrs, sessions, { plans, planOwners }, streaks, settings] = await Promise.all([
      db.zikrs.toArray(),
      db.sessions.toArray(),
      personalPlans(),
      db.streaks.toArray(),
      db.settings.toArray()
    ]);

    const data: ExportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: { zikrs, sessions, plans, planOwners, streaks, settings }
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zikr-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export failed:', error);
    throw new Error('Failed to export data. Please check browser storage permissions.');
  }
}

export async function importData(file: File): Promise<void> {
  let backup: ExportData | null = null;

  try {
    // Read and validate JSON
    const text = await file.text();
    const imported = JSON.parse(text) as Partial<ExportData & LegacyExportData>;

    // Validate file structure integrity
    if (!imported.version || !imported.data) {
      throw new Error('Invalid file format: missing version or data');
    }

    // New-format backups carry plans; legacy backups carry goals (converted).
    const data = imported.data;
    const hasPlans = Array.isArray(data.plans);
    const hasLegacyGoals = Array.isArray((data as LegacyExportData['data']).goals);
    if (!hasPlans && !hasLegacyGoals) {
      throw new Error('Invalid file format: missing plans/goals');
    }
    if (!Array.isArray(data.zikrs) ||
        !Array.isArray(data.sessions) ||
        !Array.isArray(data.streaks) ||
        !Array.isArray(data.settings)) {
      throw new Error('Invalid file format: missing required arrays');
    }

    const source = hasPlans
      ? {
          plans: data.plans as Plan[],
          planOwners: data.planOwners ?? [],
        }
      : legacyGoalsToPlans(imported as unknown as LegacyExportData);

    // Create backup of existing data
    const [zikrs, sessions, { plans, planOwners }, streaks, settings] = await Promise.all([
      db.zikrs.toArray(),
      db.sessions.toArray(),
      personalPlans(),
      db.streaks.toArray(),
      db.settings.toArray()
    ]);

    backup = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: { zikrs, sessions, plans, planOwners, streaks, settings }
    };

    // Clear existing data and import
    await db.transaction(
      'rw',
      [db.zikrs, db.sessions, db.plans, db.planOwners, db.streaks, db.settings],
      async () => {
        await Promise.all([
          db.zikrs.clear(),
          db.sessions.clear(),
          db.streaks.clear(),
          db.settings.clear()
        ]);
        // Only personal plans are replaced; group mirrors stay untouched.
        const keep = await db.plans.toArray().then(all =>
          all.filter(p => p.roomCode != null)
        );
        await db.plans.clear();
        await db.planOwners.clear();

        // Import data in order (zikrs first for foreign key references)
        await db.zikrs.bulkAdd(data.zikrs as Zikr[]);
        await db.sessions.bulkAdd(data.sessions as Session[]);
        await db.plans.bulkPut([...source.plans, ...keep]);
        await db.planOwners.bulkPut([
          ...source.planOwners,
          ...keep.map(p => ({ planId: p.id, ownerKind: 'group' as const, ownerId: p.roomCode! })),
        ]);
        await db.streaks.bulkAdd(data.streaks as Streak[]);
        await db.settings.bulkAdd(data.settings as Setting[]);
      }
    );
  } catch (error) {
    console.error('Import failed:', error);

    // Rollback if backup exists
    if (backup !== null) {
      try {
        const backupData = backup.data; // Capture data to avoid null issues
        await db.transaction(
          'rw',
          [db.zikrs, db.sessions, db.plans, db.planOwners, db.streaks, db.settings],
          async () => {
            await Promise.all([
              db.zikrs.clear(),
              db.sessions.clear(),
              db.streaks.clear(),
              db.settings.clear()
            ]);
            const keep = await db.plans.toArray().then(all =>
              all.filter(p => p.roomCode != null)
            );
            await db.plans.clear();
            await db.planOwners.clear();

            await db.zikrs.bulkAdd(backupData.zikrs);
            await db.sessions.bulkAdd(backupData.sessions);
            await db.plans.bulkPut([...backupData.plans, ...keep]);
            await db.planOwners.bulkPut([
              ...backupData.planOwners,
              ...keep.map(p => ({ planId: p.id, ownerKind: 'group' as const, ownerId: p.roomCode! })),
            ]);
            await db.streaks.bulkAdd(backupData.streaks);
            await db.settings.bulkAdd(backupData.settings);
          }
        );
      } catch (rollbackError) {
        console.error('Rollback failed:', rollbackError);
        throw new Error('Import failed and rollback also failed. Data may be inconsistent.');
      }
    }

    throw new Error(
      'Failed to import data. Original data restored. Please check the file format and try again.'
    );
  }
}

export const exportService = {
  exportData,
  importData
};
