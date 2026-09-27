// Feature C — the Home "current ritual" card (§16.3 slot after the streak /
// today's count):
//   - Home shows RitualNowCard for the routine whose civil window matches
//     the (mocked) current time, with its Now chip and today progress;
//   - Start navigates to the routine's counter flow deep link;
//   - upcoming ordering at the midday gap, and the R1 hand-off: while the
//     post-salah card is active the card shows the NEXT routine instead
//     (container-level — no two cards claiming the same moment).
// Home runs against the real page in MemoryRouter with ONLY Date faked
// (timers stay real so the DOM waits behave; waits use performance.now,
// which the Date fake does not touch). The container tests pass the
// explicit `now` seam instead.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';

import Home from '../../../src/ui/pages/Home';
import RitualNowContainer from '../../../src/ui/containers/routines/RitualNowContainer';
import { useZikrStore } from '../../../src/core/stores/zikrStore';
import { useSessionStore } from '../../../src/core/stores/sessionStore';
import { usePlanStore } from '../../../src/core/stores/planStore';
import { useRoutineStore } from '../../../src/core/stores/routineStore';
import { useSettingsStore } from '../../../src/core/stores/settingsStore';
import { useSharedRoomStore } from '../../../src/core/stores/sharedRoomStore';
import { Routine, Session, Zikr } from '../../../src/core/db/types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Date-fake-proof wait: performance.now keeps running when Date is faked. */
async function waitForDom(cond: () => boolean, ms = 2000) {
  const start = performance.now();
  while (!cond()) {
    if (performance.now() - start > ms) throw new Error('waitForDom: condition not met in time');
    await sleep(25);
  }
}

function zikr(id: number, name: string): Zikr {
  return { id, name, custom: false, createdAt: new Date(), defaultTarget: 33 };
}

/** Sunday 2026-09-20 07:00 local — inside the morning window (03:30–11:29). */
const SUNDAY_0700 = new Date(2026, 8, 20, 7, 0, 0, 0);
const SUNDAY_MID = new Date(2026, 8, 20, 13, 0, 0, 0); // the unclaimed gap

const MORNING_ROUTINE: Routine = {
  id: 'r1',
  source: 'preset',
  presetKey: 'morning',
  schedule: { part: 'morning' },
  items: [
    { zikrId: 1, name: 'Zikr One', target: 3 },
    { zikrId: 2, name: 'Zikr Two', target: 3 },
  ],
  createdAt: new Date(2026, 8, 19),
};

const EVENING_ROUTINE: Routine = {
  id: 'r2',
  source: 'preset',
  presetKey: 'evening',
  schedule: { part: 'evening' },
  items: [{ zikrId: 2, name: 'Zikr Two', target: 7 }],
  createdAt: new Date(2026, 8, 19),
};

function LocationProbe(): React.ReactElement {
  const loc = useLocation();
  return React.createElement('div', { 'data-testid': 'location-probe' }, `${loc.pathname}${loc.search}`);
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderHome() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/'] },
      React.createElement(Home),
      React.createElement(LocationProbe)
    )
  );
  await sleep(50);
}

function buttonByText(text: string): HTMLButtonElement | null {
  return (
    ([...container!.querySelectorAll('button')] as HTMLButtonElement[]).find(
      b => b.textContent?.includes(text)
    ) ?? null
  );
}

beforeEach(() => {
  useZikrStore.setState({
    zikrs: [zikr(1, 'Zikr One'), zikr(2, 'Zikr Two')],
    loading: false,
  });
  useSessionStore.setState({ sessions: [], loading: false });
  usePlanStore.setState({ plans: [], loading: false });
  useRoutineStore.setState({ routines: [], loading: false });
  useSettingsStore.setState({ settings: {}, loading: false });
  // Home's guarded shared-room init: pre-mark initialized so the effect
  // never runs (no network, no db in this test).
  useSharedRoomStore.setState({ initialized: true, rooms: [], plans: [] });
});

afterEach(async () => {
  await sleep(40);
  vi.useRealTimers();
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('Home — the current ritual card (Feature C)', () => {
  it('shows the in-window routine with the Now chip and today progress', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SUNDAY_0700 });
    useRoutineStore.setState({ routines: [MORNING_ROUTINE] });

    await renderHome();
    await waitForDom(() => container!.textContent!.includes('Morning adhkar'));

    // Card: the Now chip + "0/2" progress. The section row still renders
    // its own position line ("Item 1 of 2") beneath.
    expect(container!.textContent).toContain('Now');
    expect(container!.textContent).toContain('0/2');
    expect(container!.textContent).toContain('Item 1 of 2');
  });

  it('Start deep-links the routine flow (/counter?zikrId=…&routineId=…)', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SUNDAY_0700 });
    useRoutineStore.setState({ routines: [MORNING_ROUTINE] });

    await renderHome();
    await waitForDom(() => buttonByText('Start') !== null);

    buttonByText('Start')!.click();
    const probe = () => container!.querySelector('[data-testid="location-probe"]')!.textContent;
    await waitForDom(() => probe() !== '/');
    expect(probe()).toBe('/counter?zikrId=1&routineId=r1');
  });

  it('at the midday gap the first upcoming routine (evening) shows with its window label', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: SUNDAY_MID });
    useRoutineStore.setState({ routines: [MORNING_ROUTINE, EVENING_ROUTINE] });

    await renderHome();
    await waitForDom(() => container!.textContent!.includes('This evening'));

    // "Now" belongs to no one at 13:00 — evening is next-up.
    expect(container!.textContent).not.toContain('Now');
  });
});

describe('RitualNowContainer — the R1 hand-off (no duplicate "moment" cards)', () => {
  async function renderRitual(props: { postSalahActive?: boolean; now: Date }) {
    let started: { routineId: string; zikrId: number | null } | null = null;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(
      React.createElement(RitualNowContainer, {
        now: props.now,
        postSalahActive: props.postSalahActive,
        onStart: (routineId: string, zikrId: number | null) => {
          started = { routineId, zikrId };
        },
      })
    );
    await sleep(40);
    return () => started as { routineId: string; zikrId: number | null } | null;
  }

  it('while the post-salah card is active, shows the NEXT routine instead of the current one', async () => {
    useRoutineStore.setState({ routines: [MORNING_ROUTINE, EVENING_ROUTINE] });
    const getStarted = await renderRitual({ now: SUNDAY_0700, postSalahActive: true });
    await waitForDom(() => container!.textContent!.includes('Evening adhkar'));

    expect(container!.textContent).not.toContain('Morning adhkar');
    expect(container!.textContent).toContain('This evening'); // upcoming label, not "Now"

    buttonByText('Start')!.click();
    expect(getStarted()).toEqual({ routineId: 'r2', zikrId: 2 });
  });

  it('without R1 leading, the current routine leads with the Now chip and resume point', async () => {
    useRoutineStore.setState({ routines: [MORNING_ROUTINE, EVENING_ROUTINE] });
    const getStarted = await renderRitual({ now: SUNDAY_0700 });
    await waitForDom(() => container!.textContent!.includes('Morning adhkar'));

    expect(container!.textContent).toContain('Now');
    expect(container!.textContent).toContain('0/2');
    expect(container!.textContent).not.toContain('Evening adhkar');

    buttonByText('Start')!.click();
    // Resume point = first incomplete item's zikr.
    expect(getStarted()).toEqual({ routineId: 'r1', zikrId: 1 });
  });

  it('shows the compact done state (card stays, Start disappears)', async () => {
    // Sessions on the MOCKED day (2026-09-20) — both items complete.
    const midnight = new Date(2026, 8, 20);
    const stamp = new Date(2026, 8, 20, 6, 30);
    const sessions: Session[] = [1, 2].map((zikrId, i) => ({
      id: i + 1,
      zikrId,
      count: 3,
      source: 'app' as const,
      timestamp: stamp,
      date: midnight,
      editableUntil: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    }));
    useSessionStore.setState({ sessions });
    useRoutineStore.setState({ routines: [MORNING_ROUTINE] });

    const getStarted = await renderRitual({ now: SUNDAY_0700 });
    await waitForDom(() => container!.textContent!.includes('Done today'));

    expect(container!.textContent).toContain('Morning adhkar');
    expect(container!.textContent).not.toContain('0/2'); // done hides the counter
    expect(buttonByText('Start')).toBeNull();
    expect(getStarted()).toBeNull();
  });

  it('renders nothing with no routines at all', async () => {
    useRoutineStore.setState({ routines: [] });
    await renderRitual({ now: SUNDAY_0700 });
    await sleep(40);
    expect(container!.textContent).toBe('');
  });
});
