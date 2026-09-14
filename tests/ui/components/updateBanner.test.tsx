import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { UpdateBanner } from '../../../src/ui/components/UpdateBanner';
import { pwaMockState } from '../../mocks/virtual-pwa-register';

// `virtual:pwa-register/react` is aliased to the stub in vitest.config.ts;
// tests drive the banner through pwaMockState.

// ---------- render helper (no testing-library; react-dom/client is enough) ----------

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(UpdateBanner));
  // Flush React 18's concurrent rendering.
  return new Promise<void>(resolve => setTimeout(resolve, 0));
}

function bannerEl(): HTMLElement | null {
  return container?.querySelector('[role="alert"]') ?? null;
}

beforeEach(() => {
  pwaMockState.offlineReady = false;
  pwaMockState.needRefresh = false;
  pwaMockState.updateServiceWorker.mockReset();
});

afterEach(async () => {
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

// ---------- tests ----------

describe('UpdateBanner', () => {
  it('renders nothing while no update is pending', async () => {
    await render();
    expect(bannerEl()).toBeNull();
  });

  it('renders when a refresh is needed, positioned BELOW the fixed top bar', async () => {
    pwaMockState.needRefresh = true;
    await render();

    const el = bannerEl();
    expect(el).not.toBeNull();
    // The regression this guards: the banner must stack above the top app
    // bar (TopAppBar is z-50, rendered later in the DOM) and start below
    // its h-16 (64px) height instead of underneath it.
    expect(el?.className).toContain('top-20');
    expect(el?.className).toContain('z-[60]');
    expect(el?.className).toContain('fixed');

    // Reload action forwards to updateServiceWorker(true).
    const buttons = container?.querySelectorAll('button') ?? [];
    expect(buttons.length).toBe(2); // reload + dismiss
    buttons[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(pwaMockState.updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('renders the offline-ready variant without a reload button', async () => {
    pwaMockState.offlineReady = true;
    await render();

    const el = bannerEl();
    expect(el).not.toBeNull();
    // Only the dismiss button — nothing to reload.
    expect(el?.querySelectorAll('button').length).toBe(1);
  });

  it('dismiss clears the banner state', async () => {
    pwaMockState.needRefresh = true;
    await render();

    const dismiss = container?.querySelectorAll('button')[1];
    dismiss?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(pwaMockState.needRefresh).toBe(false);
    expect(pwaMockState.offlineReady).toBe(false);
  });
});
