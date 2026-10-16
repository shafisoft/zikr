/**
 * useLongPress — fire `onLongPress` when the pointer stays put for `ms`
 * (default 500), and swallow the click that trails the same gesture, so
 * one element can be both a plain tap and a long-press shortcut.
 *
 * Pointer events only — one event model for mouse/touch/pen (the
 * onTouchStart + onMouseDown pairing double-fired on mobile, see
 * CounterCircle). Travel past `slop` px cancels the hold: a scroll over
 * the card must never trigger it. When the hold fires, the browser's
 * long-press context menu is suppressed too — the gesture is ours.
 */

import { useCallback, useRef } from 'react';

interface UseLongPressOptions {
  /** Fired once when the hold passes `ms`. */
  onLongPress: () => void;
  /** Normal tap handler; skipped when this gesture was a long press. */
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Hold duration in ms. */
  ms?: number;
  /** Pointer travel (px) that turns the hold into a scroll and cancels it. */
  slop?: number;
}

export function useLongPress<T extends HTMLElement = HTMLElement>({
  onLongPress,
  onClick,
  ms = 500,
  slop = 10,
}: UseLongPressOptions) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  // True from the moment the hold fires until the next pointerdown — the
  // click trailing a long press must be swallowed even if it arrives late,
  // and a swallowed flag must never leak into the NEXT gesture.
  const fired = useRef(false);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<T>) => {
      if (e.button !== 0) return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      clearTimer();
      timer.current = setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onLongPress();
      }, ms);
    },
    [clearTimer, ms, onLongPress]
  );

  // Release / lost contact before the threshold: a plain tap is forming —
  // stop the hold, let the trailing click through. `fired` is untouched so
  // a click after a COMPLETED long press is still swallowed.
  const endHold = useCallback(() => {
    clearTimer();
    origin.current = null;
  }, [clearTimer]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<T>) => {
      const o = origin.current;
      if (timer.current === null || !o) return;
      const dx = e.clientX - o.x;
      const dy = e.clientY - o.y;
      if (dx * dx + dy * dy > slop * slop) endHold();
    },
    [endHold, slop]
  );

  const onClickHandler = useCallback(
    (e: React.MouseEvent<T>) => {
      if (fired.current) {
        fired.current = false;
        e.preventDefault();
        return;
      }
      onClick?.(e);
    },
    [onClick]
  );

  const onContextMenu = useCallback((e: React.MouseEvent<T>) => {
    // Touch long-press opens the browser menu; while this gesture just
    // fired, the menu would fight the action the user asked for.
    if (fired.current) e.preventDefault();
  }, []);

  return {
    handlers: {
      onPointerDown,
      onPointerUp: endHold,
      onPointerCancel: endHold,
      onPointerLeave: endHold,
      onPointerMove,
      onClick: onClickHandler,
      onContextMenu,
    },
  };
}

export default useLongPress;
