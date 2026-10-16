/**
 * Supabase wire contract — the SINGLE source of truth for every RPC the
 * app calls: parameter names, parameter types, and return shapes.
 *
 * This mirrors the SQL migration (`supabase/migrations/20261014000000_zikr_platform_init.sql`,
 * the consolidated platform init — see `supabase/README.md`) and the RPC list documented in
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
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * The client all three adapters share (created dynamically with
 * `db: { schema: 'zikr' }` — see the supabaseBackend files). The Database
 * generic is deliberately `any`: the app never reads tables over
 * PostgREST, and every RPC's params/return shape is hand-typed in
 * `SupabaseRpc` below and machine-guarded against the generated schema by
 * `supabaseRpcSurface.test.ts`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseZikrClient = SupabaseClient<any, any, 'zikr'>;

// ---------- Enums (zikr_private.plans check constraints) ----------

export type SupabasePlanMode = 'combined' | 'per-zikr';
export type SupabasePlanPeriod = 'one-time' | 'daily' | 'weekly' | 'monthly';

// ---------- Group state (zikr_get_group_state, zikr_create_group, zikr_join_group, zikr_create_plan) ----------

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

/** The `p_plan` jsonb argument of zikr_create_group/zikr_create_plan. */
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

// ---------- Shared zikr library (shared zikr library) ----------

/** One item of a zikr_pull_verified_zikrs page (a verified shared_zikrs row). */
export interface SupabaseSharedZikr {
  id: string;
  name: string;
  nameBn: string | null;
  arabicText: string | null;
  translation: string | null;
  translationBn: string | null;
  updatedAt: string;
}

/** What zikr_pull_verified_zikrs sends back (cursor fields feed the next call). */
export interface SupabasePullPage {
  items: SupabaseSharedZikr[];
  nextCursorUpdatedAt: string | null;
  nextCursorId: string | null;
  hasMore: boolean;
}

/** What zikr_share_zikr sends back. */
export interface SupabaseShareResult {
  id: string;
  verified: boolean;
}

// ---------- Feedback (feedback) ----------

/** What zikr_submit_feedback sends back. */
export interface SupabaseFeedbackResult {
  id: string;
}

// ---------- The RPC surface — exactly the 14 granted functions ----------

/**
 * Each entry: SQL parameter names (they are part of the PostgREST call —
 * a renamed parameter 404s with PGRST202) and the json return shape.
 * `void` functions return nothing usable. uuid/timestamptz arguments are
 * typed `string` — the client only ever passes strings/ISO strings.
 */
export interface SupabaseRpc {
  zikr_get_group_state: { params: { p_code: string }; returns: SupabaseGroupState };
  zikr_create_group: {
    params: { p_title: string; p_name: string; p_plan: SupabasePlanPayload };
    returns: SupabaseGroupState;
  };
  zikr_join_group: { params: { p_code: string; p_name: string }; returns: SupabaseGroupState };
  zikr_create_plan: {
    params: { p_code: string; p_plan: SupabasePlanPayload };
    returns: SupabaseGroupState;
  };
  zikr_end_plan: { params: { p_code: string; p_plan_id: string }; returns: void };
  zikr_contribute: {
    params: {
      p_code: string;
      p_plan_id: string;
      p_zikr_name: string;
      p_delta: number;
      p_event_id: string;
    };
    returns: { total: number; periodTotal: number };
  };
  zikr_remove_member: { params: { p_code: string; p_user_id: string }; returns: void };
  zikr_leave_group: { params: { p_code: string }; returns: void };
  zikr_close_group: { params: { p_code: string }; returns: void };
  zikr_get_or_create_device_token: { params: Record<PropertyKey, never>; returns: string };
  zikr_track_event: {
    params: { p_name: string; p_properties?: Record<string, unknown> };
    returns: void;
  };
  zikr_share_zikr: {
    params: { p_name: string; p_arabic_text: string | null; p_translation: string | null };
    returns: SupabaseShareResult;
  };
  zikr_pull_verified_zikrs: {
    params: { p_cursor_updated_at: string | null; p_cursor_id: string | null };
    returns: SupabasePullPage;
  };
  zikr_submit_feedback: {
    params: {
      p_category: string;
      p_message: string;
      p_email: string | null;
      p_app_version: string | null;
      p_locale: string | null;
      p_user_agent: string | null;
      p_captcha_token: string | null;
    };
    returns: SupabaseFeedbackResult;
  };
}

export type SupabaseRpcName = keyof SupabaseRpc;

/** Runtime mirror of SupabaseRpcName — for tests and diagnostics. */
export const SUPABASE_RPC_NAMES = [
  'zikr_get_group_state',
  'zikr_create_group',
  'zikr_join_group',
  'zikr_create_plan',
  'zikr_end_plan',
  'zikr_contribute',
  'zikr_remove_member',
  'zikr_leave_group',
  'zikr_close_group',
  'zikr_get_or_create_device_token',
  'zikr_track_event',
  'zikr_share_zikr',
  'zikr_pull_verified_zikrs',
  'zikr_submit_feedback',
] as const satisfies readonly SupabaseRpcName[];

// ---------- Machine guards against SQL drift (generated mirror) ----------

type DbFunctions = Database['zikr']['Functions'];

/**
 * Functions that live in the exposed zikr schema but are never called by
 * the app: `zikr_purge_expired()` is granted to service_role only (keep-alive
 * purge). Any OTHER server-side addition must be joined to SupabaseRpc —
 * the deliberate-edit rule from supabase/EXPOSURE-RULES.md, enforced by
 * the guard below.
 */
type ServiceOnlyFunctions = 'zikr_purge_expired';

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
  zikr_get_group_state: true,
  zikr_create_group: true,
  zikr_join_group: true,
  zikr_create_plan: true,
  zikr_end_plan: true,
  zikr_contribute: true,
  zikr_remove_member: true,
  zikr_leave_group: true,
  zikr_close_group: true,
  zikr_get_or_create_device_token: true,
  zikr_track_event: true,
  zikr_share_zikr: true,
  zikr_pull_verified_zikrs: true,
  zikr_submit_feedback: true,
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
