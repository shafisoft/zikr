import { describe, it, expect, beforeEach } from 'vitest';
import { MockSharedRoomBackend } from '../../../src/core/services/sharedRoom/mockBackend';
import { SharedRoomError } from '../../../src/core/services/sharedRoom/contract';
import type { CreatePlanInput } from '../../../src/core/services/sharedRoom/contract';

/**
 * The MockSharedRoomBackend is the swappable "dumb testing class" for the
 * groups feature: same contract, same rules, zero infrastructure.
 * These tests pin the rules it must keep honoring.
 */

function oneTimePlan(overrides: Partial<CreatePlanInput> = {}): CreatePlanInput {
  return {
    mode: 'combined',
    period: 'one-time',
    target: 1000,
    zikrs: [{ name: 'SubhanAllah' }],
    startsAt: new Date(Date.now() - 1000),
    endsAt: new Date(Date.now() + 86400_000),
    ...overrides,
  };
}

function recurringPlan(period: 'daily' | 'weekly' | 'monthly'): CreatePlanInput {
  return {
    mode: 'combined',
    period,
    timeZone: 'UTC',
    target: 100,
    zikrs: [{ name: 'SubhanAllah' }],
  };
}

describe('MockSharedRoomBackend', () => {
  let backend: MockSharedRoomBackend;
  let roomCode: string;

  beforeEach(async () => {
    backend = new MockSharedRoomBackend();
    backend.reset(); // clear localStorage-persisted state from prior tests
    await backend.ensureUserId(); // the device identity (service does this in the real flow)
    const payload = await backend.createRoom({
      title: 'Family Khatma',
      displayName: 'Owner',
      initialPlan: oneTimePlan(),
    });
    roomCode = payload.group.code;
  });

  it('creates a group with a 6-char code, the creator as first member, and one plan', async () => {
    expect(roomCode).toMatch(/^[A-HJ-KMNP-Z2-9]{6}$/);
    const state = await backend.getRoomState(roomCode);
    expect(state.plans).toHaveLength(1);
    expect(state.plans[0]).toMatchObject({
      mode: 'combined',
      period: 'one-time',
      target: 1000,
      total: 0,
      status: 'active',
    });
    expect(state.plans[0].zikrs[0]).toMatchObject({ name: 'SubhanAllah', total: 0 });
    expect(state.members).toHaveLength(1);
    expect(state.isMember).toBe(true);
  });

  it('lets a second device join and contribute to a plan', async () => {
    backend.actAs('device-2');
    await backend.joinRoom(roomCode, 'Umm Ayesha');

    const planId = (await backend.getRoomState(roomCode)).plans[0].id;
    const { total } = await backend.contribute(roomCode, planId, 'SubhanAllah', 33, 'event-1');
    expect(total).toBe(33);

    const state = await backend.getRoomState(roomCode);
    expect(state.plans[0].total).toBe(33);
    expect(state.members.map((m) => m.name)).toContain('Umm Ayesha');
  });

  it('never applies the same event id twice', async () => {
    const planId = (await backend.getRoomState(roomCode)).plans[0].id;
    const first = await backend.contribute(roomCode, planId, 'SubhanAllah', 40, 'event-1');
    const replay = await backend.contribute(roomCode, planId, 'SubhanAllah', 40, 'event-1');
    expect(first.total).toBe(40);
    expect(replay.total).toBe(40); // unchanged
  });

  it('rejects contributions to a zikr that is not in the plan', async () => {
    const planId = (await backend.getRoomState(roomCode)).plans[0].id;
    await expect(
      backend.contribute(roomCode, planId, 'Astaghfirullah', 10, 'e1')
    ).rejects.toMatchObject({ code: 'zikr-not-in-plan' });
  });

  it('rejects contributions to an unknown plan', async () => {
    await expect(
      backend.contribute(roomCode, 'nope', 'SubhanAllah', 10, 'e1')
    ).rejects.toMatchObject({ code: 'plan-not-found' });
  });

  it('rejects non-members and honors owner checks', async () => {
    backend.actAs('stranger-device');
    const planId = (await backend.getRoomState(roomCode)).plans[0].id;
    await expect(backend.contribute(roomCode, planId, 'SubhanAllah', 10, 'e1')).rejects.toMatchObject({
      code: 'not-a-member',
    });
    await expect(backend.closeRoom(roomCode)).rejects.toMatchObject({ code: 'not-owner' });

    backend.actAs('mock-user-1'); // the creator
    await backend.closeRoom(roomCode);
    const state = await backend.getRoomState(roomCode);
    expect(state.group.status).toBe('closed');
  });

  it('rejects contributions outside a one-time window', async () => {
    const payload = await backend.createRoom({
      title: 'Not started yet',
      displayName: 'Owner',
      initialPlan: oneTimePlan({
        startsAt: new Date(Date.now() + 86400_000),
        endsAt: new Date(Date.now() + 2 * 86400_000),
      }),
    });
    const planId = payload.plans[0].id;
    await expect(
      backend.contribute(payload.group.code, planId, 'SubhanAllah', 10, 'e1')
    ).rejects.toMatchObject({ code: 'window-not-started' });
  });

  it('groups persist: the owner can add more plans, ended plans stay', async () => {
    // Owner starts a second (recurring) plan in the same group.
    await backend.createPlan(roomCode, recurringPlan('daily'));
    let state = await backend.getRoomState(roomCode);
    expect(state.plans).toHaveLength(2);

    // End the one-time plan; the group keeps it as history.
    const oneTime = state.plans.find((p) => p.period === 'one-time')!;
    await backend.endPlan(roomCode, oneTime.id);
    state = await backend.getRoomState(roomCode);
    expect(state.plans.find((p) => p.status === 'ended')).toBeTruthy();
    expect(state.group.status).toBe('active'); // the group itself lives on

    // The recurring plan accepts contributions.
    const daily = state.plans.find((p) => p.period === 'daily')!;
    const { total, periodTotal } = await backend.contribute(roomCode, daily.id, 'SubhanAllah', 25, 'e-d1');
    expect(total).toBe(25);
    expect(periodTotal).toBe(25);
  });

  it('only the owner may create or end plans', async () => {
    backend.actAs('device-2');
    await backend.joinRoom(roomCode, 'Member');
    await expect(backend.createPlan(roomCode, recurringPlan('weekly'))).rejects.toMatchObject({
      code: 'not-owner',
    });
    const planId = (await backend.getRoomState(roomCode)).plans[0].id;
    await expect(backend.endPlan(roomCode, planId)).rejects.toMatchObject({ code: 'not-owner' });
  });

  it('per-zikr plans track each zikr separately and complete only when all hit target', async () => {
    await backend.createPlan(roomCode, {
      mode: 'per-zikr',
      period: 'one-time',
      zikrs: [
        { name: 'Salawat', target: 100 },
        { name: 'Istighfar', target: 50 },
      ],
      startsAt: new Date(Date.now() - 1000),
      endsAt: new Date(Date.now() + 86400_000),
    });
    const state = await backend.getRoomState(roomCode);
    const planId = state.plans.find((p) => p.mode === 'per-zikr')!.id;

    await backend.contribute(roomCode, planId, 'Salawat', 100, 'pz-1');
    await backend.contribute(roomCode, planId, 'Istighfar', 25, 'pz-2');

    const mid = await backend.getRoomState(roomCode);
    const zikrs = mid.plans.find((p) => p.mode === 'per-zikr')!.zikrs;
    expect(zikrs.find((z) => z.name === 'Salawat')?.total).toBe(100);
    expect(zikrs.find((z) => z.name === 'Istighfar')?.total).toBe(25);

    await backend.contribute(roomCode, planId, 'Istighfar', 25, 'pz-3');
    const done = await backend.getRoomState(roomCode);
    const doneZikrs = done.plans.find((p) => p.mode === 'per-zikr')!.zikrs;
    expect(doneZikrs.every((z) => (z.total ?? 0) >= (z.target ?? Infinity))).toBe(true);
  });

  it('joining is open forever (no window check on the group itself)', async () => {
    // A group whose only plan has ENDED still accepts new members.
    const planId = (await backend.getRoomState(roomCode)).plans[0].id;
    await backend.endPlan(roomCode, planId);

    backend.actAs('late-joiner');
    const state = await backend.joinRoom(roomCode, 'Late but welcome');
    expect(state.isMember).toBe(true);
  });

  it('round-trips through create → contribute → state with totals persisted', async () => {
    const planId = (await backend.getRoomState(roomCode)).plans[0].id;
    await backend.contribute(roomCode, planId, 'SubhanAllah', 10, 'e-a');
    await backend.contribute(roomCode, planId, 'SubhanAllah', 23, 'e-b');
    const state = await backend.getRoomState(roomCode);
    expect(state.plans[0].total).toBe(33);
  });

  it('produces SharedRoomError instances (not raw errors)', async () => {
    await expect(backend.getRoomState('ZZZ999')).rejects.toBeInstanceOf(SharedRoomError);
  });

  it('issues a stable 12-char device token and records usage events', async () => {
    const token = await backend.ensureDeviceToken();
    expect(token).toHaveLength(12);
    expect(await backend.ensureDeviceToken()).toBe(token); // stable

    await backend.trackEvent('app_opened');
    await backend.trackEvent('room_created', { window: 'week' });

    const events = backend.getTrackedEvents();
    expect(events.map((e) => e.name)).toEqual(['app_opened', 'room_created']);
    expect(events[1].properties).toEqual({ window: 'week' });
  });

  it('persists groups, plans, and totals across instances (reload survival)', async () => {
    const planId = (await backend.getRoomState(roomCode)).plans[0].id;
    await backend.contribute(roomCode, planId, 'SubhanAllah', 10, 'persist-e1');
    const firstToken = await backend.ensureDeviceToken(); // issued + persisted

    // A brand-new instance (simulating an app reload) sees the same state.
    const second = new MockSharedRoomBackend();
    await second.ensureUserId(); // service re-establishes identity on boot
    const state = await second.getRoomState(roomCode);
    expect(state.plans[0].total).toBe(10);
    expect(state.isMember).toBe(true);
    expect(await second.ensureDeviceToken()).toBe(firstToken);
  });
});
