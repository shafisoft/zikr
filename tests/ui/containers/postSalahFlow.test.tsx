// CounterFlowContainer — the post-salah source (§16.4 / AC1.3.x):
//   - opens on the set's first item (SubhanAllah) with the catalog target
//   - in-window sessions advance the derived position (no handler, no
//     extra state — position IS the derivation, §2.3)
//   - sessions OUTSIDE the window never masquerade as the set (AC1.2.3)
//   - after the last item, the calm done card (AC1.3.6)
// Time is pinned with fake timers (Date only — the poll helpers stay real).
// No IndexedDB involved: pure store states.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

vi.mock('../../../src/ui/hooks/useNow', () => ({
  default: () => new Date('2026-03-20T12:15:00.000Z'), // inside Dhaka's maghrib window
}));

import CounterFlowContainer from '../../../src/ui/containers/counter/CounterFlowContainer';
import { useSessionStore } from '../../../src/core/stores/sessionStore';
import { useZikrStore } from '../../../src/core/stores/zikrStore';
import { useSettingsStore } from '../../../src/core/stores/settingsStore';
import { usePlanStore } from '../../../src/core/stores/planStore';
import { useRoutineStore } from '../../../src/core/stores/routineStore';
import type { PrayerLocation, Session, Zikr } from '../../../src/core/db/types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDom(cond: () => boolean | Promise<boolean>, ms = 2000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > ms) throw new Error('waitForDom: condition not met in time');
    await sleep(25);
  }
}

function zikr(id: number, name: string): Zikr {
  return { id, name, custom: false, createdAt: new Date() };
}

function session(zikrId: number, count: number, timestamp: Date): Session {
  const midnight = new Date(timestamp);
  midnight.setHours(0, 0, 0, 0);
  return {
    id: zikrId * 100 + count,
    zikrId,
    count,
    source: 'app',
    timestamp,
    date: midnight,
    editableUntil: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

const dhaka: PrayerLocation = {
  lat: 23.81,
  lon: 90.41,
  label: 'Dhaka',
  method: 'Karachi',
  madhab: 'Shafi',
};

const SET_ZIKRS: Zikr[] = [
  zikr(1, 'SubhanAllah'),
  zikr(2, 'Alhamdulillah'),
  zikr(3, 'Allahu Akbar'),
  zikr(4, 'La ilaha illallah'),
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let activeStep: string | null | undefined;

async function renderFlow() {
  if (root) {
    root.unmount();
    root = null;
    container?.remove();
  }
  activeStep = undefined;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(CounterFlowContainer, {
      zikrIdParam: null,
      targetParam: 0,
      planIdParam: null,
      routineIdParam: null,
      postSalahParam: 'maghrib',
      onFinish: () => {},
      onActiveStep: (name: string | null) => {
        activeStep = name;
      },
    })
  );
  await sleep(50);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-03-20T12:15:00.000Z'));
  useZikrStore.setState({ zikrs: SET_ZIKRS, loading: false });
  useSessionStore.setState({ sessions: [], loading: false });
  useSettingsStore.setState(
    { settings: { prayerLocation: dhaka, postSalahEnabled: true }, loading: false }
  );
  usePlanStore.setState({ plans: [], loading: false });
  useRoutineStore.setState({ routines: [], loading: false });
});

afterEach(async () => {
  await sleep(30);
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
  vi.useRealTimers();
});

describe('CounterFlowContainer — post-salah source (§16.4)', () => {
  it('opens on SubhanAllah and advances by in-window derivation (AC1.3.1/AC1.3.3)', async () => {
    await renderFlow();
    await waitForDom(() => activeStep === 'SubhanAllah');
    expect(activeStep).toBe('SubhanAllah');

    // A partial in-window set: items 1–2 complete → position jumps to item 3.
    useSessionStore.setState({
      sessions: [
        session(1, 33, new Date('2026-03-20T12:10:00.000Z')),
        session(2, 33, new Date('2026-03-20T12:12:00.000Z')),
      ],
      loading: false,
    });
    await waitForDom(() => activeStep === 'Allahu Akbar');

    // Completing everything lands on the calm done card (AC1.3.6).
    useSessionStore.setState({
      sessions: [
        session(1, 33, new Date('2026-03-20T12:10:00.000Z')),
        session(2, 33, new Date('2026-03-20T12:12:00.000Z')),
        session(3, 34, new Date('2026-03-20T12:20:00.000Z')),
        session(4, 100, new Date('2026-03-20T12:30:00.000Z')),
      ],
      loading: false,
    });
    await waitForDom(() => container!.textContent!.includes('after-salah set is complete'));
    expect(activeStep).toBe('After-salah set');
  });

  it('does NOT credit sessions from outside the window (AC1.2.3)', async () => {
    // Plenty of set zikr earlier today — before the 12:09Z window — and
    // Isha-window sessions from "yesterday evening": none of it counts.
    useSessionStore.setState({
      sessions: [
        session(1, 500, new Date('2026-03-20T09:00:00.000Z')),
        session(2, 500, new Date('2026-03-20T09:30:00.000Z')),
        session(3, 500, new Date('2026-03-20T10:00:00.000Z')),
        session(4, 500, new Date('2026-03-20T10:30:00.000Z')),
      ],
      loading: false,
    });
    await renderFlow();
    await waitForDom(() => activeStep === 'SubhanAllah');
    expect(activeStep).toBe('SubhanAllah');
  });
});
