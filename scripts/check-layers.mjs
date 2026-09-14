#!/usr/bin/env node
/**
 * check-layers — enforce the data/presentation boundary without ESLint.
 *
 * Rules (see AGENTS.md "Architecture"):
 *   1. src/ui may not import from core/db (the Dexie instance) or
 *      core/services (business logic). Stores are the only UI-facing API.
 *      Exception: type-only imports (`import type`) — types carry no logic.
 *   2. src/core may not import from src/ui — data never depends on
 *      presentation.
 *
 * Run via `npm run lint:layers`; also wired into `npm run lint`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const UI_DIR = join(ROOT, 'src', 'ui');
const CORE_DIR = join(ROOT, 'src', 'core');

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
  }
  return files;
}

const violations = [];

for (const file of walk(UI_DIR)) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const isTypeOnly = /^\s*import\s+type\s/.test(line);
    if (isTypeOnly) return;
    if (/from\s+['"].*core\/db\//.test(line) && !/core\/db\/types/.test(line)) {
      violations.push(`${rel}:${i + 1} — ui imports core/db (use a store instead): ${line.trim()}`);
    }
    if (/from\s+['"].*core\/services\//.test(line)) {
      violations.push(`${rel}:${i + 1} — ui imports core/services (use a store instead): ${line.trim()}`);
    }
  });
}

for (const file of walk(CORE_DIR)) {
  const rel = relative(ROOT, file);
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (/from\s+['"].*\/ui\//.test(line) && !/core\/ui\//.test(line)) {
      violations.push(`${rel}:${i + 1} — core imports ui (inverted dependency): ${line.trim()}`);
    }
  });
}

if (violations.length > 0) {
  console.error(`✗ layer violations (${violations.length}):\n`);
  for (const v of violations) console.error(`  ${v}\n`);
  process.exit(1);
}
console.log('✓ layer boundaries clean: ui → stores → services → db');
