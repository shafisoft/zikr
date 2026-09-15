import { ZikrDatabase } from './db';
import { Zikr } from './types';
import { ZIKR_CATALOG } from '../data/zikrCatalog';

const PREDEFINED_ZIKRS: Omit<Zikr, 'id'>[] = ZIKR_CATALOG.map(entry => ({
  name: entry.name,
  custom: false,
  createdAt: new Date(),
  nameBn: entry.nameBn,
  arabicText: entry.arabicText,
  translation: entry.translation,
  translationBn: entry.translationBn,
  defaultTarget: entry.defaultTarget,
  isQuickStarter: entry.isQuickStarter,
}));

let seedPromise: Promise<void> | null = null;

export function seedZikrs(database: ZikrDatabase): Promise<void> {
  // Memoize so concurrent callers (e.g. React StrictMode double effects)
  // can't race past the existence check and seed duplicates.
  if (!seedPromise) {
    seedPromise = (async () => {
      await seedZikrsByIdempotentNames(database);
      await backfillSeedDisplayFields(database);
      await removeObsoleteSeedRows(database);
      await deduplicateZikrs(database);
    })().catch(err => {
      seedPromise = null; // allow retry on failure
      throw err;
    });
  }
  return seedPromise;
}

async function seedZikrsByIdempotentNames(database: ZikrDatabase): Promise<void> {
  const existing = await database.zikrs.toArray();
  // Only live rows count as "already seeded" — a soft-deleted row must not
  // shadow its predefined original.
  const existingNames = new Set(
    existing.filter(z => !z.deletedAt).map(z => z.name.trim().toLowerCase())
  );
  const missing = PREDEFINED_ZIKRS.filter(
    z => !existingNames.has(z.name.trim().toLowerCase())
  );
  if (missing.length === 0) return;

  await database.zikrs.bulkAdd(missing);
}

/**
 * Backfill display fields (Arabic, names/meanings, targets) onto predefined
 * rows created before this data moved into the schema. Idempotent; never
 * touches custom rows or fields a record already carries.
 */
async function backfillSeedDisplayFields(database: ZikrDatabase): Promise<void> {
  const existing = await database.zikrs.toArray();
  const patches: Array<{ id: number; fields: Partial<Zikr> }> = [];

  for (const zikr of existing) {
    if (zikr.custom || zikr.deletedAt) continue;
    const entry = ZIKR_CATALOG.find(
      e => e.name.trim().toLowerCase() === zikr.name.trim().toLowerCase()
    );
    if (!entry) continue;

    const fields: Partial<Zikr> = {};
    if (zikr.arabicText == null) fields.arabicText = entry.arabicText;
    if (zikr.translation == null) fields.translation = entry.translation;
    if (zikr.nameBn == null) fields.nameBn = entry.nameBn;
    if (zikr.translationBn == null) fields.translationBn = entry.translationBn;
    if (zikr.defaultTarget == null) fields.defaultTarget = entry.defaultTarget;
    if (zikr.isQuickStarter == null) fields.isQuickStarter = entry.isQuickStarter;
    if (Object.keys(fields).length > 0) patches.push({ id: zikr.id!, fields });
  }

  for (const { id, fields } of patches) {
    await database.zikrs.update(id, fields);
  }
}

/**
 * One-time cleanup: 'Short Salawat' was a briefly-shipped duplicate of
 * Salawat (the mapping now holds the short formula). Remove the stray row
 * on devices that received it. Safe: it was auto-seeded, never user-created.
 */
async function removeObsoleteSeedRows(database: ZikrDatabase): Promise<void> {
  await database.zikrs.where('name').equals('Short Salawat').delete();
}

/**
 * Self-heal duplicate predefined rows left by historical seeding races:
 * keep the oldest live row per name, drop the rest. Soft-deleted rows are
 * ignored (they are invisible and must not shadow live names), and a
 * duplicate is only deleted when nothing references it — otherwise its
 * sessions/goals/streaks would be orphaned.
 */
async function deduplicateZikrs(database: ZikrDatabase): Promise<void> {
  const all = await database.zikrs.toArray();
  const seen = new Set<string>();
  const duplicates: number[] = [];
  for (const zikr of all
    .filter(z => !z.deletedAt)
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
    const nameKey = zikr.name.trim().toLowerCase();
    if (seen.has(nameKey)) duplicates.push(zikr.id!);
    else seen.add(nameKey);
  }
  for (const id of duplicates) {
    const hasSessions = await database.sessions.where('zikrId').equals(id).limit(1).count();
    // Plans reference zikrs via the embedded zikrs array (no index) — a tiny
    // in-memory scan replaces the legacy goal-zikrId lookup.
    const hasPlans = (await database.plans.toArray()).some(p =>
      p.zikrs?.some(z => z.zikrId === id)
    );
    if (hasSessions > 0 || hasPlans) continue;
    await database.zikrs.delete(id);
  }
}
