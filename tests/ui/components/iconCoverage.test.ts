// Icon coverage guard — every icon name referenced in src/ must have committed
// inline-SVG path data. A name missing from iconPaths.generated.ts renders as
// nothing (silent visual regression offline, where there is no font to fall
// back to). If this fails, add the name to the ICONS list in
// scripts/generate-icons.mjs and run `npm run gen:icons`.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ICON_PATHS } from '../../../src/ui/components/icons/iconPaths.generated';

const ROOT = join(__dirname, '../../..');

// Keep in sync with the scan in scripts/generate-icons.mjs.
const NON_ICON_LITERALS = new Set(['locating', 'daily', 'synced', 'pending']);

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.generated.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('icon coverage', () => {
  it('covers every icon name referenced in src/', () => {
    const used = new Map<string, string>();
    for (const file of walk(join(ROOT, 'src'))) {
      const text = readFileSync(file, 'utf8');
      const patterns = [
        /\bicon=\{?["']([a-z][a-z0-9_]*)["']/g,
        /\bicon:\s*["']([a-z][a-z0-9_]*)["']/g,
        /\bicon=\{[^{};]*?\}/g,
      ];
      for (const pattern of patterns) {
        for (const m of text.matchAll(pattern)) {
          for (const lit of m[0].matchAll(/["']([a-z][a-z0-9_]*)["']/g)) {
            const name = lit[1];
            if (NON_ICON_LITERALS.has(name)) continue;
            if (!used.has(name)) used.set(name, file);
          }
        }
      }
    }
    expect(used.size).toBeGreaterThan(50);
    const missing = [...used.keys()].filter((name) => !(name in ICON_PATHS));
    expect(
      missing.map((name) => `${name} (${used.get(name)})`),
      'icons used in src/ but missing from iconPaths.generated.ts — run npm run gen:icons'
    ).toEqual([]);
  });

  it('the icon webfont stays gone from src/ and index.html', () => {
    const files = [...walk(join(ROOT, 'src')), join(ROOT, 'index.html')];
    const offenders = files.filter((f) => readFileSync(f, 'utf8').includes('material-symbols-outlined'));
    expect(
      offenders,
      'the Material Symbols icon font breaks offline — use <MaterialIcon> (inline SVG)'
    ).toEqual([]);
  });
});
