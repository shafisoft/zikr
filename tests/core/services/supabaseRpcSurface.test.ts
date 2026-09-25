import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { SUPABASE_RPC_NAMES } from '../../../src/core/services/supabaseTypes';

/**
 * Guards the generated DB mirror against silent staleness. The public
 * Functions section of supabaseDatabase.generated.ts (regenerated from
 * the local migration harness via `npm run gen:db-types`) must be
 * exactly the app's RPC surface plus the service-role-only functions.
 * The compile-time guards in supabaseTypes.ts are the hard gate; this
 * test exists so a drift fails with a readable diff instead of a type
 * error.
 */
const SERVICE_ONLY_FUNCTIONS = ['purge_expired'];

function publicFunctionNames(generated: string): string[] {
  const publicStart = generated.indexOf('  public: {');
  expect(publicStart, 'public schema section missing from generated types').toBeGreaterThan(-1);
  const fnStart = generated.indexOf('    Functions: {', publicStart);
  expect(fnStart, 'Functions section missing from the public schema').toBeGreaterThan(-1);
  const fnEnd = generated.indexOf('\n    }', fnStart);
  const block = generated.slice(fnStart, fnEnd);
  return [...block.matchAll(/^ {6}([a-z_0-9]+): \{/gm)].map(m => m[1]);
}

describe('supabase RPC surface vs generated DB types', () => {
  it('generated public functions are exactly the app surface + service-only', () => {
    const generated = readFileSync(
      'src/core/services/supabaseDatabase.generated.ts',
      'utf8'
    );
    const dbFunctions = publicFunctionNames(generated);
    const appFacing = dbFunctions.filter(n => !SERVICE_ONLY_FUNCTIONS.includes(n));
    expect(appFacing.sort()).toEqual([...SUPABASE_RPC_NAMES].sort());
  });
});
