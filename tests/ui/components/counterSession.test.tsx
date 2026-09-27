// CounterSession forgiveness behaviors (remediation 1.2):
//   1.2b reset confirm — ALWAYS on, both actions, tap route;
//   1.2a hold-to-take-back, floored, gated + one-time hint;
//   1.2c gated auto-save Undo toast — deletes the session and restores the
//        board, withheld with honest copy when the round propagated.
// Runs against the real stores + fake-indexeddb; group propagation is
// spied (no backend in tests).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import CounterSession from '../../../src/ui/components/counter/CounterSession';
import { ConfirmDialogHost } from '../../../src/ui/components/ConfirmDialog';
import { db } from '../../../src/core/db/db';
import { useSettingsStore } from '../../../src/core/stores/settingsStore';
import { clearCheckpoint } from '../../../src/core/services/countRecorder';
import { sharedRoomService } from '../../../src/core/services/sharedRoom';
import { Zikr } from '../../../src/core/db/types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const HOLD_MS = 520; // just past CounterCircle's 450ms hold threshold

const zikr: Zikr = { id: 7, name: 'SubhanAllah', custom: false, createdAt: new Date() };

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let onCount: ReturnType<typeof vi.fn<(count: number) => void>>;

async function renderSession(props: Record<string, unknown> = {}) {
  // A previous instance must not survive: its window keydown listener
  // would keep counting (and auto-saving) alongside the new one.
  if (root) {
    root.unmount();
    root = null;
    if (container) container.remove();
  }
  onCount = vi.fn<(count: number) => void>();
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
        target: 3,
        onCount,
        onFinish: vi.fn<(savedCount: number) => void>(),
        variant: 'page',
        ...props,
      }),
      React.createElement(ConfirmDialogHost)
    )
  );
  await waitForDom(() => circleButton() !== null);
}

function buttonByText(text: string): HTMLButtonElement | null {
  // MaterialIcon renders the icon ligature as text inside the button, so
  // match buttons whose text CONTAINS the label.
  return (
    ([...container!.querySelectorAll('button')] as HTMLButtonElement[]).find(
      b => b.textContent?.includes(text)
    ) ?? null
  );
}

function countDisplay(): string {
  return container!.querySelector('.font-headline-lg-mobile')?.textContent ?? '';
}

function circleButton(): HTMLElement {
  return (container!.querySelector('button[aria-label^="Tap to count"]') ?? null) as HTMLElement | null as HTMLElement;
}

function dispatchKey(key = ' ') {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

/** One tap = one event + a real flush. React's scheduler renders updates
 * on a slower macrotask than setTimeout(0) under happy-dom, so tests must
 * waitFor DOM state instead of sleeping a fixed tick. */
async function tap() {
  dispatchKey();
  await sleep(30);
}

async function holdAndRelease() {
  circleButton().dispatchEvent(
    new window.PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0 })
  );
  await sleep(HOLD_MS);
  circleButton().dispatchEvent(
    new window.PointerEvent('pointerup', { bubbles: true, pointerId: 1 })
  );
  await sleep(30);
}

async function waitForDom(cond: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitForDom: condition not met in time');
    await sleep(25);
  }
}

beforeEach(async () => {
  // Cancel anything still pending for this zikr, then start clean.
  await clearCheckpoint(zikr.id!);
  await db.delete();
  await db.open();
  useSettingsStore.setState({ settings: {}, loading: false });
  localStorage.clear();
  window.localStorage.removeItem('zikr-unsaved-round');
  vi.restoreAllMocks();
});

afterEach(async () => {
  // Let THIS test's in-flight auto-save / checkpoint-debounce writes land
  // (in its own, about-to-be-wiped database) before unmounting — a chain
  // still running at the next test's beforeEach would pollute its fresh DB.
  await sleep(1150);
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('reset confirmation (1.2b — always on, not gated)', () => {
  it('routes the tap Reset through the in-app dialog with Delete / Keep counting', async () => {
    await renderSession(); // advanced controls OFF — confirm still applies
    await tap();
    await tap();
    await waitForDom(() => countDisplay() === '2');

    buttonByText('Reset')!.click();
    await waitForDom(() => container!.querySelector('[role="dialog"]') !== null);

    const dialog = container!.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Reset counter to zero?');
    expect(buttonByText('Delete')).not.toBeNull();
    expect(buttonByText('Keep counting')).not.toBeNull();

    // Keep counting: dialog closes, the round survives.
    buttonByText('Keep counting')!.click();
    await waitForDom(() => container!.querySelector('[role="dialog"]') === null);
    expect(countDisplay()).toBe('2');

    // Delete: the unsaved remainder is discarded.
    buttonByText('Reset')!.click();
    await waitForDom(() => container!.querySelector('[role="dialog"]') !== null);
    buttonByText('Delete')!.click();
    await waitForDom(() => container!.querySelector('[role="dialog"]') === null);
    await waitForDom(() => countDisplay() === '0');
  });
});

describe('hold-to-take-back (1.2a — gated)', () => {
  it('decrements one per hold, floored at zero', async () => {
    useSettingsStore.setState({
      settings: { advancedCounterControls: true },
      loading: false,
    });
    await renderSession();

    // Hold at zero: the floor holds.
    await holdAndRelease();
    expect(countDisplay()).toBe('0');

    // 1 → hold → 0 → hold → still 0.
    await tap();
    await waitForDom(() => countDisplay() === '1');
    await holdAndRelease();
    await waitForDom(() => countDisplay() === '0');
    await holdAndRelease();
    expect(countDisplay()).toBe('0');
  });

  it('shows the one-time hint once a count passes ~10, persisting the flag', async () => {
    useSettingsStore.setState({
      settings: { advancedCounterControls: true },
      loading: false,
    });
    await renderSession();

    for (let i = 0; i < 11; i++) await tap();
    await waitForDom(() => countDisplay() === '11');
    await waitForDom(() => container!.textContent!.includes('Hold to take one back'));
    expect((await db.settings.get('counterHoldHintShown'))?.value).toBe(true);

    // The flag persists — a fresh session never nags again.
    await renderSession();
    for (let i = 0; i < 11; i++) await tap();
    await waitForDom(() => countDisplay() === '11');
    expect(container!.textContent).not.toContain('Hold to take one back');
  });

  it('renders nothing of the gated UI when the setting is off', async () => {
    await renderSession(); // settings default — advanced controls OFF

    // Counting into the target auto-saves, but NO gated toast appears.
    for (let i = 0; i < 3; i++) await tap();
    await waitForDom(() => countDisplay() === '3');
    await waitForDom(() => container!.textContent!.includes('Target reached — saved!'));
    expect(container!.querySelector('[role="status"]')).toBeNull();

    // The circle still counts on PRESS (legacy path — no take-back armed):
    // a lone pointerdown must increment, never decrement.
    circleButton().dispatchEvent(
      new window.PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0 })
    );
    await sleep(30);
    circleButton().dispatchEvent(
      new window.PointerEvent('pointerup', { bubbles: true, pointerId: 1 })
    );
    await waitForDom(() => countDisplay() === '4');

    // Past 10 with the toggle off: no hint either.
    for (let i = 0; i < 7; i++) await tap();
    await waitForDom(() => countDisplay() === '11');
    expect(container!.textContent).not.toContain('Hold to take one back');
  });
});

describe('auto-save Undo toast (1.2c — gated)', () => {
  it('offers Undo after a non-propagated auto-save; Undo deletes the session and restores the board', async () => {
    useSettingsStore.setState({
      settings: { advancedCounterControls: true },
      loading: false,
    });
    const propagate = vi
      .spyOn(sharedRoomService, 'propagateToRooms')
      .mockResolvedValue(0);
    await renderSession();

    for (let i = 0; i < 3; i++) await tap();
    await waitForDom(() => container!.querySelector('[role="status"]') !== null);
    expect(propagate).toHaveBeenCalledWith('SubhanAllah', 3);

    // The round is on the books exactly once, and the saved state shows.
    expect(await db.sessions.count()).toBe(1);
    const saved = (await db.sessions.toArray())[0];
    expect(saved.count).toBe(3);
    expect(buttonByText('Undo')).not.toBeNull();

    // Undo: session deleted, the round comes off the books AND off the
    // board — the counter returns to a fresh round (nothing re-saves).
    buttonByText('Undo')!.click();
    await waitForDom(() => container!.querySelector('[role="status"]') === null);
    await waitForDom(() => !container!.textContent!.includes('Target reached — saved!'));
    expect(await db.sessions.count()).toBe(0);
    expect(countDisplay()).toBe('0');
    expect(onCount).toHaveBeenLastCalledWith(0);
  });

  it('withholds Undo when the round propagated — plain copy, no Progress link', async () => {
    useSettingsStore.setState({
      settings: { advancedCounterControls: true },
      loading: false,
    });
    vi.spyOn(sharedRoomService, 'propagateToRooms').mockResolvedValue(1);
    await renderSession();

    for (let i = 0; i < 3; i++) await tap();
    await waitForDom(() => container!.querySelector('[role="status"]') !== null);

    const toast = container!.querySelector('[role="status"]')!;
    expect(toast.textContent).toContain('already shared with your group');
    expect(toast.textContent).not.toContain('Progress');
    expect(buttonByText('Undo')).toBeNull();
    // The round stays saved — nothing offered to retract it.
    expect(await db.sessions.count()).toBe(1);
  });
});
