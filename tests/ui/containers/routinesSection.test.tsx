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
const offerVisibility = vi.fn<(visible: boolean) => void>();

async function renderSection(opts: { hideQuietOffer?: boolean; now?: Date } = {}) {
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
        onOfferVisibilityChange: offerVisibility,
        now: opts.now,
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
  offerVisibility.mockClear();
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
    // The chrome bridge reports the offer's presence (Home defers the
    // after-salah offer while this one shows).
    expect(offerVisibility).toHaveBeenCalledWith(true);

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

  it('a scheduled row never counts a sibling routine attributed saves (the morning/evening fix)', async () => {
    // The evening preset shares the morning preset's zikr rows: a session
    // attributed to the morning flow must leave the evening row pending.
    const evening: Routine = {
      ...midFlow,
      id: 'evening',
      presetKey: 'evening',
      schedule: { part: 'evening' },
    };
    useZikrStore.setState({ zikrs, loading: false });
    useSessionStore.setState({
      sessions: todaySessions([
        { zikrId: 1, count: 3 },
        { zikrId: 2, count: 5 },
      ]).map(s => ({ ...s, routineId: 'morning' })),
      loading: false,
    });
    useRoutineStore.setState({ routines: [evening], loading: false });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection();
    await waitForDom(() => container!.textContent!.includes('Evening adhkar'));
    expect(container!.textContent).not.toContain('Done today');

    // The same counts attributed to EVENING (its own guided flow) complete it.
    useSessionStore.setState({
      sessions: todaySessions([
        { zikrId: 1, count: 3 },
        { zikrId: 2, count: 5 },
      ]).map(s => ({ ...s, routineId: 'evening' })),
      loading: false,
    });
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

describe('RoutinesSectionContainer — the day-context groups', () => {
  const zikrs: Zikr[] = [zikr(1, 'Zikr One'), zikr(2, 'Zikr Two'), zikr(3, 'Zikr Three')];

  /** Wednesday 2026-09-23 10:00 (inside the morning window) / Friday 09-25. */
  const WED_1000 = new Date(2026, 8, 23, 10, 0, 0, 0);
  const FRI_1300 = new Date(2026, 8, 25, 13, 0, 0, 0);

  function presetRoutine(
    key: 'morning' | 'evening' | 'night' | 'friday',
    items: Array<{ zikrId: number; target: number }>
  ): Routine {
    const schedules = {
      morning: { part: 'morning' as const },
      evening: { part: 'evening' as const },
      night: { part: 'night' as const },
      friday: { part: 'any' as const, weekday: 5 },
    };
    return {
      id: `r-${key}`,
      source: 'preset',
      presetKey: key,
      schedule: schedules[key],
      items: items.map(i => ({ ...i, name: `Zikr ${i.zikrId}` })),
      createdAt: new Date(),
    };
  }

  /** Sessions stamped onto the GROUPING day (the container derives `day` from `now`). */
  function sessionsOn(now: Date, entries: Array<{ zikrId: number; count: number }>): Session[] {
    const midnight = new Date(now);
    midnight.setHours(0, 0, 0, 0);
    const stamp = new Date(now);
    stamp.setHours(7, 0, 0, 0);
    return entries.map((e, i) => ({
      id: i + 1,
      zikrId: e.zikrId,
      count: e.count,
      source: 'app' as const,
      timestamp: stamp,
      date: midnight,
      editableUntil: stamp,
      createdAt: stamp,
      updatedAt: stamp,
    }));
  }

  it('Wednesday morning: morning is Now, evening is Up next (time-labelled), friday is hidden', async () => {
    useZikrStore.setState({ zikrs, loading: false });
    useSessionStore.setState({ sessions: [], loading: false });
    useRoutineStore.setState({
      routines: [
        presetRoutine('morning', [{ zikrId: 1, target: 3 }]),
        presetRoutine('evening', [{ zikrId: 2, target: 7 }]),
        presetRoutine('friday', [{ zikrId: 3, target: 100 }]),
      ],
      loading: false,
    });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection({ now: WED_1000 });
    await waitForDom(() => container!.textContent!.includes('Morning adhkar'));

    expect(container!.textContent).toContain('Now');
    expect(container!.textContent).toContain('Evening adhkar');
    // The upcoming window label carries the time ("This evening · 15:00").
    expect(container!.textContent).toContain('This evening · 15:00');
    expect(container!.textContent).toContain('Up next');
    // The weekday-bound routine is invisible on a Wednesday.
    expect(container!.textContent).not.toContain('Friday sunnahs');
  });

  it('Friday midday gap: friday owns the moment, morning is Up next', async () => {
    useZikrStore.setState({ zikrs, loading: false });
    useSessionStore.setState({ sessions: [], loading: false });
    useRoutineStore.setState({
      routines: [
        presetRoutine('morning', [{ zikrId: 1, target: 3 }]),
        presetRoutine('friday', [{ zikrId: 3, target: 100 }]),
      ],
      loading: false,
    });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection({ now: FRI_1300 });
    await waitForDom(() => container!.textContent!.includes('Friday sunnahs'));

    expect(container!.textContent).toContain('Now');
    expect(container!.textContent).toContain('Morning adhkar');
    expect(container!.textContent).toContain('03:30'); // tomorrow's window start
  });

  it('a completed scheduled routine renders under Done today', async () => {
    useZikrStore.setState({ zikrs, loading: false });
    useSessionStore.setState({ sessions: sessionsOn(WED_1000, [{ zikrId: 1, count: 3 }]), loading: false });
    useRoutineStore.setState({
      routines: [
        presetRoutine('morning', [{ zikrId: 1, target: 3 }]),
        presetRoutine('evening', [{ zikrId: 2, target: 7 }]),
      ],
      loading: false,
    });
    useSettingsStore.setState({ settings: {}, loading: false });

    await renderSection({ now: WED_1000 });
    await waitForDom(() => container!.textContent!.includes('Done today'));

    expect(container!.textContent).toContain('Morning adhkar');
    expect(container!.textContent).toContain('Evening adhkar'); // still Up next
    // Nothing matches now — no Now group, hence no Now label.
    expect(container!.textContent).not.toContain('Now');
  });
});
