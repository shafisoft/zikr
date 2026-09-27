// CounterFlowContainer — the routine flow source (§16.4):
//   - position is DERIVED: the flow opens on the first incomplete item with
//     its remaining count (AC2.3.2), skipping already-saved items (AC2.3.5)
//   - an item's auto-save advances the flow by derivation; the last item
//     lands on the calm done card (AC2.3.3)
//   - a missing zikr blocks completion with the gentle line (§5.2)
//   - the plain source still renders CounterSession with Another Round
//     available (bit-for-bit — no flowMode)
// Runs against the real stores + fake-indexeddb; group propagation spied.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import CounterFlowContainer from '../../../src/ui/containers/counter/CounterFlowContainer';
import { db } from '../../../src/core/db/db';
import { useRoutineStore } from '../../../src/core/stores/routineStore';
import { useSessionStore } from '../../../src/core/stores/sessionStore';
import { useZikrStore } from '../../../src/core/stores/zikrStore';
import { useSettingsStore } from '../../../src/core/stores/settingsStore';
import { usePlanStore } from '../../../src/core/stores/planStore';
import { clearCheckpoint } from '../../../src/core/services/countRecorder';
import { sharedRoomService } from '../../../src/core/services/sharedRoom';
import { Routine, Zikr } from '../../../src/core/db/types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDom(
  cond: () => boolean | Promise<boolean>,
  ms = 2000
) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error('waitForDom: condition not met in time');
    await sleep(25);
  }
}

function zikr(id: number, name: string): Zikr {
  return { id, name, custom: false, createdAt: new Date() };
}

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    source: 'preset',
    presetKey: 'morning',
    items: [
      { zikrId: 1, name: 'Zikr One', target: 3 },
      { zikrId: 2, name: 'Zikr Two', target: 2 },
    ],
    createdAt: new Date(),
    ...overrides,
  };
}

function sessionFor(zikrId: number, count: number) {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return {
    id: zikrId,
    zikrId,
    count,
    source: 'app' as const,
    timestamp: now,
    date: midnight,
    editableUntil: now,
    createdAt: now,
    updatedAt: now,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let activeStep: string | null | undefined;
let onFinish: ReturnType<typeof vi.fn<() => void>>;

async function renderFlow(props: Record<string, unknown> = {}) {
  if (root) {
    root.unmount();
    root = null;
    container?.remove();
  }
  activeStep = undefined;
  onFinish = vi.fn<() => void>();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(CounterFlowContainer, {
      zikrIdParam: null,
      targetParam: 0,
      planIdParam: null,
      routineIdParam: null,
      postSalahParam: null,
      onFinish,
      onActiveStep: (name: string | null) => {
        activeStep = name;
      },
      ...props,
    })
  );
  await sleep(50);
}

function circleButton(): HTMLElement {
  return (container!.querySelector('button[aria-label^="Tap to count"]') ?? null) as HTMLElement;
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  await clearCheckpoint(1);
  await clearCheckpoint(2);
  useSettingsStore.setState({ settings: {}, loading: false });
  usePlanStore.setState({ plans: [], loading: false });
  localStorage.clear();
  window.localStorage.removeItem('zikr-unsaved-round');
  vi.restoreAllMocks();
  vi.spyOn(sharedRoomService, 'propagateToRooms').mockResolvedValue(0);
});

afterEach(async () => {
  // Let in-flight auto-save / checkpoint writes land before the DB wipe.
  await sleep(1150);
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('CounterFlowContainer — routine flow (§5.2, §16.4)', () => {
  it('opens on the FIRST INCOMPLETE item with its remaining count (AC2.3.2)', async () => {
    useZikrStore.setState({ zikrs: [zikr(1, 'Zikr One'), zikr(2, 'Zikr Two')], loading: false });
    // Item 1 already satisfied from an outside source (AC2.3.5 — cross-source).
    useSessionStore.setState({ sessions: [sessionFor(1, 3)], loading: false });
    useRoutineStore.setState({ routines: [makeRoutine()], loading: false });

    await renderFlow({ routineIdParam: 'r1' });
    await waitForDom(() => circleButton() !== null);

    // The reported chrome step is item 2, not item 1.
    await waitForDom(() => activeStep === 'Zikr Two');

    // The step's target is the REMAINING 2 (2 of 2 today for item 2), and
    // the board starts fresh (item 2 has no checkpoint).
    for (let i = 0; i < 2; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      await sleep(30);
    }
    // The auto-save lands an ordinary session for item 2 (AC2.3.4).
    await waitForDom(async () => {
      const rows = await db.sessions.toArray();
      return rows.some(s => s.zikrId === 2 && s.count === 2);
    });
  });

  it('advances by derivation to the done card when the last item saves (AC2.3.3)', async () => {
    useZikrStore.setState({ zikrs: [zikr(1, 'Zikr One'), zikr(2, 'Zikr Two')], loading: false });
    useRoutineStore.setState({ routines: [makeRoutine()], loading: false });
    // Fresh day — flow starts on item 1 (target 3).
    useSessionStore.setState({ sessions: [], loading: false });

    await renderFlow({ routineIdParam: 'r1' });
    await waitForDom(() => activeStep === 'Zikr One');

    // Count item 1 to its target…
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      await sleep(30);
    }
    await waitForDom(async () => (await db.sessions.toArray()).some(s => s.zikrId === 1));

    // Mirror the persisted history into the store (the app's liveQuery does
    // this automatically; tests do it explicitly) — the flow's position is
    // a pure derivation of today's sessions, so it advances on its own.
    useSessionStore.setState({ sessions: await db.sessions.toArray() });

    // …the derivation then moves the flow onto item 2 (no position state).
    await waitForDom(() => activeStep === 'Zikr Two');

    // The store mirrors the day's real history — the flow's done state is
    // a pure derivation, so "done" is true the moment the last count lands
    // from anywhere.
    useSessionStore.setState({
      sessions: [sessionFor(1, 3), sessionFor(2, 2)],
      loading: false,
    });
    await waitForDom(() => container!.textContent!.includes("Today's routine is complete."));
    await waitForDom(() => activeStep === 'Morning adhkar');

    // Done → the calm card's single way out bubbles to the page.
    buttonByText('Done')!.click();
    await waitForDom(() => onFinish.mock.calls.length > 0);
  });

  it('blocks done with the gentle line while an item’s zikr is missing (§5.2)', async () => {
    // Only zikr 1 is live — item 2's zikr was soft-deleted.
    useZikrStore.setState({ zikrs: [zikr(1, 'Zikr One')], loading: false });
    useSessionStore.setState({
      sessions: [sessionFor(1, 3), sessionFor(2, 100)],
      loading: false,
    });
    useRoutineStore.setState({ routines: [makeRoutine()], loading: false });

    await renderFlow({ routineIdParam: 'r1' });
    await waitForDom(() =>
      container!.textContent!.includes(
        'A zikr in this routine was removed — restore it or edit the routine.'
      )
    );
    expect(container!.textContent).not.toContain("Today's routine is complete.");
  });

  it('keeps the PLAIN counter bit-for-bit: Another Round available, no flowMode', async () => {
    useZikrStore.setState({ zikrs: [zikr(1, 'Zikr One'), zikr(2, 'Zikr Two')], loading: false });
    useSessionStore.setState({ sessions: [], loading: false });
    useRoutineStore.setState({ routines: [], loading: false });

    await renderFlow({ zikrIdParam: '1', targetParam: 3 });
    await waitForDom(() => activeStep === 'Zikr One');

    // Reach the target — the plain counter offers Another Round.
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }));
      await sleep(30);
    }
    await waitForDom(() => container!.textContent!.includes('Target reached — saved!'));
    expect(buttonByText('Another Round')).not.toBeNull();
    expect(buttonByText('Next item')).toBeNull();
  });
});

function buttonByText(text: string): HTMLButtonElement | null {
  return (
    ([...container!.querySelectorAll('button')] as HTMLButtonElement[]).find(
      b => b.textContent?.includes(text)
    ) ?? null
  );
}
