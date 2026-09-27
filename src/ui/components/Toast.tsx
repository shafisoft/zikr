/**
 * Toast — a transient, non-blocking message with an optional single action.
 * Purely presentational: strings and callbacks come in as props, no store
 * subscriptions. The counter uses it for the gated "Round saved — Undo"
 * toast (remediation 1.2c); counting never pauses while it shows.
 */

import React, { useEffect } from 'react';
import MaterialIcon from './MaterialIcon';

interface ToastProps {
  message: string;
  /** Present → renders one action button (e.g. Undo). */
  actionLabel?: string;
  onAction?: () => void;
  /** Accessible label for the dismiss (×) button. */
  dismissLabel: string;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms; 0 keeps the toast until dismissed. */
  durationMs?: number;
}

const Toast: React.FC<ToastProps> = ({
  message,
  actionLabel,
  onAction,
  dismissLabel,
  onDismiss,
  durationMs = 6000,
}) => {
  useEffect(() => {
    if (durationMs <= 0) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
    // onDismiss may change identity every render; the timer must follow the
    // toast instance's lifetime, not the callback's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="status"
      className="
        fixed bottom-24 left-1/2 -translate-x-1/2 z-50
        w-[calc(100%-2rem)] max-w-sm
        bg-surface-container-high border border-outline-variant/30 rounded-xl shadow-lg
        px-4 py-3 flex items-center gap-3
      "
    >
      <MaterialIcon icon="check_circle" filled className="text-[20px] text-tertiary shrink-0" />
      <p className="flex-1 min-w-0 font-body-sm text-body-sm text-on-surface">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="shrink-0 px-3 h-9 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md hover:opacity-90 active:scale-95 transition-all"
        >
          {actionLabel}
        </button>
      )}
      <button
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="shrink-0 p-1.5 -mr-1 rounded-lg text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
      >
        <MaterialIcon icon="close" className="text-[18px]" />
      </button>
    </div>
  );
};

export default Toast;
