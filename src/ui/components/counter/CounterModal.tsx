/**
 * Counter Modal
 * Dialog wrapper around CounterSession so any screen can open the counter
 * in place (e.g. a shared room counting its own zikr) without navigating
 * to the full /counter route.
 */

import React, { useEffect } from 'react';
import MaterialIcon from '../MaterialIcon';
import CounterSession from './CounterSession';
import useHaptic from '../../hooks/useHaptic';
import { useSettingsStore } from '../../../core/stores/settingsStore';
import { Zikr } from '../../../core/db/types';

interface CounterModalProps {
  isOpen: boolean;
  /** Dismissed without finishing: ×, Escape, backdrop. */
  onClose: () => void;
  zikr: Zikr;
  /** Count already on the board when opening (e.g. the room's total). */
  startCount: number;
  /** Round target (e.g. the room's target). */
  target: number;
  /** Called on every count change with the displayed count. */
  onCount: (count: number) => void;
  /**
   * The user finished explicitly ("Done" / "Finish & Save") — carries the
   * count that was persisted. The modal closes when the caller sets
   * isOpen=false here (or in onClose).
   */
  onFinish: (savedCount: number) => void;
}

const CounterModal: React.FC<CounterModalProps> = ({ isOpen, onClose, zikr, startCount, target, onCount, onFinish }) => {
  const hapticsEnabled = useSettingsStore(state => state.settings.hapticsEnabled ?? true);
  const saveSetting = useSettingsStore(state => state.saveSetting);
  const { trigger: haptic } = useHaptic(hapticsEnabled);

  // Escape closes the dialog (the session's reset-on-Escape stays page-only).
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleToggleHaptics = () => {
    const newValue = !hapticsEnabled;
    void saveSetting('hapticsEnabled', newValue);
    if (newValue) haptic('light');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={zikr.name}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative bg-surface rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-headline-md text-headline-md text-primary font-bold truncate">
            {zikr.name}
          </h2>
          <div className="flex items-center shrink-0">
            <button
              onClick={handleToggleHaptics}
              aria-label="Toggle haptic feedback"
              className="text-primary hover:opacity-80 active:scale-95 transition-all w-touch-target-min h-touch-target-min flex items-center justify-center"
            >
              <MaterialIcon icon={hapticsEnabled ? 'vibration' : 'smartphone'} className="text-2xl" />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-on-surface-variant hover:opacity-80 active:scale-95 transition-all w-touch-target-min h-touch-target-min flex items-center justify-center"
            >
              <MaterialIcon icon="close" className="text-2xl" />
            </button>
          </div>
        </div>

        {/* Counting experience */}
        <CounterSession
          zikr={zikr}
          startCount={startCount}
          target={target}
          onCount={onCount}
          variant="modal"
          escapeResets={false}
          onFinish={onFinish}
        />
      </div>
    </div>
  );
};

export default CounterModal;
