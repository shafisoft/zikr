import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SUPABASE_RPC_NAMES } from '../../../src/core/services/supabaseTypes';

/**
 * Guards the generated DB mirror against silent staleness. The zikr
 * schema's Functions section of supabaseDatabase.generated.ts
 * (regenerated from the local migration harness via
 * `npm run gen:db-types`) must be exactly the app's RPC surface plus the
 * service-role-only functions. The compile-time guards in
 * supabaseTypes.ts are the hard gate; this test exists so a drift fails
 * with a readable diff instead of a type error.
 *
 * The RPCs moved from `public` to the exposed `zikr` schema in the
 * consolidated platform init (2026-10-14) — see supabase/README.md.
 */
const SERVICE_ONLY_FUNCTIONS = ['zikr_purge_expired'];

function zikrFunctionNames(generated: string): string[] {
  const zikrStart = generated.indexOf('"zikr": {');
  expect(zikrStart, 'zikr schema section missing from generated types').toBeGreaterThan(-1);
  const fnStart = generated.indexOf('Functions: {', zikrStart);
  expect(fnStart, 'Functions section missing from the zikr schema').toBeGreaterThan(-1);
  // The Functions object closes with a 10-space `}` before Enums (the
  // next schema section starts glued to its own closing brace).
  const fnEnd = generated.indexOf('\n          }', fnStart);
  const block = generated.slice(fnStart, fnEnd);
  return [...block.matchAll(/"([a-z_0-9]+)":\s*\{/g)].map(m => m[1]);
}

describe('supabase RPC surface vs generated DB types', () => {
  it('generated zikr-schema functions are exactly the app surface + service-only', () => {
    const generated = readFileSync(
      'src/core/services/supabaseDatabase.generated.ts',
      'utf8'
    );
    const dbFunctions = zikrFunctionNames(generated);
    const appFacing = dbFunctions.filter(n => !SERVICE_ONLY_FUNCTIONS.includes(n));
    expect(appFacing.sort()).toEqual([...SUPABASE_RPC_NAMES].sort());
  });
});
