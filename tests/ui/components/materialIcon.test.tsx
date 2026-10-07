// MaterialIcon — inline SVG rendering. Icons must render without any network
// or font dependency (the old icon-font ligatures degraded to raw text
// offline), so the component draws committed path data from
// iconPaths.generated.ts.
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import MaterialIcon from '../../../src/ui/components/MaterialIcon';
import { ICON_PATHS } from '../../../src/ui/components/icons/iconPaths.generated';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function renderIcon(props: { icon: string; filled?: boolean; className?: string }) {
  if (root) root.unmount();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(MaterialIcon, props));
  // createRoot renders are async — wait for the svg (or its absence) to land.
  await sleep(25);
}

describe('MaterialIcon', () => {
  it('renders an inline svg for a known icon (outline path, currentColor)', async () => {
    await renderIcon({ icon: 'close' });
    const svg = container!.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg!.getAttribute('viewBox')).toBe('0 -960 960 960');
    expect(svg!.getAttribute('width')).toBe('1em');
    expect(svg!.getAttribute('fill')).toBe('currentColor');
    expect(svg!.getAttribute('aria-hidden')).toBe('true');
    const path = svg!.querySelector('path');
    expect(path!.getAttribute('d')).toBe(ICON_PATHS.close.d);
  });

  it('uses the filled variant path when filled=true and one exists', async () => {
    expect(ICON_PATHS.check_circle.fill).toBeTruthy();
    await renderIcon({ icon: 'check_circle', filled: true });
    const path = container!.querySelector('svg path');
    expect(path!.getAttribute('d')).toBe(ICON_PATHS.check_circle.fill);
  });

  it('falls back to the outline path when no distinct filled variant exists', async () => {
    expect(ICON_PATHS.close.fill).toBeUndefined();
    await renderIcon({ icon: 'close', filled: true });
    const path = container!.querySelector('svg path');
    expect(path!.getAttribute('d')).toBe(ICON_PATHS.close.d);
  });

  it('applies className and renders nothing for an unknown icon', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await renderIcon({ icon: 'not_a_real_icon', className: 'text-[18px]' });
    expect(container!.querySelector('svg')).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not_a_real_icon'));
    warn.mockRestore();
  });
});
