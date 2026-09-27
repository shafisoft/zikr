/**
 * Routine Service — CRUD + business rules for routines (R2, §5.1).
 * Named functions + service object (house pattern, sessionService.ts).
 *
 * Preset creation resolves the catalog cluster against the user's EXISTING
 * seeded zikr rows (case/whitespace-insensitive, the seeder's own key) and
 * never duplicates zikr records (AC2.1.3). Deleting a routine never touches
 * zikrs or sessions (AC2.4.3). Item edits are forward-only by construction:
 * counts live on the routine, completed days live in history (AC2.2.4).
 */

import { db } from '../db/db';
import { Routine, RoutineItem, Zikr } from '../db/types';
import {
  ALL_ROUTINE_PRESET_KEYS,
  MAX_ROUTINE_ITEMS,
  newRoutineId,
  resolveRoutinePreset,
  RoutinePresetKey,
  ROUTINE_PRESET_SCHEDULES,
  routineDraftIssue,
} from '../utils/routineUtils';

/** Every non-soft-deleted routine, creation order preserved. */
export async function getAll(): Promise<Routine[]> {
  const all = await db.routines.toArray();
  return all
    .filter(routine => !routine.deletedAt)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function liveZikrsById(): Promise<Map<number, Zikr>> {
  const zikrs = await db.zikrs.toArray();
  return new Map(
    zikrs.filter(z => !z.deletedAt && z.id != null).map(z => [z.id!, z])
  );
}

/**
 * One-tap preset (AC2.1.1): ordered per Hisn-ul-Muslim, counts from the
 * seeded rows' `defaultTarget`, and carrying the preset's day-part schedule
 * (§5.1 schedule metadata). Throws 'ROUTINE_PRESET_ZIKR_MISSING' if any
 * preset name has no live zikr row — creation refuses rather than
 * fabricating a shorter liturgy.
 */
export async function createPreset(key: RoutinePresetKey): Promise<string> {
  const zikrMap = await liveZikrsById();
  const { items, unresolved } = resolveRoutinePreset([...zikrMap.values()], key);
  if (unresolved.length > 0) {
    throw new Error('ROUTINE_PRESET_ZIKR_MISSING');
  }
  return createRoutineRow({
    source: 'preset',
    presetKey: key,
    schedule: ROUTINE_PRESET_SCHEDULES[key],
    items,
  });
}

/** Custom routine (AC2.2.x). Items reference live zikr records. */
export async function createCustom(draft: {
  title?: string;
  items: Array<{ zikrId: number; target: number }>;
}): Promise<string> {
  const zikrMap = await liveZikrsById();
  const items = resolveDraftItems(draft.items, zikrMap);
  return createRoutineRow({
    source: 'custom',
    title: draft.title?.trim() || undefined,
    items,
  });
}

/** Raw insert — no bounds checks (boot seeding is app furniture, not a draft). */
async function insertRoutine(
  base: Pick<Routine, 'source' | 'presetKey' | 'title' | 'schedule' | 'items'>
): Promise<string> {
  const id = newRoutineId();
  const routine: Routine = {
    ...base,
    id,
    createdAt: new Date(),
  };
  await db.transaction('rw', db.routines, async () => {
    await db.routines.put(routine);
  });
  return id;
}

async function createRoutineRow(
  base: Pick<Routine, 'source' | 'presetKey' | 'title' | 'schedule' | 'items'>
): Promise<string> {
  const routineCount = (await getAll()).length;
  const issue = routineDraftIssue({ itemCount: base.items.length, routineCount });
  if (issue === 'too-many-routines') throw new Error('ROUTINE_MAX_ROUTINES');
  if (issue === 'too-many-items') throw new Error('ROUTINE_MAX_ITEMS');
  if (issue === 'empty') throw new Error('ROUTINE_EMPTY');
  return insertRoutine(base);
}

/** Denormalize names at write time; every zikrId must resolve (live rows). */
function resolveDraftItems(
  draftItems: Array<{ zikrId: number; target: number }>,
  zikrMap: Map<number, Zikr>
): RoutineItem[] {
  const items: RoutineItem[] = [];
  for (const draft of draftItems) {
    const zikr = zikrMap.get(draft.zikrId);
    if (!zikr) throw new Error('ROUTINE_ZIKR_MISSING');
    const target = Math.floor(draft.target);
    if (!Number.isFinite(target) || target <= 0) throw new Error('ROUTINE_INVALID_COUNT');
    items.push({ zikrId: draft.zikrId, name: zikr.name, target });
  }
  return items;
}

/**
 * Edit a routine's items (AC2.2.4 — forward-only: today's and past days'
 * done-state re-derives under the new counts, never stored per day).
 * Also updates a custom routine's title.
 */
export async function updateItems(
  id: string,
  items: Array<{ zikrId: number; target: number }>,
  title?: string
): Promise<number> {
  const routine = await db.routines.get(id);
  if (!routine || routine.deletedAt) throw new Error('ROUTINE_NOT_FOUND');
  if (items.length === 0) throw new Error('ROUTINE_EMPTY');
  if (items.length > MAX_ROUTINE_ITEMS) throw new Error('ROUTINE_MAX_ITEMS');

  const zikrMap = await liveZikrsById();
  const resolved = resolveDraftItems(items, zikrMap);
  const patch: Partial<Routine> = { items: resolved };
  if (routine.source === 'custom' && title !== undefined) {
    patch.title = title.trim() || undefined;
  }
  return await db.transaction('rw', db.routines, async () =>
    db.routines.update(id, patch)
  );
}

/** Explicit user delete — removes ONLY the routine (AC2.4.3). */
export async function softDelete(id: string): Promise<void> {
  await db.transaction('rw', db.routines, async () => {
    await db.routines.update(id, { deletedAt: new Date() });
  });
}

export async function restore(id: string): Promise<void> {
  await db.transaction('rw', db.routines, async () => {
    await db.routines.update(id, { deletedAt: undefined });
  });
}

let ensurePresetsPromise: Promise<void> | null = null;

/**
 * Boot seeding (Feature A): make sure ALL FOUR preset routines exist so the
 * user can start immediately. Idempotent — a preset is created only when no
 * row (live OR soft-deleted) carries its presetKey; a soft-deleted preset
 * is a deliberate dismissal and is NEVER recreated. A preset whose zikrs
 * cannot all resolve is skipped quietly (the boot must never block or
 * fabricate a shorter liturgy). Deliberately bypasses the user-draft
 * routine cap — the four presets are app furniture, not user drafts.
 * Memoized like seedZikrs so concurrent callers (React StrictMode) can't
 * race past the existence check.
 */
export function ensurePresets(): Promise<void> {
  if (!ensurePresetsPromise) {
    ensurePresetsPromise = ensurePresetsOnce().catch(err => {
      ensurePresetsPromise = null; // allow retry on failure
      throw err;
    });
  }
  return ensurePresetsPromise;
}

/**
 * Test hook only: forget the memoized boot-seed so a test can run the
 * second-boot path against a fresh DB (mirrors seed.ts's memo, which tests
 * never cross because they drive the service, not the seeder).
 */
export function resetEnsurePresetsForTests(): void {
  ensurePresetsPromise = null;
}

async function ensurePresetsOnce(): Promise<void> {
  const existing = await db.routines.toArray();
  // Soft-deleted rows count as "already known": dismissal is respected.
  const knownKeys = new Set(
    existing.map(r => r.presetKey).filter((k): k is RoutinePresetKey => k != null)
  );
  const missing = ALL_ROUTINE_PRESET_KEYS.filter(key => !knownKeys.has(key));
  if (missing.length === 0) return;

  const zikrs = await db.zikrs.toArray();
  for (const key of missing) {
    const { items, unresolved } = resolveRoutinePreset(zikrs, key);
    if (unresolved.length > 0) continue;
    await insertRoutine({
      source: 'preset',
      presetKey: key,
      schedule: ROUTINE_PRESET_SCHEDULES[key],
      items,
    });
  }
}

export const routineService = {
  getAll,
  createPreset,
  createCustom,
  updateItems,
  softDelete,
  restore,
  ensurePresets,
};
