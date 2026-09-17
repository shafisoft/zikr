/**
 * ConfirmDialog — the design-system replacement for window.confirm/alert.
 * Promise-based so call sites keep their control flow:
 *
 *   const ok = await showConfirm({ message: t('plans.deleteConfirm'), danger: true });
 *   if (!ok) return;
 *
 * Callers that just need an acknowledgement (the old alert) omit the cancel
 * button: showConfirm({ message }) resolves true on OK. The host is mounted
 * once per screen by AppLayout; z-index sits above page modals (z-50).
 */

import React, { useEffect, useRef } from 'react';
import { create } from 'zustand';
import MaterialIcon from './MaterialIcon';
import { useI18n } from '../../core/i18n';

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  /** null hides the cancel side (alert style: a single OK button). */
  cancelLabel?: string | null;
  /** Destructive action styling for the confirm button. */
  danger?: boolean;
  icon?: string;
}

interface ConfirmDialogState {
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  show: (options: ConfirmOptions) => Promise<boolean>;
  settle: (value: boolean) => void;
}

export const useConfirmDialogStore = create<ConfirmDialogState>((set, get) => ({
  options: null,
  resolve: null,
  show: (options) =>
    new Promise<boolean>((resolve) => {
      // A dialog opened while another is pending cancels the old one —
      // its caller must not hang forever.
      get().settle(false);
      set({ options, resolve });
    }),
  settle: (value) => {
    const { resolve } = get();
    if (resolve) resolve(value);
    set({ options: null, resolve: null });
  },
}));

export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return useConfirmDialogStore.getState().show(options);
}

/** Acknowledgement dialog (the old alert): a single OK button. */
export function showAlert(options: Omit<ConfirmOptions, 'cancelLabel'>): Promise<boolean> {
  return useConfirmDialogStore.getState().show({ ...options, cancelLabel: null });
}

export const ConfirmDialogHost: React.FC = () => {
  const { t } = useI18n();
  const options = useConfirmDialogStore((s) => s.options);
  const settle = useConfirmDialogStore((s) => s.settle);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const open = options !== null;

  // If the host unmounts while a dialog is pending (e.g. a route change
  // away from AppLayout), resolve it as cancelled so awaiting callers don't
  // hang with their saving/error state stuck.
  useEffect(
    () => () => {
      useConfirmDialogStore.getState().settle(false);
    },
    []
  );

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') settle(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, settle]);

  if (!options) return null;

  const cancelLabel = options.cancelLabel === undefined ? t('common.cancel') : options.cancelLabel;
  const confirmLabel = options.confirmLabel ?? t('common.ok');
  const icon = options.icon ?? (options.danger ? 'warning' : 'info');

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={() => settle(false)}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-sm p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <MaterialIcon
            icon={icon}
            className={`text-[24px] mt-0.5 ${options.danger ? 'text-error' : 'text-tertiary'}`}
          />
          <div className="min-w-0">
            {options.title && (
              <h2 className="font-headline-md text-headline-md text-primary mb-1">
                {options.title}
              </h2>
            )}
            <p className="font-body-md text-body-md text-on-surface whitespace-pre-line">
              {options.message}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          {cancelLabel !== null && (
            <button
              onClick={() => settle(false)}
              className="h-touch-target-min px-5 rounded-xl border border-outline-variant/40 text-on-surface-variant font-label-md text-label-md hover:bg-surface-container transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmRef}
            onClick={() => settle(true)}
            className={`h-touch-target-min px-5 rounded-xl font-label-md text-label-md shadow-sm hover:opacity-90 active-scale-98 transition-all ${
              options.danger
                ? 'bg-error text-white'
                : 'bg-primary-container text-on-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialogHost;
