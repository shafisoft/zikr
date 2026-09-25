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
 */

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

/**
 * The shape every Supabase backend's private rpc() helper must have:
 * the function name must be on the surface, the params object must carry
 * the SQL parameter names, and the resolved type is the declared return.
 */
export type SupabaseRpcCall = <F extends SupabaseRpcName>(
  fn: F,
  params: SupabaseRpc[F]['params']
) => Promise<SupabaseRpc[F]['returns']>;
