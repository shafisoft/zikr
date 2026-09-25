/**
 * Supabase adapter for the SharedRoomBackend contract.
 *
 * This is the ONLY file in the codebase that knows Supabase exists:
 * supabase-js is imported dynamically here so it lands in an on-demand
 * chunk and never touches the initial bundle. Replacing the backend means
 * writing another adapter — nothing else changes.
 */

import { SharedRoomError } from './contract';
import { isCaptchaEnabled, getCaptchaToken } from './captcha';
import type {
  CreatePlanInput,
  CreateRoomInput,
  RoomStatePayload,
  SharedRoomBackend,
} from './contract';
import type { SupabasePlanPayload, SupabaseRpc, SupabaseRpcName } from '../supabaseTypes';

let clientPromise: Promise<any> | null = null;

function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

async function getClient(): Promise<any> {
  if (!isSupabaseConfigured()) {
    throw new SharedRoomError('not-configured');
  }
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        // RPCs live in the public schema (the only PostgREST-exposed one);
        // the zikr_app schema holds the tables and is API-invisible.
        { db: { schema: 'public' }, auth: { persistSession: true, autoRefreshToken: true } }
      )
    );
  }
  return clientPromise;
}

/** Map Postgres RPC error messages (our `raise exception` codes) to app codes. */
function mapServerError(rawMessage: string): SharedRoomError {
  const msg = (rawMessage || '').toLowerCase();
  if (msg.includes('group_not_found')) return new SharedRoomError('room-not-found');
  if (msg.includes('plan_not_found')) return new SharedRoomError('plan-not-found');
  if (msg.includes('plan_ended')) return new SharedRoomError('plan-ended');
  if (msg.includes('zikr_not_in_plan')) return new SharedRoomError('zikr-not-in-plan');
  if (msg.includes('window_ended') || msg.includes('window_already_ended'))
    return new SharedRoomError('window-ended');
  if (msg.includes('window_not_started')) return new SharedRoomError('window-not-started');
  if (msg.includes('group_closed')) return new SharedRoomError('room-closed');
  if (msg.includes('group_full')) return new SharedRoomError('room-full');
  if (msg.includes('not_a_member')) return new SharedRoomError('not-a-member');
  if (msg.includes('not_owner')) return new SharedRoomError('not-owner');
  if (msg.includes('invalid_delta')) return new SharedRoomError('invalid-delta');
  if (msg.includes('not_authenticated')) return new SharedRoomError('not-authenticated');
  if (msg.includes('invalid_')) return new SharedRoomError('invalid-input');
  // The server doesn't know the function (missing migration, stale
  // schema cache, revoked execute). Retryable, but never self-heals on
  // the client — call it out instead of a generic "something went
  // wrong".
  if (
    msg.includes('could not find the function') ||
    msg.includes('schema cache') ||
    msg.includes('permission denied')
  ) {
    return new SharedRoomError('server-mismatch', rawMessage);
  }
  // Keep the raw message reachable in devtools — unmapped Postgres
  // errors are otherwise indistinguishable from each other.
  console.error('[sharedRoom] unmapped server error:', rawMessage);
  return new SharedRoomError('unknown', rawMessage);
}

/** Typed against ../supabaseTypes.ts — wrong fn names, params, or returns are compile errors. */
async function rpc<F extends SupabaseRpcName>(
  fn: F,
  params: SupabaseRpc[F]['params']
): Promise<SupabaseRpc[F]['returns']> {
  try {
    const sb = await getClient();
    const { data, error } = await sb.rpc(fn, params);
    if (error) throw mapServerError(error.message);
    return data as SupabaseRpc[F]['returns'];
  } catch (err) {
    if (err instanceof SharedRoomError) throw err;
    // fetch failures land here
    throw new SharedRoomError('network', (err as Error)?.message);
  }
}

/** CreatePlanInput → the jsonb payload shape the server functions expect. */
function planToPayload(input: CreatePlanInput): SupabasePlanPayload {
  return {
    title: input.title || null,
    mode: input.mode,
    period: input.period,
    timeZone: input.timeZone ?? null,
    target: input.target ?? null,
    zikrs: input.zikrs.map((z) => ({
      name: z.name,
      arabic: z.arabic || null,
      target: z.target ?? null,
    })),
    startsAt: input.startsAt ? input.startsAt.toISOString() : null,
    endsAt: input.endsAt ? input.endsAt.toISOString() : null,
  };
}

export class SupabaseSharedRoomBackend implements SharedRoomBackend {
  readonly name = 'supabase';

  /** In-flight sign-in, so concurrent callers share one widget/token. */
  private ensureUserIdPromise: Promise<string> | null = null;

  isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  ensureUserId(): Promise<string> {
    // Two concurrent callers (e.g. StrictMode double-mount of the Group
    // page) must not render two widgets or burn two one-use tokens.
    if (!this.ensureUserIdPromise) {
      this.ensureUserIdPromise = this.doEnsureUserId().finally(() => {
        this.ensureUserIdPromise = null;
      });
    }
    return this.ensureUserIdPromise;
  }

  private async doEnsureUserId(): Promise<string> {
    const sb = await getClient();

    const { data: sessionData } = await sb.auth.getSession();
    const userId = sessionData?.session?.user?.id;
    if (userId) return userId;

    // When the project has captcha protection enabled, the signup endpoint
    // rejects sign-ins without a fresh Turnstile token.
    let captchaToken: string | undefined;
    if (isCaptchaEnabled()) {
      try {
        captchaToken = await getCaptchaToken();
      } catch (e) {
        throw new SharedRoomError('captcha-failed', (e as Error)?.message);
      }
      if (!captchaToken) {
        throw new SharedRoomError('captcha-failed', 'empty turnstile token');
      }
    }

    const { data, error } = await sb.auth.signInAnonymously({
      // auth-js 2.116 reads the captcha token from credentials.options
      options: { captchaToken },
    });
    if (error || !data?.user?.id) {
      throw new SharedRoomError('not-authenticated', error?.message);
    }
    return data.user.id;
  }

  createRoom(input: CreateRoomInput): Promise<RoomStatePayload> {
    return rpc('create_group', {
      p_title: input.title,
      p_name: input.displayName,
      p_plan: planToPayload(input.initialPlan),
    });
  }

  joinRoom(code: string, displayName: string): Promise<RoomStatePayload> {
    return rpc('join_group', { p_code: code, p_name: displayName });
  }

  createPlan(code: string, input: CreatePlanInput): Promise<RoomStatePayload> {
    return rpc('create_plan', {
      p_code: code,
      p_plan: planToPayload(input),
    });
  }

  endPlan(code: string, planId: string): Promise<void> {
    return rpc('end_plan', { p_code: code, p_plan_id: planId });
  }

  contribute(
    code: string,
    planId: string,
    zikrName: string,
    delta: number,
    eventId: string
  ): Promise<{ total: number; periodTotal: number }> {
    return rpc('contribute', {
      p_code: code,
      p_plan_id: planId,
      p_zikr_name: zikrName,
      p_delta: delta,
      p_event_id: eventId,
    });
  }

  getRoomState(code: string): Promise<RoomStatePayload> {
    return rpc('get_group_state', { p_code: code });
  }

  removeMember(code: string, userId: string): Promise<void> {
    return rpc('remove_member', { p_code: code, p_user_id: userId });
  }

  leaveRoom(code: string): Promise<void> {
    return rpc('leave_group', { p_code: code });
  }

  closeRoom(code: string): Promise<void> {
    return rpc('close_group', { p_code: code });
  }

  // ---------- Usage metrics (best-effort; see contract) ----------

  async ensureDeviceToken(): Promise<string> {
    return rpc('get_or_create_device_token', {});
  }

  async trackEvent(name: string, properties: Record<string, unknown> = {}): Promise<void> {
    try {
      await rpc('track_event', { p_name: name, p_properties: properties });
    } catch {
      // Metrics are best-effort by contract — swallow everything.
    }
  }
}
