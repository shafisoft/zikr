// Counter PAGE regression — the R2 chrome-bridge deadlock (§16 fix).
//
// The page must gate its terminal "No Zikrs Available" empty state on its
// OWN store knowledge (library loaded and empty) — never on the container's
// onActiveStep report, whose FIRST value is legitimately null (it fires
// before the container's selection effect has resolved the route's zikr).
// Gating on that report rendered the empty state in the very commit after
// mount, unmounting CounterFlowContainer before its selection effect could
// land — so every plain ?zikrId= entry (every Home "Start") deadlocked on
// the empty state even with a fully seeded library.
//
// These tests mount the real PAGE (MemoryRouter at /counter) against the
// real stores + fake-indexeddb, mirroring App.tsx's boot order (seed db →
// initialize()); the zikr store is deliberately exercised through its real
// liveQuery subscription, not setState. The container-level behaviors are
// covered in tests/ui/containers/counterFlow.test.tsx.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import Counter from '../../../src/ui/pages/Counter';
import { db } from '../../../src/core/db/db';
import { useZikrStore } from '../../../src/core/stores/zikrStore';
import { useSessionStore } from '../../../src/core/stores/sessionStore';
import { usePlanStore } from '../../../src/core/stores/planStore';
import { useRoutineStore } from '../../../src/core/stores/routineStore';
import { useSettingsStore } from '../../../src/core/stores/settingsStore';
import { clearCheckpoint } from '../../../src/core/services/countRecorder';
import { Routine, Zikr } from '../../../src/core/db/types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDom(cond: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitForDom: condition not met in time');
    await sleep(25);
  }
}

function zikr(id: number, name: string): Zikr {
  return {
    id,
    name,
    custom: false,
    createdAt: new Date(),
    arabicText: 'سُبْحَانَ ٱللَّٰهِ',
    translation: 'Glory be to Allah',
    defaultTarget: 33,
  };
}

function makeRoutine(): Routine {
  return {
    id: 'r1',
    source: 'preset',
    presetKey: 'morning',
    items: [
      { zikrId: 1, name: 'Zikr One', target: 3 },
      { zikrId: 2, name: 'Zikr Two', target: 2 },
    ],
    createdAt: new Date(),
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let storeUnsubs: Array<() => void> = [];

/** Boot the zikr store the way App.tsx does: a real liveQuery subscription
 * over the (already-seeded) database. */
function bootZikrStore() {
  storeUnsubs.push(useZikrStore.getState().initialize());
}

async function renderCounter(search = '?zikrId=1') {
  if (root) {
    root.unmount();
    root = null;
    container?.remove();
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(
      MemoryRouter,
      { initialEntries: [`/counter${search}`] },
      React.createElement(Counter)
    )
  );
  await sleep(50);
}

function circleButton(): HTMLElement | null {
  return container!.querySelector('button[aria-label^="Tap to count"]');
}

function buttonByText(text: string): HTMLButtonElement | null {
  return (
    ([...container!.querySelectorAll('button')] as HTMLButtonElement[]).find(
      b => b.textContent?.includes(text)
    ) ?? null
  );
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await clearCheckpoint(1);
  useZikrStore.setState({ zikrs: [], loading: true, error: null });
  useSessionStore.setState({
    sessions: [],
    currentSession: { zikrId: null, count: 0 },
    checkpoints: {},
    loading: false,
  });
  usePlanStore.setState({ plans: [], loading: false });
  useRoutineStore.setState({ routines: [], loading: false });
  useSettingsStore.setState({ settings: {}, loading: false });
  localStorage.clear();
  window.localStorage.removeItem('zikr-unsaved-round');
  vi.restoreAllMocks();
});

afterEach(async () => {
  storeUnsubs.forEach(unsub => unsub());
  storeUnsubs = [];
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('Counter page — terminal empty state vs the chrome bridge (R2 deadlock)', () => {
  it('renders the ?zikrId=1 counter once the seeded library resolves through the real store subscription', async () => {
    await db.zikrs.bulkAdd([zikr(1, 'SubhanAllah'), zikr(2, 'Alhamdulillah')]);
    bootZikrStore(); // App.tsx order: subscription starts before the route mounts
    await renderCounter('?zikrId=1');

    // The counter board is up — no empty state, no deadlock.
    await waitForDom(() => circleButton() !== null);
    await waitForDom(() => container!.textContent!.includes('SubhanAllah'));
    expect(container!.textContent).toContain('Glory be to Allah');
    expect(container!.textContent).not.toContain('No Zikrs Available');

    // The chrome bridge still works: the active step names the top bar.
    const topBarTitle = container!.querySelector('header h1')?.textContent;
    expect(topBarTitle).toBe('SubhanAllah');
  });

  it('shows the terminal empty state ONLY when the loaded library is truly empty', async () => {
    bootZikrStore(); // empty database — the honest empty state
    await renderCounter('?zikrId=1');

    await waitForDom(() => container!.textContent!.includes('No Zikrs Available'));
    expect(container!.textContent).toContain('Create a zikr to start practicing.');
    expect(buttonByText('Go to Home')).not.toBeNull();
    expect(circleButton()).toBeNull();
  });

  it('renders a routine flow for ?routineId= without deadlocking (flow title bridges chrome)', async () => {
    await db.zikrs.bulkAdd([zikr(1, 'Zikr One'), zikr(2, 'Zikr Two')]);
    useRoutineStore.setState({ routines: [makeRoutine()], loading: false });
    bootZikrStore();
    await renderCounter('?routineId=r1');

    // The flow opens on the first incomplete item, in-flow.
    await waitForDom(() => circleButton() !== null);
    await waitForDom(() => container!.textContent!.includes('Zikr One'));
    expect(container!.textContent).not.toContain('No Zikrs Available');
  });

  it('does not latch the empty state on the container\u2019s first null report (the mount race)', async () => {
    // The exact race, compressed: the page mounts with the store already
    // loaded-but-empty, so the container's first onActiveStep report is null
    // (pre-fix: the page swapped to the empty state and UNMOUNTED the
    // container — the later library load could never reach a living flow).
    useZikrStore.setState({ zikrs: [], loading: false });
    await renderCounter('?zikrId=1');

    // Let the mount commit + the null chrome report land and settle.
    await sleep(80);
    expect(circleButton()).toBeNull(); // nothing selected yet — fine

    // The library then resolves through the real subscription…
    await db.zikrs.bulkAdd([zikr(1, 'SubhanAllah'), zikr(2, 'Alhamdulillah')]);
    bootZikrStore();

    // …and the STILL-MOUNTED container selects the route's zikr: the
    // counter appears, the empty state never latched.
    await waitForDom(() => circleButton() !== null);
    await waitForDom(() => container!.textContent!.includes('SubhanAllah'));
    expect(container!.textContent).not.toContain('No Zikrs Available');
  });
});
