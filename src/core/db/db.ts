import Dexie, { Table } from 'dexie';
import { newPlanId } from '../utils/planUtils';
import {
  Zikr,
  Session,
  Goal,
  Plan,
  PlanOwner,
  Streak,
  Setting,
  ZikrLastCount,
  SharedRoom,
  SharedSubmission,
  SyncOutboxItem,
  SharedIdentity,
  ZikrShareOutboxItem,
} from './types';

/**
 * LEGACY — the chunked bulk-save feature was removed; this shape remains
 * only to keep the historical `sessionFormState` table (schema v2–v6)
 * typed. Nothing reads or writes it in live code.
 */
interface SessionFormState {
  id?: number;
  sessions: Array<{ zikrId: number; count: number; timestamp: Date }>;
  currentIndex: number;
  createdAt: Date;
  totalSessions: number;
}

export class ZikrDatabase extends Dexie {
  zikrs!: Table<Zikr>;
  sessions!: Table<Session>;
  /** LEGACY — emptied by the v6 upgrade; kept declared for historical v1→v2 upgrade code. */
  goals!: Table<Goal>;
  plans!: Table<Plan>;                         // NEW (v6)
  planOwners!: Table<PlanOwner>;               // NEW (v6)
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

    // Version 6: Plans. One entity replaces personal goals AND fuses the
    // goal out of shared rooms: rooms become persistent groups whose plans
    // come and go. Ownership is a relation (planOwners: 'user' → 'me' for
    // personal plans, 'group' → roomCode for server mirrors).
    //
    // Upgrade moves:
    //   1. goals → plans (+ owner row ('user','me')); 'custom' period becomes
    //      'one-time' with its dates; zikrIds resolve to {zikrId, name, arabic}.
    //   2. every sharedRoom row splits into a slim room + its legacy single
    //      plan (+ owner row ('group', code)); pending submissions/outbox
    //      items are backfilled with planId/zikrName.
    //   3. the goals table is emptied (it stays declared so the historical
    //      v1→v2 migration code in migrationService keeps working).
    this.version(6).stores({
      zikrs: '++id, name, custom, createdAt, deletedAt, remoteId',
      sessions: '++id, zikrId, date, editableUntil, [zikrId+date]',
      goals: '++id, status',
      plans: 'id, status',                                     // NEW
      planOwners: '[planId+ownerId], planId, ownerId',         // NEW
      streaks: 'zikrId',
      settings: 'key',
      sessionFormState: '++id, createdAt',
      zikrLastCount: 'zikrId, updatedAt',
      sharedRooms: 'code, status',                             // endsAt index dropped
      sharedSubmissions: '++id, roomCode, submittedAt, eventId',
      syncOutbox: '++id, nextAttemptAt, eventId',
      identity: 'userId',
      zikrShareOutbox: '++id, zikrId, nextAttemptAt'
    }).upgrade(async (tx) => {
      const zikrNames = new Map<number, { name: string; arabic?: string | null }>();
      await tx.table('zikrs').each((z) => {
        if (z.id != null) zikrNames.set(z.id, { name: z.name, arabic: z.arabicText ?? null });
      });

      const plansToPut: Plan[] = [];
      const ownersToPut: PlanOwner[] = [];

      // 1. Personal goals → user-owned plans.
      await tx.table('goals').each((goal) => {
        const id = newPlanId();
        const zikrs = (Array.isArray(goal.zikrIds) ? goal.zikrIds : [])
          .map((zikrId: number) => {
            const meta = zikrNames.get(zikrId);
            return { zikrId, name: meta?.name ?? `Zikr ${zikrId}`, arabic: meta?.arabic ?? null };
          });
        if (zikrs.length === 0) return; // unreachable goal — nothing to count
        plansToPut.push({
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
        ownersToPut.push({ planId: id, ownerKind: 'user', ownerId: 'me' });
      });

      // 2. Shared rooms → slim groups + one legacy plan each.
      const roomPlans = new Map<string, Plan>();
      await tx.table('sharedRooms').each((room) => {
        const plan: Plan = {
          id: newPlanId(),
          mode: 'combined',
          period: 'one-time',
          target: room.target,
          zikrs: [{ name: room.zikrName, arabic: room.zikrArabic ?? null, total: room.total }],
          startDate: room.startsAt,
          endDate: room.endsAt,
          status: 'active',
          createdAt: room.startsAt,
          roomCode: room.code,
          total: room.total,
          periodTotal: room.total,
          fetchedAt: room.fetchedAt,
        };
        roomPlans.set(room.code, plan);
        plansToPut.push(plan);
        ownersToPut.push({ planId: plan.id, ownerKind: 'group', ownerId: room.code });
      });

      if (plansToPut.length > 0) {
        await tx.table('plans').bulkPut(plansToPut);
        await tx.table('planOwners').bulkPut(ownersToPut);
      }
      await tx.table('goals').clear();
      await tx.table('sharedRooms').toCollection().modify((room) => {
        // Strip the goal fields that moved onto the plan.
        delete room.zikrName;
        delete room.zikrArabic;
        delete room.target;
        delete room.total;
        delete room.startsAt;
        delete room.endsAt;
      });

      // 3. Backfill pending/failed submissions and queued outbox items.
      for (const table of ['sharedSubmissions', 'syncOutbox']) {
        await tx.table(table).toCollection().modify((row) => {
          const plan = roomPlans.get(row.roomCode);
          if (plan && row.planId == null) {
            row.planId = plan.id;
            row.zikrName = plan.zikrs[0].name;
          }
        });
      }
    });
  }
}

export const db = new ZikrDatabase();

