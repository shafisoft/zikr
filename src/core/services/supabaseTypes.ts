/**
 * Supabase wire contract — the SINGLE source of truth for every RPC the
 * app calls: parameter names, parameter types, and return shapes.
 *
 * This mirrors the SQL migrations (`supabase/migrations/0001_init.sql` is
 * canonical; the other files carry byte-identical function bodies,
 * enforced by `npm run check:migrations`) and the RPC list documented in
 * `supabase/EXPOSURE-RULES.md`. When a migration changes a function's
 * signature or payload, edit THAT file first, then this one: every
 * backend adapter calls RPCs through the typed `SupabaseRpc` surface, so
 * a drift here is a compile error at the call sites instead of a runtime
 * `undefined` access after a 200.
 *
 * The json keys below must match the server's `json_build_object` calls
 * exactly — supabase-js hands the payload through untyped, so TypeScript
 * only protects us where these types are actually used.
 *
 * Parameter NAMES and the function set are machine-guarded against the
 * schema via `supabaseDatabase.generated.ts` (regenerate from the local
 * harness with `npm run gen:db-types`): the guards at the bottom of this
 * file fail the build when a migration renames a parameter, adds, or
 * removes a function. Return shapes stay hand-typed on purpose — the
 * generator cannot see inside `returns json`, and its optional-arg
 * modeling (`p?: string` even when the client passes null) would weaken
 * the call sites.
 */

import type { Database } from './supabaseDatabase.generated';

// ---------- Enums (zikr_app.plans check constraints) ----------

export type SupabasePlanMode = 'combined' | 'per-zikr';
export type SupabasePlanPeriod = 'one-time' | 'daily' | 'weekly' | 'monthly';

// ---------- Group state (get_group_state, create_group, join_group, create_plan) ----------

/** The `group` object of a state payload. */
export interface SupabaseGroupSummary {
  id: string;
  code: string;
  title: string;
  ownerId: string;
  status: 'active' | 'closed';
  createdAt: string;
}

/** One zikr of a plan, with server-computed totals. */
export interface SupabasePlanZikrSummary {
  name: string;
  arabic: string | null;
  target: number | null;
  total: number;
  periodTotal: number;
}

/** One plan owned by the group via plan_owners. */
export interface SupabasePlanSummary {
  id: string;
  title: string | null;
  mode: SupabasePlanMode;
  period: SupabasePlanPeriod;
  timeZone: string | null;
  target: number | null;
  total: number;
  periodTotal: number;
  startsAt: string | null;
  endsAt: string | null;
  status: 'active' | 'ended';
  createdAt: string;
  endedAt: string | null;
  zikrs: SupabasePlanZikrSummary[];
}

/** One active member (removed_at is null). */
export interface SupabaseMemberSummary {
  name: string;
  joinedAt: string;
  userId?: string;
}

/** What every group_* state-returning RPC sends back. */
export interface SupabaseGroupState {
  group: SupabaseGroupSummary;
  plans: SupabasePlanSummary[];
  members: SupabaseMemberSummary[];
  isMember: boolean;
}

/** The `p_plan` jsonb argument of create_group/create_plan. */
export interface SupabasePlanPayload {
  title: string | null;
  mode: SupabasePlanMode;
  period: SupabasePlanPeriod;
  timeZone: string | null;
  target: number | null;
  zikrs: Array<{ name: string; arabic: string | null; target: number | null }>;
  startsAt: string | null;
  endsAt: string | null;
}

// ---------- Shared zikr library (0003_shared_zikrs.sql) ----------

/** One item of a pull_verified_zikrs page (a verified shared_zikrs row). */
export interface SupabaseSharedZikr {
  id: string;
  name: string;
  nameBn: string | null;
  arabicText: string | null;
  translation: string | null;
  translationBn: string | null;
  updatedAt: string;
}

/** What pull_verified_zikrs sends back (cursor fields feed the next call). */
export interface SupabasePullPage {
  items: SupabaseSharedZikr[];
  nextCursorUpdatedAt: string | null;
  nextCursorId: string | null;
  hasMore: boolean;
}

/** What share_zikr sends back. */
export interface SupabaseShareResult {
  id: string;
  verified: boolean;
}

// ---------- The RPC surface — exactly the 13 granted functions ----------

/**
 * Each entry: SQL parameter names (they are part of the PostgREST call —
 * a renamed parameter 404s with PGRST202) and the json return shape.
 * `void` functions return nothing usable. uuid/timestamptz arguments are
 * typed `string` — the client only ever passes strings/ISO strings.
 */
export interface SupabaseRpc {
  get_group_state: { params: { p_code: string }; returns: SupabaseGroupState };
  create_group: {
    params: { p_title: string; p_name: string; p_plan: SupabasePlanPayload };
    returns: SupabaseGroupState;
  };
  join_group: { params: { p_code: string; p_name: string }; returns: SupabaseGroupState };
  create_plan: {
    params: { p_code: string; p_plan: SupabasePlanPayload };
    returns: SupabaseGroupState;
  };
  end_plan: { params: { p_code: string; p_plan_id: string }; returns: void };
  contribute: {
    params: {
      p_code: string;
      p_plan_id: string;
      p_zikr_name: string;
      p_delta: number;
      p_event_id: string;
    };
    returns: { total: number; periodTotal: number };
  };
  remove_member: { params: { p_code: string; p_user_id: string }; returns: void };
  leave_group: { params: { p_code: string }; returns: void };
  close_group: { params: { p_code: string }; returns: void };
  get_or_create_device_token: { params: Record<string, never>; returns: string };
  track_event: {
    params: { p_name: string; p_properties?: Record<string, unknown> };
    returns: void;
  };
  share_zikr: {
    params: { p_name: string; p_arabic_text: string | null; p_translation: string | null };
    returns: SupabaseShareResult;
  };
  pull_verified_zikrs: {
    params: { p_cursor_updated_at: string | null; p_cursor_id: string | null };
    returns: SupabasePullPage;
  };
}

export type SupabaseRpcName = keyof SupabaseRpc;

/** Runtime mirror of SupabaseRpcName — for tests and diagnostics. */
export const SUPABASE_RPC_NAMES = [
  'get_group_state',
  'create_group',
  'join_group',
  'create_plan',
  'end_plan',
  'contribute',
  'remove_member',
  'leave_group',
  'close_group',
  'get_or_create_device_token',
  'track_event',
  'share_zikr',
  'pull_verified_zikrs',
] as const satisfies readonly SupabaseRpcName[];

// ---------- Machine guards against SQL drift (generated mirror) ----------

type DbFunctions = Database['public']['Functions'];

/**
 * Functions that live in the public schema but are never called by the
 * app: `purge_expired()` is granted to service_role only (keep-alive
 * purge). Any OTHER server-side addition must be joined to SupabaseRpc —
 * the deliberate-edit rule from supabase/EXPOSURE-RULES.md, enforced by
 * the guard below.
 */
type ServiceOnlyFunctions = 'purge_expired';

type AppFacingDbFunctions = Exclude<keyof DbFunctions, ServiceOnlyFunctions>;

/** `never` here = the SQL function set drifted from SupabaseRpc. */
export type SurfaceInSync = [AppFacingDbFunctions] extends [SupabaseRpcName]
  ? [SupabaseRpcName] extends [AppFacingDbFunctions]
    ? true
    : never
  : never;
export const SURFACE_IN_SYNC: SurfaceInSync = true;

/**
 * `never` for a function = its hand-typed params no longer name exactly
 * the SQL parameters (rename, addition, or removal — the PGRST202 class).
 * The error appears at that function's key in PARAMS_IN_SYNC.
 */
type ParamNamesInSync<F extends SupabaseRpcName> =
  DbFunctions[F]['Args'] extends never
    ? true
    : [keyof SupabaseRpc[F]['params']] extends [keyof DbFunctions[F]['Args']]
      ? [keyof DbFunctions[F]['Args']] extends [keyof SupabaseRpc[F]['params']]
        ? true
        : never
      : never;

export const PARAMS_IN_SYNC: { [F in SupabaseRpcName]: ParamNamesInSync<F> } = {
  get_group_state: true,
  create_group: true,
  join_group: true,
  create_plan: true,
  end_plan: true,
  contribute: true,
  remove_member: true,
  leave_group: true,
  close_group: true,
  get_or_create_device_token: true,
  track_event: true,
  share_zikr: true,
  pull_verified_zikrs: true,
};

/** `never` here = SUPABASE_RPC_NAMES no longer covers every RPC. */
type NamesComplete = [SupabaseRpcName] extends [
  (typeof SUPABASE_RPC_NAMES)[number],
]
  ? true
  : never;
export const NAMES_IN_SYNC: NamesComplete = true;

/**
 * The shape every Supabase backend's private rpc() helper must have:
 * the function name must be on the surface, the params object must carry
 * the SQL parameter names, and the resolved type is the declared return.
 */
export type SupabaseRpcCall = <F extends SupabaseRpcName>(
  fn: F,
  params: SupabaseRpc[F]['params']
) => Promise<SupabaseRpc[F]['returns']>;
