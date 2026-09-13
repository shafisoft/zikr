import Dexie, { Table } from 'dexie';
import {
  Zikr,
  Session,
  Goal,
  Streak,
  Setting,
  SessionFormState,
  ZikrLastCount,
  SharedRoom,
  SharedSubmission,
  SyncOutboxItem,
  SharedIdentity,
  ZikrShareOutboxItem,
} from './types';

export class ZikrDatabase extends Dexie {
  zikrs!: Table<Zikr>;
  sessions!: Table<Session>;
  goals!: Table<Goal>;
  streaks!: Table<Streak>;
  settings!: Table<Setting>;
  sessionFormState!: Table<SessionFormState>;  // NEW (v2)
  zikrLastCount!: Table<ZikrLastCount>;        // NEW (v2)
  sharedRooms!: Table<SharedRoom>;             // NEW (v3)
  sharedSubmissions!: Table<SharedSubmission>; // NEW (v3) — local-only, never synced
  syncOutbox!: Table<SyncOutboxItem>;          // NEW (v3)
  identity!: Table<SharedIdentity>;            // NEW (v3)
  zikrShareOutbox!: Table<ZikrShareOutboxItem>; // NEW (v5)

  constructor() {
    super('zikr-db');

    // Version 1 (existing)
    this.version(1).stores({
      zikrs: '++id, name, custom, createdAt, deletedAt',
      sessions: '++id, zikrId, date, [zikrId+date]',
      goals: '++id, zikrId, status',
      streaks: 'zikrId',
      settings: 'key'
    });

    // Version 2 (NEW - Epic 6)
    this.version(2).stores({
      zikrs: '++id, name, custom, createdAt, deletedAt',
      sessions: '++id, zikrId, date, editableUntil, [zikrId+date]',  // ADDED editableUntil
      goals: '++id, zikrId, status',
      streaks: 'zikrId',
      settings: 'key',
      sessionFormState: '++id, createdAt',           // NEW
      zikrLastCount: 'zikrId, updatedAt'            // NEW
    }).upgrade(async (tx) => {
      // Migration logic handled by migrationService
      const { migrateToV2 } = await import('../services/migrationService');
      await migrateToV2(tx);
    });

    // Version 3 (NEW - shared goals / rooms). Purely additive tables,
    // no upgrade logic needed.
    this.version(3).stores({
      zikrs: '++id, name, custom, createdAt, deletedAt',
      sessions: '++id, zikrId, date, editableUntil, [zikrId+date]',
      goals: '++id, zikrId, status',
      streaks: 'zikrId',
      settings: 'key',
      sessionFormState: '++id, createdAt',
      zikrLastCount: 'zikrId, updatedAt',
      sharedRooms: 'code, status, endsAt',                          // NEW
      sharedSubmissions: '++id, roomCode, submittedAt, eventId',    // NEW (local-only)
      syncOutbox: '++id, nextAttemptAt, eventId',                   // NEW
      identity: 'userId'                                            // NEW
    });

    // Version 4: Goal.zikrIds is the single source of truth for a goal's
    // zikrs (multi-zikr goals). The legacy single-zikr `zikrId` field is
    // folded into zikrIds and removed; the zikrId index on goals is dropped
    // (goal lookup by zikr filters in memory — the table is tiny).
    this.version(4).stores({
      zikrs: '++id, name, custom, createdAt, deletedAt',
      sessions: '++id, zikrId, date, editableUntil, [zikrId+date]',
      goals: '++id, status',
      streaks: 'zikrId',
      settings: 'key',
      sessionFormState: '++id, createdAt',
      zikrLastCount: 'zikrId, updatedAt',
      sharedRooms: 'code, status, endsAt',
      sharedSubmissions: '++id, roomCode, submittedAt, eventId',
      syncOutbox: '++id, nextAttemptAt, eventId',
      identity: 'userId'
    }).upgrade(async (tx) => {
      await tx.table('goals').toCollection().modify(goal => {
        goal.zikrIds = Array.isArray(goal.zikrIds) && goal.zikrIds.length > 0
          ? goal.zikrIds
          : (goal.zikrId != null ? [goal.zikrId] : []);
        delete goal.zikrId;
      });
    });

    // Version 5: zikr library sync. Zikr gains remoteId/sharedAt/pulledAt
    // (additive fields, no upgrade needed); new zikrShareOutbox table holds
    // pending "share with others" pushes (mirrors the room syncOutbox).
    this.version(5).stores({
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
      zikrShareOutbox: '++id, zikrId, nextAttemptAt'           // NEW
    });
  }
}

export const db = new ZikrDatabase();
