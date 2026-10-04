// PostSalahTrackerContainer render decisions (R1 day view):
//   - enabled + location + computed periods → the five-salah tracker; the
//     CURRENT slot is a button that bubbles onStartFlow(prayer, firstZikrId)
//   - a PAST, not-done slot is also a button: it opens the offline mark-done
//     ask; confirming records attributed sessions for the remaining amounts
//     and the slot reads Done (a set the user never finished is never
//     labeled missed — it moves on silently)
//   - the set completed for the current prayer → that slot reads Done
//   - feature off + set resolvable + not dismissed + not deferred → the
//     ONE quiet opt-in offer; CTA bubbles onOpenSettings; dismiss persists
//     the postSalahOffer KV (no nag)
//   - dismissed or deferred → renders nothing
// Only Date is faked (adhan computes for the mocked instant); timers stay
// real so the DOM waits behave.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import PostSalahTrackerContainer from '../../../src/ui/containers/postSalah/PostSalahTrackerContainer';
import ConfirmDialogHost from '../../../src/ui/components/ConfirmDialog';
import { db } from '../../../src/core/db/db';
import { useSessionStore } from '../../../src/core/stores/sessionStore';
import { useZikrStore } from '../../../src/core/stores/zikrStore';
import { useSettingsStore } from '../../../src/core/stores/settingsStore';
import { dayPrayerTimes } from '../../../src/core/utils/prayerTimes';
import type { PrayerName } from '../../../src/core/utils/prayerTimes';
import type { PrayerLocation, Session, Zikr } from '../../../src/core/db/types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDom(cond: () => boolean | Promise<boolean>, ms = 2000) {
  const start = performance.now();
  while (!(await cond())) {
    if (performance.now() - start > ms) throw new Error('waitForDom: condition not met in time');
    await sleep(25);
  }
}

const DHAKA: PrayerLocation = {
  lat: 23.81,
  lon: 90.41,
  label: 'Dhaka',
  method: 'Karachi',
  madhab: 'Shafi',
};

const SET_ZIKRS: Zikr[] = [
  { id: 1, name: 'SubhanAllah', custom: false, createdAt: new Date() },
  { id: 2, name: 'Alhamdulillah', custom: false, createdAt: new Date() },
  { id: 3, name: 'Allahu Akbar', custom: false, createdAt: new Date() },
  { id: 4, name: 'La ilaha illallah', custom: false, createdAt: new Date() },
];

function sessionsAt(
  entries: Array<{ zikrId: number; count: number }>,
  at: Date,
  postSalah?: Session['postSalah']
): Session[] {
  const midnight = new Date(at);
  midnight.setHours(0, 0, 0, 0);
  return entries.map((e, i) => ({
    id: i + 1,
    zikrId: e.zikrId,
    count: e.count,
    source: 'app' as const,
    timestamp: at,
    date: midnight,
    editableUntil: at,
    createdAt: at,
    updatedAt: at,
    postSalah,
  }));
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let started: { prayer: PrayerName; zikrId: number | null } | null = null;
let settingsOpened = false;
const onStartFlow = (prayer: PrayerName, zikrId: number | null) => {
  started = { prayer, zikrId };
};

/** Render with Date faked to a instant inside Dhaka's maghrib window. */
async function renderTracker(opts: {
  settings: Record<string, unknown>;
  sessions?: Session[];
  deferOffer?: boolean;
}) {
  const times = dayPrayerTimes(DHAKA, new Date(2026, 2, 20, 12))!;
  const mockedNow = new Date(times.maghrib.getTime() + 60_000);
  vi.useFakeTimers({ toFake: ['Date'], now: mockedNow });

  useZikrStore.setState({ zikrs: SET_ZIKRS, loading: false });
  useSessionStore.setState({ sessions: opts.sessions ?? [], loading: false });
  useSettingsStore.setState({ settings: opts.settings, loading: false });

  started = null;
  settingsOpened = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(
      React.Fragment,
      null,
      React.createElement(PostSalahTrackerContainer, {
        onStartFlow,
        onOpenSettings: () => {
          settingsOpened = true;
        },
        deferOffer: opts.deferOffer,
      }),
      // The app-wide dialog host — the offline mark-done ask renders here.
      React.createElement(ConfirmDialogHost)
    )
  );
  await sleep(50);
  return { mockedNow };
}

function buttonByAria(label: string): HTMLButtonElement | null {
  return (
    ([...container!.querySelectorAll('button')] as HTMLButtonElement[]).find(
      b => b.getAttribute('aria-label') === label
    ) ?? null
  );
}

function elementByAria(label: string): Element | null {
  return (
    ([...container!.querySelectorAll('[aria-label]')] as Element[]).find(
      el => el.getAttribute('aria-label') === label
    ) ?? null
  );
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

describe('PostSalahTrackerContainer — the enabled tracker', () => {
  it('renders the five salah chips and the live slot starts the flow', async () => {
    await renderTracker({ settings: { postSalahEnabled: true, prayerLocation: DHAKA } });
    await waitForDom(() => container!.textContent!.includes('After salah azkars'));

    for (const prayer of ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']) {
      expect(container!.textContent).toContain(prayer);
    }
    // Progress counts done slots (none yet).
    expect(container!.textContent).toContain('0 of 5 complete');

    const live = buttonByAria('Start the after-salah set for Maghrib');
    expect(live).not.toBeNull();
    live!.click();
    expect(started).toEqual({ prayer: 'maghrib', zikrId: 1 });
  });

  it('a completed live slot reads Done and stops being tappable', async () => {
    const times = dayPrayerTimes(DHAKA, new Date(2026, 2, 20, 12))!;
    const sessions = sessionsAt(
      [
        { zikrId: 1, count: 33 },
        { zikrId: 2, count: 33 },
        { zikrId: 3, count: 34 },
        { zikrId: 4, count: 100 },
      ],
      new Date(times.maghrib.getTime() + 60_000),
      'maghrib'
    );
    await renderTracker({
      settings: { postSalahEnabled: true, prayerLocation: DHAKA },
      sessions,
    });
    await waitForDom(() => container!.textContent!.includes('1 of 5 complete'));

    expect(elementByAria('Maghrib — Done')).not.toBeNull();
    expect(buttonByAria('Start the after-salah set for Maghrib')).toBeNull();
  });

  it('a past prayer’s chip asks, then marks the offline completion', async () => {
    // Date is mocked at maghrib+1min: Fajr/Dhuhr/Asr moved on undone —
    // they are tappable with the offline ask, never labeled "missed".
    await renderTracker({ settings: { postSalahEnabled: true, prayerLocation: DHAKA } });
    await waitForDom(() => container!.textContent!.includes('0 of 5 complete'));

    const fajrChip = buttonByAria('Mark the after-Fajr set as done');
    expect(fajrChip).not.toBeNull();
    fajrChip!.click();
    await waitForDom(() =>
      container!.textContent!.includes('Did you already offer the after-Fajr set?')
    );

    buttonByText('Yes, mark done')!.click();
    // One self-healing wait against the effect-attach race on loaded CI
    // runners (97298d0 idiom): each poll reads the db, pushes it into the
    // store the way the app's liveQuery subscription would, and only
    // succeeds when the RENDER has caught up — ordering-proof, generous
    // budget.
    await waitForDom(async () => {
      const all = await db.sessions.toArray();
      useSessionStore.setState({ sessions: all });
      return container!.textContent!.includes('1 of 5 complete');
    }, 5000);

    // The mark recorded the set's remaining amounts, attributed to Fajr.
    const sessions = await db.sessions.toArray();
    const fajrSets = sessions.filter(s => s.postSalah === 'fajr');
    expect(fajrSets.map(s => s.count).sort((a, b) => a - b)).toEqual([33, 33, 34, 100]);
    expect(elementByAria('Fajr — Done')).not.toBeNull();
    // The other moved-on prayers stay pending (tappable asks).
    expect(buttonByAria('Mark the after-Dhuhr set as done')).not.toBeNull();
  });

  it('cancelling the offline ask records nothing', async () => {
    await renderTracker({ settings: { postSalahEnabled: true, prayerLocation: DHAKA } });
    await waitForDom(() => container!.textContent!.includes('0 of 5 complete'));

    buttonByAria('Mark the after-Fajr set as done')!.click();
    await waitForDom(() =>
      container!.textContent!.includes('Did you already offer the after-Fajr set?')
    );
    buttonByText('Cancel')!.click();
    await sleep(60);
    expect((await db.sessions.toArray()).filter(s => s.postSalah === 'fajr')).toHaveLength(0);
    expect(container!.textContent).toContain('0 of 5 complete');
  });
});

describe('PostSalahTrackerContainer — the quiet opt-in offer', () => {
  it('offers once while the feature is off; CTA opens Settings, dismiss persists', async () => {
    await renderTracker({ settings: {} });
    await waitForDom(() => container!.textContent!.includes('Track your after-salah adhkar'));

    buttonByText('Set up')!.click();
    expect(settingsOpened).toBe(true);

    buttonByAria('Maybe later')!.click();
    await waitForDom(async () => (await db.settings.get('postSalahOffer')) !== undefined);
    expect((await db.settings.get('postSalahOffer'))?.value).toEqual({ dismissed: true });
  });

  it('renders nothing once dismissed', async () => {
    await renderTracker({ settings: { postSalahOffer: { dismissed: true } } });
    await sleep(50);
    expect(container!.textContent).not.toContain('Track your after-salah adhkar');
    expect(container!.textContent!.trim()).toBe('');
  });

  it('defers while another quiet offer is showing (never two offers at once)', async () => {
    await renderTracker({ settings: {}, deferOffer: true });
    await sleep(50);
    expect(container!.textContent!.trim()).toBe('');
  });
});
