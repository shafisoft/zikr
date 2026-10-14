#!/usr/bin/env node
/**
 * Migration invariant guard (consolidated-stream edition).
 *
 * The standalone stream (0001–0004) was retired 2026-10-14: fresh
 * environments — the platform compose stack and the local-test harness —
 * run ONLY `20261014000000_zikr_platform_init.sql` (the retired files
 * live in `migrations/_archive_standalone/` and must never replay). The
 * old job of this script (byte-parity between 0001 and 0002 as "two
 * paths to one server") died with that consolidation.
 *
 * What MUST stay true of the consolidated init:
 *   1. no duplicate function definitions (a stray second body silently
 *      wins depending on statement order), and
 *   2. schema hygiene: no object placed in or referencing the retired
 *      `public` schema (`public.*` names, `search_path = public`).
 *
 * The client-side counterpart — SQL names/params vs the typed surface —
 * is guarded by `supabaseTypes.ts` + `tests/core/services/
 * supabaseRpcSurface.test.ts` against `supabaseDatabase.generated.ts`.
 *
 * Run: npm run check:migrations (also wired into `npm run lint`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const initPath = join(
  root,
  'supabase/migrations/20261014000000_zikr_platform_init.sql'
);

// `create [or replace] function schema.name(args) ... $$ body $$;`
// Bodies never contain a nested `$$` (only dollar-quoted with tags would
// break this — don't introduce them).
const FN_RE = /create (?:or replace )?function\s+([\w]+)\.([\w]+)[\s\S]*?\$\$([\s\S]*?)\$\$;/g;

const sql = readFileSync(initPath, 'utf8');
let ok = true;
const seen = new Map();

for (const m of sql.matchAll(FN_RE)) {
  const key = `${m[1]}.${m[2]}`.toLowerCase();
  if (seen.has(key)) {
    console.error(`✗ duplicate definition of ${key}`);
    ok = false;
  }
  seen.set(key, true);

  if (m[1].toLowerCase() === 'public') {
    console.error(`✗ ${key}: defined in the retired public schema — use zikr (app-facing) or zikr_app (helpers)`);
    ok = false;
  }
  if (!/set\s+search_path\s*=/i.test(m[0])) {
    console.error(`✗ ${key}: missing a pinned search_path`);
    ok = false;
  }
}

if (/search_path\s*=\s*public/i.test(sql)) {
  console.error('✗ found `search_path = public` — public is retired on the shared project');
  ok = false;
}

const appFacing = [...seen.keys()].filter((k) => k.startsWith('zikr.'));
if (appFacing.length !== 15) {
  console.error(
    `✗ expected 14 app-facing RPCs + zikr_purge_expired in schema zikr, found ${appFacing.length}: ${appFacing.join(', ')}`
  );
  ok = false;
}

if (ok) {
  console.log(`✓ consolidated init invariants hold (${seen.size} function definitions, none duplicated, search_path pinned everywhere)`);
} else {
  console.error('\nFix the drift in 20261014000000_zikr_platform_init.sql, then re-run.');
  process.exit(1);
}
