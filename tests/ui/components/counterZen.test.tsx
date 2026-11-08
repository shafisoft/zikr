// CounterSession zen mode (Noor 2.0 phase 2): a persisted toggle that
// collapses the reference region so the strand becomes the whole screen.
//   - zen off (default) → the Arabic reference renders exactly as before
//   - zen on → reference hidden, the guided step rail SURVIVES (it is
//     navigation, not decoration), toggle reads pressed
//   - toggling persists the counterZen settings KV
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import CounterSession from '../../../src/ui/components/counter/CounterSession';
import { ConfirmDialogHost } from '../../../src/ui/components/ConfirmDialog';
import { db } from '../../../src/core/db/db';
import { useSettingsStore } from '../../../src/core/stores/settingsStore';
import { Zikr } from '../../../src/core/db/types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDom(cond: () => boolean | Promise<boolean>, ms = 2000) {
  const start = performance.now();
  while (!(await cond())) {
    if (performance.now() - start > ms) throw new Error('waitForDom: condition not met in time');
    await sleep(25);
  }
}

const zikr: Zikr = { id: 7, name: 'SubhanAllah', custom: false, createdAt: new Date() };

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderSession(settings: Record<string, unknown>) {
  // A previous instance must not survive: its window keydown listener
  // would keep counting alongside the new one.
  if (root) {
    root.unmount();
    root = null;
    container?.remove();
  }
  useSettingsStore.setState({ settings, loading: false });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(CounterSession, {
        zikr,
        startCount: 0,
        target: 33,
        onCount: () => {},
        onFinish: vi.fn(),
        variant: 'page',
        // A guided flow: the rail must survive zen.
        stepIndex: 1,
        stepCount: 3,
        onPrevStep: () => {},
        onNextStep: () => {},
      }),
      React.createElement(ConfirmDialogHost)
    )
  );
  await waitForDom(() => container!.querySelector('button') !== null);
}

function buttonByAria(label: string): HTMLButtonElement | null {
  return (
    ([...container!.querySelectorAll('button')] as HTMLButtonElement[]).find(
      b => b.getAttribute('aria-label') === label
    ) ?? null
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

afterEach(async () => {
  await sleep(40);
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('CounterSession — zen mode', () => {
  it('keeps the reference region by default', async () => {
    await renderSession({});
    await waitForDom(() => container!.querySelector('h1') !== null);
    expect(container!.querySelector('h1')).not.toBeNull();
    const toggle = buttonByAria('Zen mode — just the tasbeeh');
    expect(toggle).not.toBeNull();
    expect(toggle!.getAttribute('aria-pressed')).toBe('false');
  });

  it('zen hides the reference but keeps the strand, the count and the step rail', async () => {
    await renderSession({ counterZen: true });
    await waitForDom(() => buttonByAria('Exit zen mode') !== null);
    // The Arabic reference is gone…
    expect(container!.querySelector('h1')).toBeNull();
    // …the board is not (count + of-target still render)…
    expect(container!.textContent).toContain('0');
    expect(container!.textContent).toContain('of 33');
    // …and the guided rail survives zen (navigation, not decoration).
    expect(buttonByAria('Previous zikr')).not.toBeNull();
    expect(buttonByAria('Next item')).not.toBeNull();
    expect(buttonByAria('Exit zen mode')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('toggling zen persists the counterZen setting', async () => {
    await renderSession({});
    buttonByAria('Zen mode — just the tasbeeh')!.click();
    await waitForDom(async () =>
      Boolean(await db.settings.get('counterZen'))
    );
    expect((await db.settings.get('counterZen'))?.value).toBe(true);
    // The region collapses live — no remount needed.
    await waitForDom(() => container!.querySelector('h1') === null);
  });
});
