import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../src/core/db/db';
import { createSharedRoomService } from '../../../src/core/services/sharedRoom/service';
import {
  SharedRoomBackend,
  SharedRoomError,
  RoomStatePayload,
  CreatePlanInput,
} from '../../../src/core/services/sharedRoom/contract';
import { Plan, SharedRoom } from '../../../src/core/db/types';

// ---------- test doubles ----------

const ROOM_CODE = 'ABC234';
const PLAN_ID = 'plan-uuid-1';

function makeRoomState(overrides: { planTotal?: number; planPeriodTotal?: number } = {}): RoomStatePayload {
  const now = Date.now();
  return {
    group: {
      id: 'room-uuid-1',
      code: ROOM_CODE,
      title: 'Family Khatma',
      ownerId: 'owner-uid',
      status: 'active',
      createdAt: new Date(now - 86400_000).toISOString(),
    },
    plans: [
      {
        id: PLAN_ID,
        title: null,
        mode: 'combined',
        period: 'one-time',
        timeZone: null,
        target: 1000,
        total: overrides.planTotal ?? 100,
        periodTotal: overrides.planPeriodTotal ?? overrides.planTotal ?? 100,
        startsAt: new Date(now - 86400_000).toISOString(),
        endsAt: new Date(now + 6 * 86400_000).toISOString(),
        status: 'active',
        createdAt: new Date(now - 86400_000).toISOString(),
        endedAt: null,
        zikrs: [
          {
            name: 'SubhanAllah',
            arabic: 'سُبْحَانَ ٱللَّٰهِ',
            target: null,
            total: overrides.planTotal ?? 100,
            periodTotal: overrides.planPeriodTotal ?? overrides.planTotal ?? 100,
          },
        ],
      },
    ],
    members: [
      { name: 'Me', joinedAt: new Date().toISOString(), userId: 'uid-1' },
      { name: 'Umm Ayesha', joinedAt: new Date().toISOString(), userId: 'uid-2' },
    ],
    isMember: true,
  };
}

/** Mock backend with programmable contribute behavior + a full call log. */
function makeMockBackend(state: { total: number; periodTotal: number }) {
  const callLog: Array<{ eventId: string; delta: number; zikrName: string }> = [];
  const appliedEvents: Array<{ eventId: string; delta: number }> = [];
  const trackedEvents: Array<{ name: string; properties: Record<string, unknown> }> = [];
  let contributeBehavior = async (
    eventId: string,
    delta: number
  ): Promise<{ total: number; periodTotal: number }> => {
    if (appliedEvents.some((e) => e.eventId === eventId)) {
      return { total: state.total, periodTotal: state.periodTotal }; // idempotent replay
    }
    appliedEvents.push({ eventId, delta });
    state.total += delta;
    state.periodTotal += delta;
    return { total: state.total, periodTotal: state.periodTotal };
  };

  const backend: SharedRoomBackend = {
    name: 'test-double',
    isConfigured: () => true,
    ensureUserId: async () => 'uid-1',
    ensureDeviceToken: async () => 'MOCKTOKEN12',
    trackEvent: async (name, properties) => {
      trackedEvents.push({ name, properties: properties || {} });
    },
    createRoom: async () => makeRoomState(),
    joinRoom: async () => makeRoomState(),
    createPlan: async (_code, input) => {
      const base = makeRoomState({ planTotal: 0, planPeriodTotal: 0 });
      return {
        ...base,
        plans: [
          {
            ...base.plans[0],
            mode: input.mode,
            period: input.period,
            timeZone: input.timeZone ?? null,
            target: input.target ?? null,
            zikrs: input.zikrs.map((z) => ({
              name: z.name,
              arabic: z.arabic ?? null,
              target: z.target ?? null,
              total: 0,
              periodTotal: 0,
            })),
          },
        ],
      };
    },
    endPlan: async () => {},
    getRoomState: async () => makeRoomState({ planTotal: state.total, planPeriodTotal: state.periodTotal }),
    contribute: async (_code, _planId, zikrName, delta, eventId) => {
      callLog.push({ eventId, delta, zikrName });
      return contributeBehavior(eventId, delta);
    },
    removeMember: async () => {},
    leaveRoom: async () => {},
    closeRoom: async () => {},
  };

  return {
    backend,
    callLog,
    appliedEvents,
    trackedEvents,
    setBehavior(
      fn: (eventId: string, delta: number) => Promise<{ total: number; periodTotal: number }>
    ) {
      contributeBehavior = fn;
    },
  };
}

async function seedRoom(extra: Partial<SharedRoom> = {}, planId: string = PLAN_ID) {
  const payload = makeRoomState();
  const room: SharedRoom = {
    code: payload.group.code,
    id: payload.group.id,
    title: payload.group.title,
    ownerId: payload.group.ownerId,
    status: payload.group.status,
    joinedAt: new Date(),
    fetchedAt: new Date(),
    ...extra,
  };
  await db.sharedRooms.put(room);
  // Mirror the plan like saveRoomState would.
  const summary = payload.plans[0];
  const plan: Plan = {
    id: planId,
    mode: summary.mode,
    period: summary.period,
    target: summary.target ?? undefined,
    zikrs: summary.zikrs.map((z) => ({
      name: z.name,
      arabic: z.arabic,
      total: z.total,
      periodTotal: z.periodTotal,
    })),
    startDate: summary.startsAt ? new Date(summary.startsAt) : undefined,
    endDate: summary.endsAt ? new Date(summary.endsAt) : undefined,
    status: summary.status,
    createdAt: new Date(summary.createdAt),
    roomCode: room.code,
    total: summary.total,
    periodTotal: summary.periodTotal,
    fetchedAt: new Date(),
  };
  await db.plans.put(plan);
  await db.planOwners.put({ planId: plan.id, ownerKind: 'group', ownerId: room.code });
  return { room, plan };
}

beforeEach(async () => {
  await Promise.all([
    db.sharedRooms.clear(),
    db.sharedSubmissions.clear(),
    db.syncOutbox.clear(),
    db.identity.clear(),
    db.plans.clear(),
    db.planOwners.clear(),
  ]);
});

// ---------- tests ----------

describe('sharedRoomService — local-first contribution flow', () => {
  it('records the submission locally and delivers it via flush', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    const submission = await service.submitContribution(ROOM_CODE, PLAN_ID, 'SubhanAllah', 33, {
      autoFlush: false,
    });

    // Local record exists immediately (device-only history).
    const local = await service.getMySubmissions(ROOM_CODE);
    expect(local).toHaveLength(1);
    expect(local[0]).toMatchObject({
      delta: 33,
      planId: PLAN_ID,
      zikrName: 'SubhanAllah',
      syncState: 'pending',
    });

    // Outbox holds the pending increment.
    expect(await db.syncOutbox.count()).toBe(1);
    expect(await db.syncOutbox.toArray()).toEqual([
      expect.objectContaining({ eventId: submission.eventId, delta: 33, planId: PLAN_ID }),
    ]);

    const result = await service.flushOutbox();
    expect(result.applied).toBe(1);

    // Submission marked synced; server totals mirrored into the plan cache.
    const after = await service.getMySubmissions(ROOM_CODE);
    expect(after[0].syncState).toBe('synced');
    expect(await db.syncOutbox.count()).toBe(0);
    const plan = await db.plans.get(PLAN_ID);
    expect(plan?.total).toBe(133);
    expect(plan?.periodTotal).toBe(133);
    // The increment used the exact client event id (idempotency key).
    expect(mock.appliedEvents).toEqual([{ eventId: submission.eventId, delta: 33 }]);
  });

  it('keeps the submission queued on network failure and delivers the SAME event id on retry', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    let attempts = 0;
    mock.setBehavior(async () => {
      attempts++;
      if (attempts === 1) throw new SharedRoomError('network', 'offline');
      return { total: 145, periodTotal: 145 };
    });
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    const submission = await service.submitContribution(ROOM_CODE, PLAN_ID, 'SubhanAllah', 45, {
      autoFlush: false,
    });
    const first = await service.flushOutbox();
    expect(first.deferred).toBe(1);
    expect((await service.getMySubmissions(ROOM_CODE))[0].syncState).toBe('pending');
    expect(await db.syncOutbox.count()).toBe(1);

    // Force the backoff window open and flush again.
    const item = (await db.syncOutbox.toArray())[0];
    await db.syncOutbox.update(item.id!, { nextAttemptAt: new Date(Date.now() - 1) });
    const second = await service.flushOutbox();
    expect(second.applied).toBe(1);

    const after = await service.getMySubmissions(ROOM_CODE);
    expect(after[0].syncState).toBe('synced');
    // Same eventId both attempts → server-side idempotency prevents double count.
    expect(mock.callLog.filter((e) => e.eventId === submission.eventId)).toHaveLength(2);
    const plan = await db.plans.get(PLAN_ID);
    expect(plan?.total).toBe(145);
  });

  it('marks submissions as failed on permanent server rejection (plan ended)', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    mock.setBehavior(async () => {
      throw new SharedRoomError('plan-ended');
    });
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    await service.submitContribution(ROOM_CODE, PLAN_ID, 'SubhanAllah', 10, { autoFlush: false });
    const result = await service.flushOutbox();

    expect(result.failed).toBe(1);
    expect(await db.syncOutbox.count()).toBe(0);
    const after = await service.getMySubmissions(ROOM_CODE);
    expect(after[0].syncState).toBe('failed');
    expect(after[0].note).toBe('plan-ended');
  });

  it('defers everything when the backend is not configured', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    mock.backend.isConfigured = () => false;
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    await service.submitContribution(ROOM_CODE, PLAN_ID, 'SubhanAllah', 5, { autoFlush: false });
    const result = await service.flushOutbox();

    expect(result).toEqual({ applied: 0, failed: 0, deferred: 1 });
    expect(await db.syncOutbox.count()).toBe(1);
    expect(mock.appliedEvents).toHaveLength(0);
  });

  it('rejects invalid deltas without recording anything', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    await expect(
      service.submitContribution(ROOM_CODE, PLAN_ID, 'SubhanAllah', 0)
    ).rejects.toMatchObject({ code: 'invalid-delta' });
    await expect(
      service.submitContribution(ROOM_CODE, PLAN_ID, 'SubhanAllah', 20000)
    ).rejects.toMatchObject({ code: 'invalid-delta' });
    expect(await db.sharedSubmissions.count()).toBe(0);
    expect(await db.syncOutbox.count()).toBe(0);
  });

  it('issues and persists a server-generated device token via ensureIdentity', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    const service = createSharedRoomService(mock.backend);

    const identity = await service.ensureIdentity('Ahmed');
    expect(identity.token).toBe('MOCKTOKEN12');

    // Stable across calls — issued once, reused afterwards.
    const again = await service.ensureIdentity();
    expect(again.token).toBe('MOCKTOKEN12');
    expect(again.displayName).toBe('Ahmed');
  });

  it('tracks usage events without ever recording the contribution amount', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    await service.submitContribution(ROOM_CODE, PLAN_ID, 'SubhanAllah', 33, { autoFlush: false });
    await service.joinRoom(ROOM_CODE, { userId: 'uid-1', displayName: 'Ahmed', createdAt: new Date() });

    const names = mock.trackedEvents.map((e) => e.name);
    expect(names).toContain('contribution_submitted');
    expect(names).toContain('room_joined');

    // Privacy: the submission event carries NO amount.
    const submissionEvent = mock.trackedEvents.find((e) => e.name === 'contribution_submitted');
    expect(submissionEvent).toBeDefined();
    expect(Object.values(submissionEvent!.properties)).not.toContain(33);
    expect(submissionEvent!.properties).not.toHaveProperty('delta');
    expect(submissionEvent!.properties).not.toHaveProperty('amount');
  });
});

describe('sharedRoomService — propagateToRooms (counter auto-count)', () => {
  it('fans out to every open plan counting the zikr across joined groups', async () => {
    const mock = makeMockBackend({ total: 0, periodTotal: 0 });
    const service = createSharedRoomService(mock.backend);

    // Group 1: two plans, one counting the zikr (recurring), one not.
    const { room: room1 } = await seedRoom();
    const otherPlan: Plan = {
      id: 'plan-uuid-2',
      mode: 'combined',
      period: 'daily',
      timeZone: 'UTC',
      target: 500,
      zikrs: [{ name: 'Astaghfirullah' }],
      status: 'active',
      createdAt: new Date(),
      roomCode: room1.code,
      total: 0,
      periodTotal: 0,
    };
    await db.plans.put(otherPlan);
    await db.planOwners.put({ planId: otherPlan.id, ownerKind: 'group', ownerId: room1.code });

    // Group 2: another room whose plan counts the same zikr.
    await seedRoom({ code: 'XYZ789', id: 'room-uuid-2' }, 'plan-uuid-2');

    // Group 3: counts the zikr but the window ended.
    await seedRoom({ code: 'QQQ111', id: 'room-uuid-3' }, 'plan-uuid-3');
    await db.plans.update('plan-uuid-3', { endDate: new Date(Date.now() - 1000) });

    const applied = await service.propagateToRooms('SubhanAllah', 12);

    // Room 1's one-time plan (seedRoom) + room 2's plan = 2 applications.
    expect(applied).toBe(2);
    const submissions = await db.sharedSubmissions.toArray();
    const targets = submissions.map((s) => s.roomCode).sort();
    expect(targets).toEqual([ROOM_CODE, 'XYZ789']);
    expect(submissions.every((s) => s.zikrName === 'SubhanAllah' && s.delta === 12)).toBe(true);
  });
});

describe('sharedRoomService — never re-ask joined members', () => {
  it('silently rejoins a previously-joined room when the device identity changed', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    let joinCalls = 0;
    mock.backend.getRoomState = async () => ({
      ...makeRoomState({ planTotal: 100 }),
      isMember: false, // server no longer knows this device
    });
    mock.backend.joinRoom = async () => {
      joinCalls++;
      return makeRoomState({ planTotal: 100 });
    };
    // Room was joined with a PREVIOUS device identity
    await seedRoom({ joinedWithUserId: 'old-device-uid' });

    const service = createSharedRoomService(mock.backend);
    const { isMember } = await service.fetchRoomState(ROOM_CODE);

    expect(joinCalls).toBe(1);
    expect(isMember).toBe(true);
  });

  it('silently rejoins a room from my list even when the backend dropped my membership', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    let joinCalls = 0;
    mock.backend.getRoomState = async () => ({
      ...makeRoomState({ planTotal: 100 }),
      isMember: false,
    });
    mock.backend.joinRoom = async () => {
      joinCalls++;
      return makeRoomState({ planTotal: 100 });
    };
    // Same identity — but membership was lost server-side (backend reset,
    // data loss). The room is in my list, so I am a member: rejoin silently.
    await seedRoom({ joinedWithUserId: 'uid-1' });

    const service = createSharedRoomService(mock.backend);
    const { isMember } = await service.fetchRoomState(ROOM_CODE);

    expect(joinCalls).toBe(1);
    expect(isMember).toBe(true);
  });

  it('does not auto-rejoin a room this device never joined', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    let joinCalls = 0;
    mock.backend.getRoomState = async () => ({
      ...makeRoomState({ planTotal: 100 }),
      isMember: false,
    });
    mock.backend.joinRoom = async () => {
      joinCalls++;
      return makeRoomState({ planTotal: 100 });
    };
    // No cached mirror at all (cold deep link) — nothing marks this as "mine".

    const service = createSharedRoomService(mock.backend);
    const { isMember } = await service.fetchRoomState(ROOM_CODE);
    expect(joinCalls).toBe(0);
    expect(isMember).toBe(false);
  });

  it('drops the local mirror AND plans when the room no longer exists server-side', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    mock.backend.getRoomState = async () => {
      throw new SharedRoomError('room-not-found');
    };
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    await expect(service.fetchRoomState(ROOM_CODE)).rejects.toMatchObject({
      code: 'room-not-found',
    });
    // Stale mirror cleaned up — room AND its plan mirrors leave the local db.
    expect(await db.sharedRooms.get(ROOM_CODE)).toBeUndefined();
    expect(await db.plans.get(PLAN_ID)).toBeUndefined();
    expect(await db.planOwners.get([PLAN_ID, ROOM_CODE])).toBeUndefined();
  });
});

describe('sharedRoomService — groups and plans', () => {
  it('joins a room and mirrors its state (incl. plans) locally', async () => {
    const mock = makeMockBackend({ total: 100, periodTotal: 100 });
    const service = createSharedRoomService(mock.backend);
    const identity = { userId: 'uid-1', displayName: 'Tester', createdAt: new Date() };

    const room = await service.joinRoom(' abc234 ', identity); // normalization: spaces + case

    expect(room.code).toBe(ROOM_CODE);
    expect(room.title).toBe('Family Khatma');
    expect(room.joinedWithUserId).toBe('uid-1');
    expect(await service.listRooms()).toHaveLength(1);

    const plans = await service.getRoomPlans(ROOM_CODE);
    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({ id: PLAN_ID, roomCode: ROOM_CODE, total: 100 });
  });

  it('refreshes plans/totals/members from the server', async () => {
    const mock = makeMockBackend({ total: 250, periodTotal: 250 });
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    const { room, plans, members, isMember } = await service.fetchRoomState(ROOM_CODE);

    expect(room.status).toBe('active');
    expect(plans[0].total).toBe(250);
    expect(members.map((m) => m.name)).toContain('Umm Ayesha');
    expect(isMember).toBe(true);
    expect((await db.plans.get(PLAN_ID))?.total).toBe(250);
  });

  it('creates a plan and mirrors the returned state', async () => {
    const mock = makeMockBackend({ total: 10, periodTotal: 10 });
    const input: CreatePlanInput = {
      mode: 'per-zikr',
      period: 'weekly',
      timeZone: 'UTC',
      zikrs: [
        { name: 'Salawat', target: 100 },
        { name: 'Istighfar', target: 50 },
      ],
    };
    const service = createSharedRoomService(mock.backend);

    const plans = await service.createPlan(ROOM_CODE, input);

    expect(plans).toHaveLength(1);
    expect(plans[0].mode).toBe('per-zikr');
    expect(await db.plans.get(PLAN_ID)).toMatchObject({ id: PLAN_ID, roomCode: ROOM_CODE });
    expect(mock.trackedEvents.map((e) => e.name)).toContain('plan_created');
  });

  it('ends a plan locally immediately after the server confirms', async () => {
    const mock = makeMockBackend({ total: 10, periodTotal: 10 });
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    await service.endPlan(ROOM_CODE, PLAN_ID);

    expect(await db.plans.get(PLAN_ID)).toMatchObject({ status: 'ended' });
  });

  it('leaving a room removes its plans and owner rows too', async () => {
    const mock = makeMockBackend({ total: 10, periodTotal: 10 });
    const service = createSharedRoomService(mock.backend);
    await seedRoom();

    await service.leaveRoom(ROOM_CODE);

    expect(await db.sharedRooms.get(ROOM_CODE)).toBeUndefined();
    expect(await db.plans.get(PLAN_ID)).toBeUndefined();
    expect(await db.planOwners.get([PLAN_ID, ROOM_CODE])).toBeUndefined();
  });
});
