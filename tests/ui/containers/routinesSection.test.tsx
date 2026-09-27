// RoutinesSectionContainer render decisions (§16.3):
//   - no routines + cluster zikrs + not dismissed → the ONE quiet offer;
//     tapping a preset invokes routineStore.createPreset (AC2.4.2)
//   - dismissed (routinePresetOffer KV) → renders nothing (P1)
//   - routines render as glance rows with position/done/missing states
//   - row delete goes through the in-app confirm and soft-deletes ONLY the
//     routine (AC2.4.3)
// Runs against the real stores + fake-indexeddb.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import RoutinesSectionContainer, {
  RoutineRowView,
} from '../../../src/ui/containers/routines/RoutinesSectionContainer';
import { ConfirmDialogHost } from '../../../src/ui/components/ConfirmDialog';
import { db } from '../../../src/core/db/db';
import { useRoutineStore } from '../../../src/core/stores/routineStore';
import { useSessionStore } from '../../../src/core/stores/sessionStore';
import { useZikrStore } from '../../../src/core/stores/zikrStore';
import { useSettingsStore } from '../../../src/core/stores/settingsStore';
import { Routine, Session, Zikr } from '../../../src/core/db/types';

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

const CLUSTER = [
  ['Bismillahilladhi la Yadurru', 3],
  ['Radhitu Billahi Rabba', 3],
  ['Allahumma Ajirni Minan-Nar', 7],
  ['Hasbiyallahu La ilaha illa Huwa', 7],
  ['Sayyidul Istighfar', 1],
  ["Allahumma A'inni ala Dhikrika", 10],
] as const;

function todaySessions(entries: Array<{ zikrId: number; count: number }>): Session[] {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return entries.map((e, i) => ({
    id: i + 1,
    zikrId: e.zikrId,
    count: e.count,
    source: 'app' as const,
    timestamp: now,
    date: midnight,
    editableUntil: now,
    createdAt: now,
    updatedAt: now,
  }));
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let pressed: RoutineRowView | null = null;
const createPreset = vi.fn<(key: 'morning' | 'evening') => Promise<string>>();
const softDelete = vi.fn<(id: string) => Promise<void>>();

async function renderSection(opts: { hideQuietOffer?: boolean } = {}) {
  if (root) {
    root.unmount();
    root = null;
    container?.remove();
  }
  pressed = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(RoutinesSectionContainer, {
        onRoutinePress: (view: RoutineRowView) => {
          pressed = view;
        },
        onEditRoutine: () => {},
        hideQuietOffer: opts.hideQuietOffer,
      }),
      React.createElement(ConfirmDialogHost)
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

beforeEach(async () => {
  await db.delete();
  await db.open();
  vi.restoreAllMocks();
  createPreset.mockResolvedValue('new-routine');
  softDelete.mockResolvedValue(undefined);
});

afterEach(async () => {
  await sleep(60);
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('RoutinesSectionContainer — the quiet offer (AC2.4.2)', () => {
  it('offers the presets once when there are no routines and the library has the cluster', async () => {
    useZikrStore.setState({
      zikrs: CLUSTER.map(([name], i) => zikr(i + 1, name)),
      loading: false,
    });
    useSessionStore.setState({ sessions: [], loading: false });
    useRoutineStore.setState({ routines: [], loading: false, createPreset: createPreset as never });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection();
    await waitForDom(() => container!.textContent!.includes('Try a ready-made routine'));

    buttonByText('Morning adhkar')!.click();
    await waitForDom(() => createPreset.mock.calls.length > 0);
    expect(createPreset).toHaveBeenCalledWith('morning');

    // Dismissal persists via the settings KV (the dismiss control is the
    // icon button labelled "Maybe later").
    (container!.querySelector('button[aria-label="Maybe later"]') as HTMLButtonElement).click();
    await waitForDom(async () => (await db.settings.get('routinePresetOffer')) !== undefined);
    expect((await db.settings.get('routinePresetOffer'))?.value).toEqual({ dismissed: true });
  });

  it('renders nothing once dismissed — no nag (AC2.4.3 / P1)', async () => {
    useZikrStore.setState({ zikrs: CLUSTER.map(([name], i) => zikr(i + 1, name)), loading: false });
    useSessionStore.setState({ sessions: [], loading: false });
    useRoutineStore.setState({ routines: [], loading: false });
    useSettingsStore.setState({
      settings: { routinePresetOffer: { dismissed: true } },
      loading: false,
    });

    await renderSection();
    await sleep(50);
    expect(container!.textContent).not.toContain('Try a ready-made routine');
    expect(container!.textContent).not.toContain('Morning adhkar');
  });

  it('stays hidden while the current-ritual card is present (hideQuietOffer bridge)', async () => {
    // No routines — the offer would normally show — but the ritual card
    // above is already speaking for the routines (§16.1 chrome bridge).
    useZikrStore.setState({ zikrs: CLUSTER.map(([name], i) => zikr(i + 1, name)), loading: false });
    useSessionStore.setState({ sessions: [], loading: false });
    useRoutineStore.setState({ routines: [], loading: false });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection({ hideQuietOffer: true });
    await sleep(50);
    expect(container!.textContent).not.toContain('Try a ready-made routine');
  });
});

describe('RoutinesSectionContainer — glance rows (AC2.4.1)', () => {
  const zikrs: Zikr[] = [
    zikr(1, 'Bismillahilladhi la Yadurru'),
    zikr(2, 'Radhitu Billahi Rabba'),
  ];

  const midFlow: Routine = {
    id: 'r1',
    source: 'preset',
    presetKey: 'morning',
    items: [
      { zikrId: 1, name: 'Bismillahilladhi la Yadurru', target: 3 },
      { zikrId: 2, name: 'Radhitu Billahi Rabba', target: 3 },
    ],
    createdAt: new Date(),
  };

  it('shows the in-progress position ("Item 2 of 2") and bubbles the resume point', async () => {
    useZikrStore.setState({ zikrs, loading: false });
    useSessionStore.setState({ sessions: todaySessions([{ zikrId: 1, count: 3 }]), loading: false });
    useRoutineStore.setState({ routines: [midFlow], loading: false });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection();
    await waitForDom(() => container!.textContent!.includes('Morning adhkar'));
    expect(container!.textContent).toContain('Item 2 of 2');

    // Tap the row: the resume point (first incomplete zikr) travels along.
    (container!.querySelector('button[aria-label^="Start"]') as HTMLButtonElement).click();
    await waitForDom(() => pressed !== null);
    expect(pressed!.zikrId).toBe(2);
    expect(pressed!.done).toBe(false);
    expect(pressed!.current).toBe(2);
  });

  it('shows "Done today" when every item reached its count from any source', async () => {
    useZikrStore.setState({ zikrs, loading: false });
    useSessionStore.setState({
      sessions: todaySessions([
        { zikrId: 1, count: 3 },
        { zikrId: 2, count: 5 }, // over-target from the plain counter — still done
      ]),
      loading: false,
    });
    useRoutineStore.setState({ routines: [midFlow], loading: false });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection();
    await waitForDom(() => container!.textContent!.includes('Done today'));
  });

  it('greys a row with a gentle "zikr removed" state and blocks done (§5.2)', async () => {
    // zikr 2 soft-deleted → not in the live list.
    useZikrStore.setState({ zikrs: [zikrs[0]], loading: false });
    useSessionStore.setState({
      sessions: todaySessions([
        { zikrId: 1, count: 3 },
        { zikrId: 2, count: 100 },
      ]),
      loading: false,
    });
    useRoutineStore.setState({ routines: [midFlow], loading: false });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection();
    await waitForDom(() => container!.textContent!.includes('zikr removed'));
    expect(container!.textContent).not.toContain('Done today');
  });

  it('deletes through the in-app confirm and touches only the routine (AC2.4.3)', async () => {
    useZikrStore.setState({ zikrs, loading: false });
    useSessionStore.setState({ sessions: [], loading: false });
    useRoutineStore.setState({ routines: [midFlow], loading: false, softDelete: softDelete as never });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection();
    await waitForDom(() => container!.textContent!.includes('Morning adhkar'));

    (container!.querySelector('button[aria-label="Delete routine"]') as HTMLButtonElement).click();
    await waitForDom(() => container!.querySelector('[role="dialog"]') !== null);
    expect(container!.querySelector('[role="dialog"]')!.textContent).toContain(
      'Your zikrs and history are untouched'
    );

    buttonByText('Delete')!.click();
    await waitForDom(() => softDelete.mock.calls.length > 0);
    expect(softDelete).toHaveBeenCalledWith('r1');
  });
});
