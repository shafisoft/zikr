import { db } from '../db/db';
import { Zikr, Session, Plan, PlanOwner, Streak, Setting, Routine } from '../db/types';
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
    /** Absent in older backups — import treats it as "none". */
    routines?: Routine[];
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

// ---------- Date rehydration (ENG-F1 fix, remediation 1.1) ----------
//
// JSON has no Date type: every Date serializes to an ISO string, so a
// restored backup would land raw strings in Dexie and break date math
// (streak day comparisons, the 3-day edit window, plan windows). importData
// revives EXACTLY the fields below — a per-field allowlist, not a generic
// "looks like a date" heuristic — so contractually-string fields are never
// touched. In particular `zikrSyncCursor.updatedAt` MUST stay a string: it
// is passed verbatim to the pull RPC (zikrSync/contract.ts).

const TABLE_DATE_FIELDS = {
  zikrs: ['createdAt', 'deletedAt', 'sharedAt', 'pulledAt'],
  sessions: ['timestamp', 'date', 'editableUntil', 'createdAt', 'updatedAt'],
  plans: ['startDate', 'endDate', 'createdAt', 'completedAt', 'endedAt', 'fetchedAt'],
  streaks: ['lastProcessedDate'],
  routines: ['createdAt', 'deletedAt'],
} as const;

/**
 * Settings whose `value` carries Date fields, keyed by setting key. No
 * Date-valued setting exists today — a future one must be allowlisted here
 * explicitly. `zikrSyncCursor` stays out on purpose (string contract above).
 */
const SETTING_DATE_FIELDS: Record<string, readonly string[]> = {};

/** Revive the allowlisted string fields of one row back into Date instances. */
function rehydrateRow<T extends object>(row: T, fields: readonly string[]): T {
  const out = { ...row } as Record<string, unknown>;
  for (const field of fields) {
    const value = out[field];
    if (typeof value === 'string') {
      out[field] = new Date(value);
    }
  }
  return out as T;
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

/** Assemble the backup payload (also the round-trip test's entry point). */
export async function buildExportData(): Promise<ExportData> {
  const [zikrs, sessions, { plans, planOwners }, streaks, settings, routines] = await Promise.all([
    db.zikrs.toArray(),
    db.sessions.toArray(),
    personalPlans(),
    db.streaks.toArray(),
    db.settings.toArray(),
    db.routines.toArray()
  ]);

  return {
    version: '1.0',
    exportDate: new Date().toISOString(),
    data: { zikrs, sessions, plans, planOwners, streaks, settings, routines }
  };
}

export async function exportData(): Promise<void> {
  try {
    const data = await buildExportData();

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

    // Date rehydration — AFTER the legacy conversion, because converted
    // plans inherit raw string dates straight from the backup JSON.
    const importZikrs = data.zikrs.map(row => rehydrateRow(row, TABLE_DATE_FIELDS.zikrs));
    const importSessions = data.sessions.map(row => rehydrateRow(row, TABLE_DATE_FIELDS.sessions));
    const importPlans = source.plans.map(row => rehydrateRow(row, TABLE_DATE_FIELDS.plans));
    const importStreaks = data.streaks.map(row => rehydrateRow(row, TABLE_DATE_FIELDS.streaks));
    const importSettings = data.settings.map(row => {
      const fields = SETTING_DATE_FIELDS[row.key];
      return fields ? { key: row.key, value: rehydrateRow(row.value as object, fields) } : row;
    });
    // Older backups predate routines — absent means "none to import".
    const importRoutines = Array.isArray(data.routines)
      ? data.routines.map(row => rehydrateRow(row, TABLE_DATE_FIELDS.routines))
      : [];

    // Create backup of existing data
    const [zikrs, sessions, { plans, planOwners }, streaks, settings, routines] = await Promise.all([
      db.zikrs.toArray(),
      db.sessions.toArray(),
      personalPlans(),
      db.streaks.toArray(),
      db.settings.toArray(),
      db.routines.toArray()
    ]);

    backup = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      data: { zikrs, sessions, plans, planOwners, streaks, settings, routines }
    };

    // Clear existing data and import
    await db.transaction(
      'rw',
      [db.zikrs, db.sessions, db.plans, db.planOwners, db.streaks, db.settings, db.routines],
      async () => {
        await Promise.all([
          db.zikrs.clear(),
          db.sessions.clear(),
          db.streaks.clear(),
          db.settings.clear(),
          db.routines.clear()
        ]);
        // Only personal plans are replaced; group mirrors stay untouched.
        const keep = await db.plans.toArray().then(all =>
          all.filter(p => p.roomCode != null)
        );
        await db.plans.clear();
        await db.planOwners.clear();

        // Import data in order (zikrs first for foreign key references)
        await db.zikrs.bulkAdd(importZikrs);
        await db.sessions.bulkAdd(importSessions);
        await db.plans.bulkPut([...importPlans, ...keep]);
        await db.planOwners.bulkPut([
          ...source.planOwners,
          ...keep.map(p => ({ planId: p.id, ownerKind: 'group' as const, ownerId: p.roomCode! })),
        ]);
        await db.streaks.bulkAdd(importStreaks);
        await db.settings.bulkAdd(importSettings);
        await db.routines.bulkAdd(importRoutines);
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
          [db.zikrs, db.sessions, db.plans, db.planOwners, db.streaks, db.settings, db.routines],
          async () => {
            await Promise.all([
              db.zikrs.clear(),
              db.sessions.clear(),
              db.streaks.clear(),
              db.settings.clear(),
              db.routines.clear()
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
            if (backupData.routines) await db.routines.bulkAdd(backupData.routines);
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
