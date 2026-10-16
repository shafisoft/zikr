/**
 * Supabase adapter for the FeedbackBackend contract.
 *
 * Follows sharedRoom/zikrSync: supabase-js is imported dynamically (an
 * on-demand chunk, off the initial bundle), access goes through the typed
 * public-schema RPC surface, and server error codes map to contract codes.
 *
 * Identity is shared with the shared-rooms feature: supabase-js persists
 * the anonymous session in localStorage, so this lands on the same uid.
 * `ensureUserId` delegates to the sharedRoom service for the (captcha-
 * aware) anonymous sign-in rather than duplicating it.
 *
 * Captcha per submission: when Turnstile is configured (site key present),
 * a FRESH one-use token is captured right before the RPC — the sharedRoom
 * captcha module renders its overlay card and handles cancel/timeout as a
 * 'captcha-failed' FeedbackError. A token can never be parked from a
 * previous session; if none is configured the RPC receives null and the
 * server skips verification (the site key and the server secret are one
 * deployment pair — see supabase/EXPOSURE-RULES.md).
 */

import { sharedRoomService } from '../sharedRoom';
import { isCaptchaEnabled, getCaptchaToken } from '../sharedRoom/captcha';
import { FeedbackError } from './contract';
import type { FeedbackBackend, FeedbackInput } from './contract';
import type { SupabaseRpc, SupabaseRpcName, SupabaseZikrClient } from '../supabaseTypes';

let clientPromise: Promise<SupabaseZikrClient> | null = null;

function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

async function getClient(): Promise<SupabaseZikrClient> {
  if (!isSupabaseConfigured()) {
    throw new FeedbackError('not-configured');
  }
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        // RPCs live in the public schema (the only PostgREST-exposed one);
        // the zikr_private schema holds the tables and is API-invisible.
        { db: { schema: 'zikr' }, auth: { persistSession: true, autoRefreshToken: true } }
      )
    );
  }
  return clientPromise;
}

/** Map Postgres RPC error messages (our `raise exception` codes) to app codes. */
function mapServerError(rawMessage: string): FeedbackError {
  const msg = (rawMessage || '').toLowerCase();
  if (msg.includes('not_authenticated')) return new FeedbackError('not-authenticated');
  if (msg.includes('rate_limited')) return new FeedbackError('rate-limited');
  if (msg.includes('captcha_failed')) return new FeedbackError('captcha-failed');
  if (msg.includes('invalid_category') || msg.includes('invalid_message') || msg.includes('invalid_email'))
    return new FeedbackError('invalid-input');
  // Unknown function (missing migration, stale schema cache) lands here —
  // unmapped Postgres errors stay reachable in devtools.
  console.error('[feedback] unmapped server error:', rawMessage);
  return new FeedbackError('unknown', rawMessage);
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
    if (err instanceof FeedbackError) throw err;
    // fetch failures land here
    throw new FeedbackError('network', (err as Error)?.message);
  }
}

export class SupabaseFeedbackBackend implements FeedbackBackend {
  readonly name = 'supabase';

  isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  async submit(input: FeedbackInput): Promise<{ id: string }> {
    // Same anonymous session as shared rooms (persisted by supabase-js);
    // the sharedRoom backend owns the captcha-aware sign-in flow.
    await sharedRoomService.ensureIdentity().then(identity => identity.userId);

    let captchaToken: string | null = null;
    if (isCaptchaEnabled()) {
      try {
        captchaToken = await getCaptchaToken();
      } catch (e) {
        throw new FeedbackError('captcha-failed', (e as Error)?.message);
      }
      if (!captchaToken) {
        throw new FeedbackError('captcha-failed', 'empty turnstile token');
      }
    }

    const { id } = await rpc('zikr_submit_feedback', {
      p_category: input.category,
      p_message: input.message,
      p_email: input.email || null,
      p_app_version: input.appVersion || null,
      p_locale: input.locale || null,
      p_user_agent: input.userAgent || null,
      p_captcha_token: captchaToken,
    });
    return { id };
  }
}
