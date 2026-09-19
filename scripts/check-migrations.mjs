#!/usr/bin/env node
/**
 * Migration drift guard.
 *
 * 0001_init.sql (fresh installs) and 0002_group_plans.sql (v1 → canonical
 * upgrade) must define the SAME functions with the SAME bodies — they are
 * two paths to one canonical server. This script extracts every function
 * definition from both files, normalizes whitespace, and fails on:
 *   - a function defined in only one of the two files, or
 *   - a body that differs between them.
 *
 * Run: npm run check:migrations (also wired into `npm run lint`).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  join(root, 'supabase/migrations/0001_init.sql'),
  join(root, 'supabase/migrations/0002_group_plans.sql'),
];

// `create [or replace] function schema.name(args) ... $$ body $$;`
// Bodies never contain a nested `$$` (only dollar-quoted with tags would
// break this — don't introduce them).
const FN_RE = /create (?:or replace )?function\s+(\w+)\.(\w+)[\s\S]*?\$\$([\s\S]*?)\$\$;/g;

const normalize = (s) =>
  s
    // `create function` vs `create or replace function` is not drift —
    // 0001 (fresh installs) may use plain create where 0002 must restate.
    .replace(/^create (?:or replace )?function/i, 'create function')
    .replace(/\s+/g, ' ')
    .trim();

function extract(path) {
  const sql = readFileSync(path, 'utf8');
  const map = new Map();
  for (const m of sql.matchAll(FN_RE)) {
    const key = `${m[1]}.${m[2]}`.toLowerCase();
    if (map.has(key)) {
      console.error(`✗ ${path}: duplicate definition of ${key}`);
      process.exitCode = 1;
    }
    map.set(key, normalize(m[0]));
  }
  return map;
}

const [canon, upgrade] = files.map(extract);
let ok = true;

for (const key of new Set([...canon.keys(), ...upgrade.keys()])) {
  const inCanon = canon.get(key);
  const inUpgrade = upgrade.get(key);
  if (inCanon && !inUpgrade) {
    console.error(`✗ ${key}: defined in 0001 but missing from 0002`);
    ok = false;
  } else if (!inCanon && inUpgrade) {
    console.error(`✗ ${key}: defined in 0002 but missing from 0001`);
    ok = false;
  } else if (inCanon !== inUpgrade) {
    console.error(`✗ ${key}: body differs between 0001 and 0002 — pick one, keep both identical`);
    ok = false;
  }
}

if (ok) {
  console.log(`✓ migrations in sync: ${canon.size} shared function definitions match`);
} else {
  console.error('\nThe two migration files are two paths to ONE canonical server.');
  console.error('Fix the drift: edit one file, mirror the change in the other, re-run.');
  process.exit(1);
}
