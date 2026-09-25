/**
 * Shared Room Service — local-first orchestration for groups and their plans.
 *
 * Depends ONLY on the SharedRoomBackend contract, never on a concrete
 * backend — pass any implementation (Supabase adapter, MockSharedRoomBackend,
 * or your own) to createSharedRoomService.
 *
 * Every write lands in local IndexedDB FIRST (private submission history +
 * outbox), then syncs via the outbox. The backend only ever receives atomic,
 * idempotent increments — it never sees the member's contribution history.
 * See docs/SharedGoals-Design.md
 */

import { db } from '../../db/db';
import {
  Plan,
  PlanOwner,
  PlanZikr,
  SharedIdentity,
  SharedMember,
  SharedRoom,
  SharedSubmission,
  SyncOutboxItem,
} from '../../db/types';
import { backoffDelayMs, isValidDelta, normalizeRoomCode } from '../../utils/sharedRoomUtils';
import { canContribute } from '../../utils/planUtils';
import {
  CreatePlanInput,
  CreateRoomInput,
  PlanSummary,
  RoomStatePayload,
  SharedRoomBackend,
  SharedRoomError,
} from './contract';

// ---------- helpers ----------

function makeEventId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'evt-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface FlushResult {
  applied: number;
  failed: number;
  deferred: number;
}

/** Map a server plan summary onto the local mirror row. */
function planFromSummary(summary: PlanSummary, roomCode: string): Plan {
  const zikrs: PlanZikr[] = summary.zikrs.map((z) => ({
    name: z.name,
    arabic: z.arabic,
    target: z.target ?? undefined,
    total: z.total,
    periodTotal: z.periodTotal,
  }));
  return {
    id: summary.id,
    title: summary.title ?? undefined,
    mode: summary.mode,
    period: summary.period,
    timeZone: summary.timeZone ?? undefined,
    target: summary.target ?? undefined,
    zikrs,
    startDate: summary.startsAt ? new Date(summary.startsAt) : undefined,
    endDate: summary.endsAt ? new Date(summary.endsAt) : undefined,
    status: summary.status,
    createdAt: new Date(summary.createdAt),
    endedAt: summary.endedAt ? new Date(summary.endedAt) : undefined,
    // Mirror-only fields:
    roomCode,
    total: summary.total,
    periodTotal: summary.periodTotal,
    fetchedAt: new Date(),
  };
}

/** Remove a group's plans + owner rows from the local mirror. */
async function deleteLocalPlans(code: string): Promise<void> {
  const plans = await db.plans.toArray();
  const ids = plans.filter((p) => p.roomCode === code).map((p) => p.id);
  if (ids.length > 0) {
    await db.transaction('rw', db.plans, db.planOwners, async () => {
      await db.plans.bulkDelete(ids);
      await db.planOwners.where('planId').anyOf(ids).delete();
    });
  }
}

// ---------- service ----------

export function createSharedRoomService(backend: SharedRoomBackend) {
  let flushPromise: Promise<FlushResult> | null = null;
  let appOpenTracked = false;

  async function saveRoomState(
    payload: RoomStatePayload,
    joinedAt?: Date,
    joinedWithUserId?: string
  ): Promise<SharedRoom> {
    const existing = await db.sharedRooms.get(payload.group.code);
    const r = payload.group;
    const room: SharedRoom = {
      code: r.code,
      id: r.id,
      title: r.title,
      ownerId: r.ownerId,
      status: r.status,
      joinedAt: joinedAt ?? existing?.joinedAt ?? new Date(),
      joinedWithUserId: joinedWithUserId ?? existing?.joinedWithUserId,
      fetchedAt: new Date(),
    };
    const plans = payload.plans.map((p) => planFromSummary(p, r.code));
    await db.transaction('rw', db.sharedRooms, db.plans, db.planOwners, async () => {
      await db.sharedRooms.put(room);
      if (plans.length > 0) {
        await db.plans.bulkPut(plans);
        await db.planOwners.bulkPut(
          plans.map(
            (p) =>
              ({ planId: p.id, ownerKind: 'group', ownerId: r.code }) satisfies PlanOwner
          )
        );
      }
    });
    return room;
  }

  return {
    readonlyBackendName: backend.name,

    /** Whether the backend has everything it needs to operate. */
    isConfigured(): boolean {
      return backend.isConfigured();
    },

    /**
     * Get or create the local identity, aligned with the backend's
     * no-login user, including the server-generated 12-char device token
     * used as the usage-metrics key. `displayName` updates the stored name
     * when provided.
     */
    async ensureIdentity(displayName?: string): Promise<SharedIdentity> {
      const userId = await backend.ensureUserId();
      const existing = (await db.identity.toArray())[0] || null;

      let token = existing?.token;
      if (!token) {
        token = await backend.ensureDeviceToken();
      }

      if (existing && existing.userId === userId) {
        if ((displayName && displayName !== existing.displayName) || token !== existing.token) {
          const updated: SharedIdentity = { ...existing, displayName: displayName ?? existing.displayName, token };
          await db.identity.put(updated);
          return updated;
        }
        return existing;
      }

      const identity: SharedIdentity = {
        userId,
        displayName: displayName || existing?.displayName || 'Guest',
        token,
        createdAt: existing?.createdAt || new Date(),
      };
      await db.identity.put(identity);
      return identity;
    },

    /**
     * Best-effort usage event. Never throws, never blocks — metrics are
     * allowed to fail (offline, unconfigured, backend hiccup).
     * Privacy: usage shape only; never contribution amounts.
     */
    async track(name: string, properties?: Record<string, unknown>): Promise<void> {
      try {
        if (!backend.isConfigured()) return;
        let identity = (await db.identity.toArray())[0];
        if (!identity?.token) {
          identity = await this.ensureIdentity();
        }
        await backend.trackEvent(name, properties);
      } catch {
        // intentionally ignored — see contract docs
      }
    },

    /** Fire once per app session. */
    async trackAppOpen(): Promise<void> {
      if (appOpenTracked) return;
      appOpenTracked = true;
      // Cold-start heartbeat: skip when this device has no identity yet.
      // Creating one here would pull the CAPTCHA-gated anonymous sign-in
      // onto the welcome screen; identity arrives with the first group action.
      const identity = (await db.identity.toArray())[0];
      if (!identity?.token) return;
      await this.track('app_opened');
    },

    /** Create a group (with its first plan); creator becomes the first member. */
    async createRoom(
      input: Omit<CreateRoomInput, 'displayName'> & { windowType?: string },
      identity: SharedIdentity
    ): Promise<SharedRoom> {
      const payload = await backend.createRoom({
        title: input.title,
        displayName: identity.displayName,
        initialPlan: input.initialPlan,
      });
      const room = await saveRoomState(payload, new Date(), identity.userId);
      await this.track('room_created', { window: input.windowType || 'custom' });
      return room;
    },

    /** Join (or rejoin) a group by code with a display name. */
    async joinRoom(code: string, identity: SharedIdentity): Promise<SharedRoom> {
      const normalized = normalizeRoomCode(code);
      if (!normalized) throw new SharedRoomError('invalid-input', 'Invalid room code');
      const payload = await backend.joinRoom(normalized, identity.displayName);
      const room = await saveRoomState(payload, new Date(), identity.userId);
      await this.track('room_joined');
      return room;
    },

    /** Owner adds another plan to a group. */
    async createPlan(code: string, input: CreatePlanInput): Promise<Plan[]> {
      const payload = await backend.createPlan(code, input);
      await saveRoomState(payload);
      await this.track('plan_created', { mode: input.mode, period: input.period });
      return payload.plans.map((p) => planFromSummary(p, payload.group.code));
    },

    /** Owner retires a plan early. */
    async endPlan(code: string, planId: string): Promise<void> {
      await backend.endPlan(code, planId);
      await db.plans.update(planId, {
        status: 'ended',
        endedAt: new Date(),
        fetchedAt: new Date(),
      });
      await this.track('plan_ended');
    },

    async leaveRoom(code: string): Promise<void> {
      await backend.leaveRoom(code);
      await db.transaction('rw', db.sharedRooms, db.plans, db.planOwners, async () => {
        await db.sharedRooms.delete(normalizeRoomCode(code) || code);
        await deleteLocalPlans(code);
      });
      await this.track('room_left');
    },

    async closeRoom(code: string): Promise<void> {
      await backend.closeRoom(code);
      await db.sharedRooms.update(code, { status: 'closed', fetchedAt: new Date() });
      await this.track('room_closed');
    },

    async removeMember(code: string, userId: string): Promise<void> {
      await backend.removeMember(code, userId);
      await this.track('member_removed');
    },

    /** Fetch fresh group state (plans incl. totals) into the local mirror. */
    async refreshRoom(code: string): Promise<SharedRoom | null> {
      const payload = await backend.getRoomState(code);
      return saveRoomState(payload);
    },

    /** Full group state from the backend: mirror + plans + members + my membership. */
    async fetchRoomState(code: string): Promise<{
      room: SharedRoom;
      plans: Plan[];
      members: SharedMember[];
      isMember: boolean;
    }> {
      const identity = await this.ensureIdentity();
      let payload: RoomStatePayload;
      try {
        payload = await backend.getRoomState(code);
      } catch (err) {
        // Group gone server-side (deleted by owner) — drop the stale local
        // mirror so it disappears from the list instead of erroring forever.
        if (err instanceof SharedRoomError && err.code === 'room-not-found') {
          await db.transaction('rw', db.sharedRooms, db.plans, db.planOwners, async () => {
            await db.sharedRooms.delete(code);
            await deleteLocalPlans(code);
          });
        }
        throw err;
      }

      // Silent rejoin: this group is in the device's list (joined before), so
      // this device is a member — whatever the backend's current books say.
      // Rejoin with the saved name instead of nagging the user to join again.
      if (!payload.isMember && payload.group.status === 'active') {
        const cached = await db.sharedRooms.get(payload.group.code);
        if (cached) {
          payload = await backend.joinRoom(payload.group.code, identity.displayName);
        }
      }

      const room = await saveRoomState(payload, undefined, identity.userId);
      const members: SharedMember[] = payload.members.map((m) => ({
        name: m.name,
        joinedAt: new Date(m.joinedAt),
        userId: m.userId,
      }));
      return {
        room,
        plans: payload.plans.map((p) => planFromSummary(p, payload.group.code)),
        members,
        isMember: payload.isMember,
      };
    },

    async getRoom(code: string): Promise<SharedRoom | undefined> {
      return db.sharedRooms.get(code);
    },

    async listRooms(): Promise<SharedRoom[]> {
      return db.sharedRooms.toArray();
    },

    /** The mirrored plans of one group. */
    async getRoomPlans(code: string): Promise<Plan[]> {
      const plans = await db.plans.toArray();
      return plans
        .filter((p) => p.roomCode === code)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    },

    /** Every mirrored (group) plan — for list summaries and propagation. */
    async listSharedPlans(): Promise<Plan[]> {
      return db.plans.filter((p) => p.roomCode != null).toArray();
    },

    /** My private contribution history for a group (local only, never synced). */
    async getMySubmissions(code: string): Promise<SharedSubmission[]> {
      const rows = await db.sharedSubmissions.where('roomCode').equals(code).toArray();
      return rows.sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
      );
    },

    /**
     * Submit a contribution: recorded locally immediately, queued for the
     * server, and flushed in the background. Never throws for network
     * reasons — the outbox owns delivery.
     */
    async submitContribution(
      code: string,
      planId: string,
      zikrName: string,
      delta: number,
      options: { autoFlush?: boolean } = {}
    ): Promise<SharedSubmission> {
      if (!isValidDelta(delta)) throw new SharedRoomError('invalid-delta');

      const eventId = makeEventId();
      const submission: SharedSubmission = {
        roomCode: code,
        planId,
        zikrName,
        delta,
        submittedAt: new Date(),
        eventId,
        syncState: 'pending',
      };
      const item: SyncOutboxItem = {
        eventId,
        roomCode: code,
        planId,
        zikrName,
        delta,
        attempts: 0,
        nextAttemptAt: new Date(),
        createdAt: new Date(),
      };

      await db.transaction('rw', db.sharedSubmissions, db.syncOutbox, async () => {
        await db.sharedSubmissions.add(submission);
        await db.syncOutbox.add(item);
      });

      // Usage event — deliberately WITHOUT the amount (privacy model).
      await this.track('contribution_submitted');

      if (options.autoFlush !== false) {
        // Fire-and-forget: the UI observes results via the store/poll.
        void this.flushOutbox();
      }

      return submission;
    },

    /**
     * Best-effort: add this count to every open plan in every joined group
     * that counts the same zikr. Individual plan failures (not a member,
     * plan ended) are skipped — used by the counter's "count towards
     * goals & groups".
     */
    async propagateToRooms(zikrName: string, delta: number): Promise<number> {
      let applied = 0;
      const [rooms, plans] = await Promise.all([this.listRooms(), this.listSharedPlans()]);
      const roomByCode = new Map(rooms.map((r) => [r.code, r]));
      for (const plan of plans) {
        if (plan.status !== 'active') continue;
        if (!canContribute(plan)) continue;
        if (!plan.zikrs.some((z) => z.name === zikrName)) continue;
        const room = plan.roomCode ? roomByCode.get(plan.roomCode) : undefined;
        if (!room || room.status !== 'active') continue;
        try {
          await this.submitContribution(room.code, plan.id, zikrName, delta);
          applied++;
        } catch {
          // one plan failing must not block the others
        }
      }
      return applied;
    },

    /**
     * Flush the outbox: apply due increments atomically and idempotently.
     * Single-flight — concurrent calls share one run.
     */
    flushOutbox(): Promise<FlushResult> {
      if (flushPromise) return flushPromise;
      flushPromise = (async () => {
        const result: FlushResult = { applied: 0, failed: 0, deferred: 0 };
        if (!backend.isConfigured()) {
          result.deferred = await db.syncOutbox.count();
          return result;
        }

        const now = new Date();
        const due = await db.syncOutbox.where('nextAttemptAt').belowOrEqual(now).sortBy('createdAt');

        for (const item of due) {
          try {
            const { total, periodTotal } = await backend.contribute(
              item.roomCode,
              item.planId,
              item.zikrName,
              item.delta,
              item.eventId
            );
            await db.transaction(
              'rw',
              db.sharedSubmissions,
              db.syncOutbox,
              db.plans,
              async () => {
                await db.sharedSubmissions.where('eventId').equals(item.eventId).modify({
                  syncState: 'synced',
                  note: undefined,
                });
                await db.syncOutbox.delete(item.id!);
                await db.plans.update(item.planId, {
                  total,
                  periodTotal,
                  fetchedAt: new Date(),
                });
              }
            );
            result.applied++;
          } catch (err) {
            const sre = err instanceof SharedRoomError ? err : new SharedRoomError('unknown');
            const attempts = item.attempts + 1;

            // Permanent server rejections never succeed on retry.
            if (sre.permanent || attempts >= 20) {
              await db.transaction('rw', db.sharedSubmissions, db.syncOutbox, async () => {
                await db.sharedSubmissions.where('eventId').equals(item.eventId).modify({
                  syncState: 'failed',
                  note: sre.code,
                });
                await db.syncOutbox.delete(item.id!);
              });
              result.failed++;
            } else {
              await db.syncOutbox.update(item.id!, {
                attempts,
                nextAttemptAt: new Date(Date.now() + backoffDelayMs(attempts)),
              });
              result.deferred++;
            }
          }
        }
        return result;
      })().finally(() => {
        flushPromise = null;
      });
      return flushPromise;
    },
  };
}

export type SharedRoomService = ReturnType<typeof createSharedRoomService>;
