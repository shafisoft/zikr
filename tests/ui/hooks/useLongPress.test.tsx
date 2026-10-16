// useLongPress gesture contract — the Group card's removal shortcut rides
// on four invariants:
//   1. a still pointer past `ms` fires exactly once and SWALLOWS the
//      trailing click (the card must not navigate after a removal ask);
//   2. an early release taps through (hold timer cancelled, click passes);
//   3. travel past the slop cancels (a scroll never triggers removal);
//   4. pointercancel cancels (the browser took the gesture for scrolling).
// Real timers with a short `ms` — fake timers proved brittle with React's
// scheduling in this repo (see counterFlow's hold tests).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import { useLongPress } from '../../../src/ui/hooks/useLongPress';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const HOLD_MS = 25;
const SETTLE = HOLD_MS + 60;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function pointer(type: string, x = 0, y = 0): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
}

function Host(props: { onLongPress: () => void; onTap: () => void }) {
  const { handlers } = useLongPress<HTMLButtonElement>({
    onLongPress: props.onLongPress,
    onClick: props.onTap,
    ms: HOLD_MS,
  });
  return React.createElement('button', { ...handlers }, 'card');
}

async function renderHost(onLongPress: () => void, onTap: () => void) {
  if (root) {
    root.unmount();
    root = null;
    container?.remove();
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(Host, { onLongPress, onTap }));
  await sleep(10);
}

function card(): HTMLButtonElement {
  const el = container?.querySelector('button');
  if (!el) throw new Error('card button not mounted');
  return el;
}

beforeEach(() => {
  container = null;
  root = null;
});

afterEach(() => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
});

describe('useLongPress', () => {
  it('fires after the hold and swallows the trailing click', async () => {
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    await renderHost(onLongPress, onTap);

    card().dispatchEvent(pointer('pointerdown'));
    await sleep(SETTLE);
    expect(onLongPress).toHaveBeenCalledTimes(1);

    // The gesture ends (pointerup) and the browser synthesizes a click —
    // the tap handler must NOT see it.
    card().dispatchEvent(pointer('pointerup'));
    card().dispatchEvent(pointer('click'));
    expect(onTap).not.toHaveBeenCalled();

    // ...and the swallow must not leak into the next gesture.
    card().dispatchEvent(pointer('pointerdown'));
    await sleep(5);
    card().dispatchEvent(pointer('pointerup'));
    card().dispatchEvent(pointer('click'));
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('releasing before the threshold taps through', async () => {
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    await renderHost(onLongPress, onTap);

    card().dispatchEvent(pointer('pointerdown'));
    await sleep(5);
    card().dispatchEvent(pointer('pointerup'));
    await sleep(SETTLE);
    card().dispatchEvent(pointer('click'));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('travel past the slop cancels the hold (scroll never fires it)', async () => {
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    await renderHost(onLongPress, onTap);

    card().dispatchEvent(pointer('pointerdown', 0, 0));
    card().dispatchEvent(pointer('pointermove', 0, 40));
    await sleep(SETTLE);
    card().dispatchEvent(pointer('pointerup'));
    card().dispatchEvent(pointer('click'));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('pointercancel cancels the hold', async () => {
    const onLongPress = vi.fn();
    const onTap = vi.fn();
    await renderHost(onLongPress, onTap);

    card().dispatchEvent(pointer('pointerdown'));
    card().dispatchEvent(pointer('pointercancel'));
    await sleep(SETTLE);
    card().dispatchEvent(pointer('click'));

    expect(onLongPress).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});
