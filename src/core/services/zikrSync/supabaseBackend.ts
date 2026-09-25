/**
 * Supabase adapter for the ZikrSyncBackend contract.
 *
 * Follows sharedRoom/supabaseBackend.ts: supabase-js is imported dynamically
 * (on-demand chunk, off the initial bundle), all access goes through
 * public-schema RPCs, and RPC error messages map to contract error codes.
 *
 * Identity is shared with the shared-rooms feature: supabase-js persists the
 * anonymous session in localStorage, so both clients land on the same uid.
 * `ensureUserId` delegates to the sharedRoom service for the (captcha-aware)
 * anonymous sign-in rather than duplicating it.
 */

import { sharedRoomService } from '../sharedRoom';
import { ZikrSyncError } from './contract';
import type {
  PullVerifiedPage,
  RemoteZikr,
  ShareZikrInput,
  ZikrSyncBackend,
  ZikrSyncCursor,
} from './contract';
import type { SupabaseRpc, SupabaseRpcName } from '../supabaseTypes';

let clientPromise: Promise<any> | null = null;

function isSupabaseConfigured(): boolean {
  return Boolean(
    import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

async function getClient(): Promise<any> {
  if (!isSupabaseConfigured()) {
    throw new ZikrSyncError('not-configured');
  }
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
        { db: { schema: 'public' }, auth: { persistSession: true, autoRefreshToken: true } }
      )
    );
  }
  return clientPromise;
}

function mapServerError(rawMessage: string): ZikrSyncError {
  const msg = (rawMessage || '').toLowerCase();
  if (msg.includes('duplicate_name')) return new ZikrSyncError('duplicate-name');
  if (msg.includes('not_authenticated')) return new ZikrSyncError('not-authenticated');
  if (msg.includes('invalid_name') || msg.includes('invalid_translation'))
    return new ZikrSyncError('invalid-input');
  return new ZikrSyncError('unknown', rawMessage);
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
    if (err instanceof ZikrSyncError) throw err;
    throw new ZikrSyncError('network', (err as Error)?.message);
  }
}

export class SupabaseZikrSyncBackend implements ZikrSyncBackend {
  readonly name = 'supabase';

  isConfigured(): boolean {
    return isSupabaseConfigured();
  }

  async ensureUserId(): Promise<string> {
    // Same anonymous session as shared rooms (persisted by supabase-js);
    // the sharedRoom backend owns the captcha-aware sign-in flow.
    return sharedRoomService.ensureIdentity().then(identity => identity.userId);
  }

  async shareZikr(input: ShareZikrInput): Promise<{ id: string }> {
    await this.ensureUserId();
    const { id } = await rpc('share_zikr', {
      p_name: input.name,
      p_arabic_text: input.arabicText || null,
      p_translation: input.translation || null,
    });
    return { id };
  }

  async pullVerifiedZikrs(cursor: ZikrSyncCursor | null): Promise<PullVerifiedPage> {
    const page = await rpc('pull_verified_zikrs', {
      p_cursor_updated_at: cursor?.updatedAt ?? null,
      p_cursor_id: cursor?.id ?? null,
    });
    // page.items is typed as the wire row (SupabaseSharedZikr) — same
    // shape the port's RemoteZikr aliases, no per-field mapping needed.
    const items: RemoteZikr[] = page.items ?? [];
    const nextCursor =
      page.nextCursorUpdatedAt && page.nextCursorId
        ? { updatedAt: page.nextCursorUpdatedAt, id: page.nextCursorId }
        : null;
    return { items, nextCursor, hasMore: Boolean(page.hasMore) };
  }
}
