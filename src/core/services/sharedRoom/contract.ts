/**
 * Shared Rooms — backend contract (the port).
 *
 * This module defines EVERYTHING the rest of the app knows about the sync
 * backend: the callable surface, the payload shapes, and the error taxonomy.
 * It must never import a concrete backend (Supabase or otherwise).
 *
 * Swapping backends = implementing `SharedRoomBackend` and returning it from
 * the factory in ./index.ts. `MockSharedRoomBackend` is the reference "dumb
 * testing class"; `SupabaseSharedRoomBackend` is the production adapter.
 * See docs/SharedGoals-Design.md
 *
 * Model (v2 of the backend, migration 0002): a room is a persistent GROUP;
 * targets live on PLANS owned by the group via the plan_owners relation.
 * Contributions target one zikr of one plan.
 */

// ---------- Error taxonomy ----------

export type SharedRoomErrorCode =
  | 'not-configured'
  | 'not-authenticated'
  | 'captcha-failed'
  | 'network'
  | 'room-not-found'
  | 'room-closed'
  | 'room-full'
  | 'plan-not-found'
  | 'plan-ended'
  | 'zikr-not-in-plan'
  | 'window-not-started'
  | 'window-ended'
  | 'not-a-member'
  | 'not-owner'
  | 'invalid-delta'
  | 'invalid-input'
  | 'unknown';

export class SharedRoomError extends Error {
  readonly code: SharedRoomErrorCode;
  /** Permanent errors will never succeed on retry — dropped from the outbox. */
  readonly permanent: boolean;

  constructor(code: SharedRoomErrorCode, message?: string) {
    super(message || code);
    this.name = 'SharedRoomError';
    this.code = code;
    this.permanent = !['network', 'unknown', 'not-authenticated'].includes(code);
  }
}

// ---------- Payload shapes (transport-agnostic; dates as ISO strings) ----------

/** A persistent group: code, title, owner, status — no goal fields. */
export interface RoomSummary {
  id: string;
  code: string;
  title: string;
  ownerId: string;
  status: 'active' | 'closed';
  createdAt: string;
}

/** One zikr of a plan: its definition plus server-computed totals. */
export interface PlanZikrSummary {
  name: string;
  arabic: string | null;
  /** Per-zikr target (mode 'per-zikr' only). */
  target: number | null;
  /** Lifetime total for this zikr. */
  total: number;
  /** Current-period total (recurring plans; mirrors total for one-time). */
  periodTotal: number;
}

export type PlanModeDTO = 'combined' | 'per-zikr';
export type PlanPeriodDTO = 'one-time' | 'daily' | 'weekly' | 'monthly';

export interface PlanSummary {
  id: string;
  title: string | null;
  mode: PlanModeDTO;
  period: PlanPeriodDTO;
  timeZone: string | null;
  /** Combined target (mode 'combined' only). */
  target: number | null;
  /** Lifetime combined total. */
  total: number;
  /** Combined total within the current period (recurring plans). */
  periodTotal: number;
  startsAt: string | null;
  endsAt: string | null;
  status: 'active' | 'ended';
  createdAt: string;
  endedAt: string | null;
  zikrs: PlanZikrSummary[];
}

export interface RoomMemberPayload {
  name: string;
  joinedAt: string;
  /** Server-side uid — needed for owner removal; carries no contribution data. */
  userId?: string;
}

export interface RoomStatePayload {
  room: RoomSummary;
  plans: PlanSummary[];
  members: RoomMemberPayload[];
  isMember: boolean;
}

/** A plan definition to create (group variant — zikrs by name, no local ids). */
export interface CreatePlanInput {
  title?: string;
  mode: PlanModeDTO;
  period: PlanPeriodDTO;
  /** Recurring plans: the creator's IANA timezone (shared reset moment). */
  timeZone?: string;
  /** Combined target (mode 'combined' only). */
  target?: number;
  /** 1..5 zikrs by name; per-zikr targets when mode 'per-zikr'. */
  zikrs: Array<{ name: string; arabic?: string; target?: number }>;
  /** One-time window. */
  startsAt?: Date;
  endsAt?: Date;
}

export interface CreateRoomInput {
  title: string;
  displayName: string;
  /** The group's first plan, created atomically with the room. */
  initialPlan: CreatePlanInput;
}

// ---------- The port ----------

/**
 * Usage-metrics capability. Implementations should treat tracking as
 * best-effort: metrics must never break the app or block a write.
 *
 * Privacy rule (docs/SharedGoals-Design.md): events describe USAGE, never
 * contributions — no dhikr amounts, nothing per-member.
 */
export interface SharedRoomUsageTracker {
  /**
   * Return this device's stable server-generated token (issued once,
   * then stored client-side in IndexedDB). Also refreshes last-seen.
   */
  ensureDeviceToken(): Promise<string>;

  /** Fire-and-forget usage event. Implementations must never throw. */
  trackEvent(name: string, properties?: Record<string, unknown>): Promise<void>;
}

export interface SharedRoomBackend extends SharedRoomUsageTracker {
  /** Human-readable backend name (diagnostics). */
  readonly name: string;

  /** Whether the backend has everything it needs to operate. */
  isConfigured(): boolean;

  /** Ensure a stable no-login identity for this device; returns its uid. */
  ensureUserId(): Promise<string>;

  /** Create a group + its first plan; creator becomes the first member. */
  createRoom(input: CreateRoomInput): Promise<RoomStatePayload>;
  joinRoom(code: string, displayName: string): Promise<RoomStatePayload>;

  /** Owner adds another plan to a group (several may run concurrently). */
  createPlan(code: string, input: CreatePlanInput): Promise<RoomStatePayload>;

  /** Owner retires a plan early. */
  endPlan(code: string, planId: string): Promise<void>;

  /**
   * Apply an atomic, idempotent increment to one zikr of one plan.
   * `eventId` is generated by the client; backends MUST dedupe on it.
   */
  contribute(
    code: string,
    planId: string,
    zikrName: string,
    delta: number,
    eventId: string
  ): Promise<{ total: number; periodTotal: number }>;

  getRoomState(code: string): Promise<RoomStatePayload>;
  removeMember(code: string, userId: string): Promise<void>;
  leaveRoom(code: string): Promise<void>;
  closeRoom(code: string): Promise<void>;
}
