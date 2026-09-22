import type { Transaction } from 'dexie';
import { Session } from '../db/types';

/**
 * v1 → v2 data move, run inside db.ts's Dexie upgrade transaction
 * (the only live piece of the old migration surface — `runMigrations`,
 * `needsMigration` and `getMigrationProgress` had no callers and were
 * removed; schema versioning itself lives in db.ts's `.version().upgrade()`).
 */
export async function migrateToV2(
  transaction: Transaction
): Promise<void> {
  // Use the provided transaction (design review feedback)
  const sessions = transaction.table<Session>('sessions');

  const allSessions = await sessions.toArray();
  const total = allSessions.length;

  // Per-session error handling
  let migrated = 0;
  let errors = 0;

  for (const session of allSessions) {
    try {
      const timestamp = session.timestamp || session.date || new Date();

      await sessions.update(session.id!, {
        editableUntil: addDays(timestamp, 3),  // 3-day edit window
        source: session.source || 'app',       // Default to 'app'
        createdAt: timestamp,
        updatedAt: timestamp
      });

      migrated++;
    } catch (error) {
      console.error(`Failed to migrate session ${session.id}:`, error);
      errors++;
    }
  }

  // NEW (design review feedback): Verification step
  try {
    const unmigrated = await sessions.where('editableUntil').equals(undefined as any).count();
    if (unmigrated > 0) {
      console.warn(`Migration incomplete: ${unmigrated} sessions missing editableUntil field`);
    } else {
      console.log(`Migration verification complete: All ${total} sessions migrated successfully`);
    }
  } catch (error) {
    console.error('Migration verification failed:', error);
  }

  console.log(`Migration v1→v2 complete: ${migrated} succeeded, ${errors} failed`);
}

// Helper function for date arithmetic
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Export migration service
export const migrationService = {
  migrateToV2
};
