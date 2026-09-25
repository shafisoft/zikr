/**
 * Dumb backend for Shared Rooms (groups + plans).
 *
 * Two uses:
 *  1. Unit tests — deterministic, inspectable state.
 *  2. Running the UI with no Supabase at all: set
 *     VITE_SHARED_ROOMS_BACKEND=mock and the Group tab works end-to-end.
 *
 * State persists to localStorage so groups survive page reloads (joined once =
 * stays joined, exactly like the real backend). Call reset() for a clean slate.
 * It implements the same rules as the production adapter (window checks,
 * plan-targeted idempotent increments, membership, owner checks, recurring
 * period aggregation) so tests exercise the real contract.
 */

import { SharedRoomError } from './contract';
import { currentPeriodStart } from '../../utils/planUtils';
import type {
  CreatePlanInput,
  CreateRoomInput,
  PlanPeriodDTO,
  PlanSummary,
  PlanZikrSummary,
  RoomMemberPayload,
  RoomStatePayload,
  RoomSummary,
  SharedRoomBackend,
} from './contract';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const STORAGE_KEY = 'zikr-mock-backend-v2';

interface MockMember {
  userId: string;
  name: string;
  joinedAt: string;
  removed: boolean;
}

interface MockContribution {
  eventId: string;
  zikrName: string;
  delta: number;
  at: Date;
}

interface MockPlan {
  id: string;
  title: string | null;
  mode: 'combined' | 'per-zikr';
  period: PlanPeriodDTO;
  timeZone: string | null;
  target: number | null;
  startsAt: string | null;
  endsAt: string | null;
  status: 'active' | 'ended';
  createdAt: string;
  endedAt: string | null;
  /** zikr definitions — totals are derived from contributions. */
  zikrs: Array<{ name: string; arabic: string | null; target: number | null; createdAt: string }>;
  contributions: MockContribution[];
}

interface MockRoom {
  room: RoomSummary;
  plans: Map<string, MockPlan>;
  members: Map<string, MockMember>;
}

interface PersistedState {
  rooms: Array<{
    room: RoomSummary;
    plans: Array<MockPlan>;
    members: MockMember[];
  }>;
  deviceToken: string | null;
  currentUserId: string | null;
  userCounter: number;
  roomCounter: number;
  planCounter: number;
}

export class MockSharedRoomBackend implements SharedRoomBackend {
  readonly name = 'mock';

  private rooms = new Map<string, MockRoom>();
  private deviceToken: string | null = null;
  private currentUserId: string | null = null;
  private userCounter = 0;
  private roomCounter = 0;
  private planCounter = 0;
  private events: Array<{ name: string; properties: Record<string, unknown>; at: Date }> = [];
  private loaded = false;

  /** Lazily restore state from localStorage (no-op in non-browser tests). */
  private ensureLoaded(): void {
    if (this.loaded || typeof localStorage === 'undefined') return;
    this.loaded = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedState;
      for (const { room, plans, members } of parsed.rooms) {
        this.rooms.set(room.code, {
          room,
          plans: new Map(plans.map((p) => [p.id, p])),
          members: new Map(members.map((m) => [m.userId, m])),
        });
      }
      this.deviceToken = parsed.deviceToken;
      this.currentUserId = parsed.currentUserId;
      this.userCounter = parsed.userCounter;
      this.roomCounter = parsed.roomCounter;
      // planCounter must round-trip too: resetting to 0 after a reload makes
      // the next insert reuse `mock-plan-1` and overwrite the existing plan.
      this.planCounter = parsed.planCounter || 0;
    } catch {
      // corrupted state — start fresh
    }
  }

  private persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const data: PersistedState = {
        rooms: [...this.rooms.values()].map((r) => ({
          room: r.room,
          plans: [...r.plans.values()],
          members: [...r.members.values()],
        })),
        deviceToken: this.deviceToken,
        currentUserId: this.currentUserId,
        userCounter: this.userCounter,
        roomCounter: this.roomCounter,
        planCounter: this.planCounter,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // storage full/unavailable — mock keeps working in memory
    }
  }

  /** Simulate a different device/member (tests only). */
  actAs(userId: string): void {
    this.ensureLoaded();
    this.currentUserId = userId;
  }

  reset(): void {
    this.ensureLoaded();
    this.rooms.clear();
    this.events = [];
    this.deviceToken = null;
    this.currentUserId = null;
    this.userCounter = 0;
    this.roomCounter = 0;
    this.planCounter = 0;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  /** Test accessor: every tracked usage event, in order. */
  getTrackedEvents(): Array<{ name: string; properties: Record<string, unknown> }> {
    this.ensureLoaded();
    return this.events.map((e) => ({ name: e.name, properties: e.properties }));
  }

  isConfigured(): boolean {
    return true;
  }

  async ensureDeviceToken(): Promise<string> {
    this.ensureLoaded();
    if (!this.deviceToken) {
      this.deviceToken = Array.from(
        { length: 12 },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      ).join('');
      this.persist();
    }
    return this.deviceToken;
  }

  async trackEvent(name: string, properties: Record<string, unknown> = {}): Promise<void> {
    this.events.push({ name, properties, at: new Date() });
  }

  async ensureUserId(): Promise<string> {
    this.ensureLoaded();
    if (!this.currentUserId) {
      this.currentUserId = `mock-user-${++this.userCounter}`;
      this.persist();
    }
    return this.currentUserId;
  }

  private requireUser(): string {
    if (!this.currentUserId) throw new SharedRoomError('not-authenticated');
    return this.currentUserId;
  }

  private findRoom(code: string): MockRoom {
    const normalized = (code || '').toUpperCase().trim();
    const room = this.rooms.get(normalized);
    if (!room) throw new SharedRoomError('room-not-found');
    return room;
  }

  // ---------- plan totals (derived from contribution rows, like the server) ----------

  private periodStart(plan: MockPlan): Date | null {
    if (plan.period === 'one-time') return null; // progress = lifetime total
    return currentPeriodStart(plan.period, plan.timeZone || 'UTC');
  }

  private lifetimeTotal(plan: MockPlan): number {
    return plan.contributions.reduce((sum, c) => sum + c.delta, 0);
  }

  private periodTotalOf(plan: MockPlan, zikrName?: string): number {
    const start = this.periodStart(plan);
    if (!start) {
      return plan.contributions
        .filter((c) => !zikrName || c.zikrName === zikrName)
        .reduce((sum, c) => sum + c.delta, 0);
    }
    return plan.contributions
      .filter(
        (c) => (!zikrName || c.zikrName === zikrName) && new Date(c.at) >= start
      )
      .reduce((sum, c) => sum + c.delta, 0);
  }

  private toPlanSummary(plan: MockPlan): PlanSummary {
    const zikrs: PlanZikrSummary[] = plan.zikrs.map((z) => ({
      name: z.name,
      arabic: z.arabic,
      target: z.target,
      total: plan.contributions
        .filter((c) => c.zikrName === z.name)
        .reduce((sum, c) => sum + c.delta, 0),
      periodTotal: this.periodTotalOf(plan, z.name),
    }));
    return {
      id: plan.id,
      title: plan.title,
      mode: plan.mode,
      period: plan.period,
      timeZone: plan.timeZone,
      target: plan.target,
      total: this.lifetimeTotal(plan),
      periodTotal: this.periodTotalOf(plan),
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      status: plan.status,
      createdAt: plan.createdAt,
      endedAt: plan.endedAt,
      zikrs,
    };
  }

  private toPayload(mock: MockRoom): RoomStatePayload {
    const members: RoomMemberPayload[] = [...mock.members.values()]
      .filter((m) => !m.removed)
      .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
      .map((m) => ({ name: m.name, joinedAt: m.joinedAt, userId: m.userId }));

    const plans = [...mock.plans.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((p) => this.toPlanSummary(p));

    const me = this.currentUserId;
    return {
      group: { ...mock.room },
      plans,
      members,
      isMember: Boolean(me && mock.members.get(me) && !mock.members.get(me)!.removed),
    };
  }

  // ---------- validation + insert (mirrors zikr_app.insert_plan) ----------

  private validatePlanInput(input: CreatePlanInput): void {
    if (input.mode !== 'combined' && input.mode !== 'per-zikr')
      throw new SharedRoomError('invalid-input');
    if (!['one-time', 'daily', 'weekly', 'monthly'].includes(input.period))
      throw new SharedRoomError('invalid-input');
    if (input.mode === 'combined' && (input.target == null || input.target < 1 || input.target > 100000000))
      throw new SharedRoomError('invalid-input');
    if (input.period === 'one-time') {
      if (!input.startsAt || !input.endsAt || input.endsAt.getTime() <= input.startsAt.getTime())
        throw new SharedRoomError('invalid-input');
      if (Date.now() > input.endsAt.getTime()) throw new SharedRoomError('window-ended');
    } else if (!input.timeZone) {
      throw new SharedRoomError('invalid-input');
    }
    if (!Array.isArray(input.zikrs) || input.zikrs.length < 1 || input.zikrs.length > 5)
      throw new SharedRoomError('invalid-input');
    for (const z of input.zikrs) {
      if (!z.name || !z.name.trim()) throw new SharedRoomError('invalid-input');
      if (input.mode === 'per-zikr' && (z.target == null || z.target < 1 || z.target > 100000000))
        throw new SharedRoomError('invalid-input');
    }
  }

  private insertPlan(mock: MockRoom, input: CreatePlanInput): MockPlan {
    this.validatePlanInput(input);
    const plan: MockPlan = {
      id: `mock-plan-${++this.planCounter}`,
      title: input.title?.trim() || null,
      mode: input.mode,
      period: input.period,
      timeZone: input.period === 'one-time' ? null : input.timeZone ?? null,
      target: input.mode === 'combined' ? input.target! : null,
      startsAt: input.period === 'one-time' ? input.startsAt!.toISOString() : null,
      endsAt: input.period === 'one-time' ? input.endsAt!.toISOString() : null,
      status: 'active',
      createdAt: new Date().toISOString(),
      endedAt: null,
      zikrs: input.zikrs.map((z) => ({
        name: z.name.trim(),
        arabic: z.arabic?.trim() || null,
        target: input.mode === 'per-zikr' ? z.target! : null,
        createdAt: new Date().toISOString(),
      })),
      contributions: [],
    };
    mock.plans.set(plan.id, plan);
    return plan;
  }

  // ---------- port surface ----------

  async createRoom(input: CreateRoomInput): Promise<RoomStatePayload> {
    const userId = this.requireUser();
    if (!input.title || !input.title.trim()) throw new SharedRoomError('invalid-input');

    let code = '';
    do {
      code = Array.from(
        { length: 6 },
        () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
      ).join('');
    } while (this.rooms.has(code));

    const mock: MockRoom = {
      room: {
        id: `mock-room-${++this.roomCounter}`,
        code,
        title: input.title.trim(),
        ownerId: userId,
        status: 'active',
        createdAt: new Date().toISOString(),
      },
      plans: new Map(),
      members: new Map(),
    };
    mock.members.set(userId, {
      userId,
      name: input.displayName,
      joinedAt: new Date().toISOString(),
      removed: false,
    });
    this.insertPlan(mock, input.initialPlan);

    this.rooms.set(code, mock);
    this.persist();
    return this.toPayload(mock);
  }

  async joinRoom(code: string, displayName: string): Promise<RoomStatePayload> {
    this.ensureLoaded();
    const userId = this.requireUser();
    const mock = this.findRoom(code);
    if (mock.room.status !== 'active') throw new SharedRoomError('room-closed');

    const existing = mock.members.get(userId);
    if (existing) {
      existing.name = displayName;
      existing.removed = false;
    } else {
      mock.members.set(userId, {
        userId,
        name: displayName,
        joinedAt: new Date().toISOString(),
        removed: false,
      });
    }
    this.persist();
    return this.toPayload(mock);
  }

  async createPlan(code: string, input: CreatePlanInput): Promise<RoomStatePayload> {
    this.ensureLoaded();
    const userId = this.requireUser();
    const mock = this.findRoom(code);
    if (mock.room.status !== 'active') throw new SharedRoomError('room-closed');
    if (mock.room.ownerId !== userId) throw new SharedRoomError('not-owner');
    this.insertPlan(mock, input);
    this.persist();
    return this.toPayload(mock);
  }

  async endPlan(code: string, planId: string): Promise<void> {
    this.ensureLoaded();
    const userId = this.requireUser();
    const mock = this.findRoom(code);
    if (mock.room.ownerId !== userId) throw new SharedRoomError('not-owner');
    const plan = mock.plans.get(planId);
    if (!plan) throw new SharedRoomError('plan-not-found');
    if (plan.status === 'active') {
      plan.status = 'ended';
      plan.endedAt = new Date().toISOString();
    }
    this.persist();
  }

  async contribute(
    code: string,
    planId: string,
    zikrName: string,
    delta: number,
    eventId: string
  ): Promise<{ total: number; periodTotal: number }> {
    this.ensureLoaded();
    const userId = this.requireUser();
    if (!Number.isInteger(delta) || delta < 1 || delta > 10000)
      throw new SharedRoomError('invalid-delta');

    const mock = this.findRoom(code);
    if (mock.room.status !== 'active') throw new SharedRoomError('room-closed');

    const plan = mock.plans.get(planId);
    if (!plan) throw new SharedRoomError('plan-not-found');
    if (plan.status !== 'active') throw new SharedRoomError('plan-ended');

    const now = Date.now();
    if (plan.period === 'one-time') {
      if (plan.startsAt && now < new Date(plan.startsAt).getTime())
        throw new SharedRoomError('window-not-started');
      if (plan.endsAt && now > new Date(plan.endsAt).getTime())
        throw new SharedRoomError('window-ended');
    }

    const zikr = plan.zikrs.find((z) => z.name === (zikrName || '').trim());
    if (!zikr) throw new SharedRoomError('zikr-not-in-plan');

    const member = mock.members.get(userId);
    if (!member || member.removed) throw new SharedRoomError('not-a-member');

    // Idempotent replay: same event id never applies twice (the
    // contribution row IS the ledger — same as the server).
    if (plan.contributions.some((c) => c.eventId === eventId)) {
      return {
        total: this.lifetimeTotal(plan),
        periodTotal: this.periodTotalOf(plan),
      };
    }
    plan.contributions.push({
      eventId,
      zikrName: zikr.name,
      delta,
      at: new Date(now),
    });
    this.persist();
    return {
      total: this.lifetimeTotal(plan),
      periodTotal: this.periodTotalOf(plan),
    };
  }

  async getRoomState(code: string): Promise<RoomStatePayload> {
    this.ensureLoaded();
    return this.toPayload(this.findRoom(code));
  }

  async removeMember(code: string, userId: string): Promise<void> {
    this.ensureLoaded();
    const me = this.requireUser();
    const mock = this.findRoom(code);
    if (mock.room.ownerId !== me) throw new SharedRoomError('not-owner');
    const member = mock.members.get(userId);
    if (member) member.removed = true;
    this.persist();
  }

  async leaveRoom(code: string): Promise<void> {
    this.ensureLoaded();
    const userId = this.requireUser();
    const mock = this.findRoom(code);
    const member = mock.members.get(userId);
    if (member) member.removed = true;
    this.persist();
  }

  async closeRoom(code: string): Promise<void> {
    this.ensureLoaded();
    const me = this.requireUser();
    const mock = this.findRoom(code);
    if (mock.room.ownerId !== me) throw new SharedRoomError('not-owner');
    mock.room.status = 'closed';
    this.persist();
  }
}
