// CounterCircle pointer semantics (remediation 1.2a): with the take-back
// gesture armed, a tap counts on RELEASE and a held press decrements once;
// without the prop the circle counts on pointerdown exactly as before.
import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import CounterCircle from '../../../src/ui/components/CounterCircle';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/** Just past the 450ms hold threshold. */
const HOLD_MS = 520;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

interface RenderProps {
  count?: number;
  target?: number;
  onDecrement?: () => void;
}

function renderCircle(props: RenderProps = {}) {
  const onIncrement = vi.fn();
  const onDecrement = vi.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(CounterCircle, {
      count: props.count ?? 0,
      target: props.target ?? 33,
      onIncrement,
      onDecrement: props.onDecrement,
      hapticsEnabled: false,
    })
  );
  // Flush React 18's concurrent rendering before querying the DOM.
  return { onIncrement, onDecrement, ready: sleep(0) };
}

function circleButton(): HTMLElement {
  return container!.querySelector('button')!;
}

function pointer(type: string, pointerId = 1) {
  circleButton().dispatchEvent(
    new window.PointerEvent(type, { bubbles: true, pointerId, button: 0 })
  );
}

afterEach(async () => {
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('CounterCircle', () => {
  it('counts on pointerdown when the take-back gesture is not armed', async () => {
    const { onIncrement, onDecrement, ready } = renderCircle();
    await ready;
    pointer('pointerdown');
    expect(onIncrement).toHaveBeenCalledTimes(1);
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it('counts a quick tap once on release with the gesture armed', async () => {
    const { onIncrement, onDecrement, ready } = renderCircle({ onDecrement: () => {} });
    await ready;
    pointer('pointerdown');
    expect(onIncrement).not.toHaveBeenCalled(); // committed on release, not press
    pointer('pointerup');
    expect(onIncrement).toHaveBeenCalledTimes(1);
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it('a held press takes one back instead of counting', async () => {
    const onDecrement = vi.fn();
    const { onIncrement, ready } = renderCircle({ onDecrement });
    await ready;
    pointer('pointerdown');
    await sleep(HOLD_MS);
    expect(onDecrement).toHaveBeenCalledTimes(1);
    expect(onIncrement).not.toHaveBeenCalled();
    // Releasing after the hold never counts as a tap too.
    pointer('pointerup');
    expect(onIncrement).not.toHaveBeenCalled();
    expect(onDecrement).toHaveBeenCalledTimes(1);
  });

  it('a cancelled press commits nothing', async () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();
    const { ready } = renderCircle({ onDecrement });
    await ready;
    pointer('pointerdown');
    pointer('pointercancel');
    await sleep(HOLD_MS);
    expect(onIncrement).not.toHaveBeenCalled();
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it('extra fingers of one gesture never count separately', async () => {
    const { onIncrement, ready } = renderCircle({ onDecrement: () => {} });
    await ready;
    pointer('pointerdown', 1); // gesture start
    pointer('pointerdown', 2); // same gesture, second contact
    pointer('pointerup', 2); // not the gesture starter — ignored
    expect(onIncrement).not.toHaveBeenCalled();
    pointer('pointerup', 1); // the starter's release counts the tap once
    expect(onIncrement).toHaveBeenCalledTimes(1);
  });
});
