/**
 * GracePrompt — the one-tap "Log yesterday?" repair prompt for R3
 * (docs/solution-design.md §16.5). Presentational only: copy and callbacks
 * come from StreakStatusContainer. Non-blocking by contract (AC3.2.2) — it
 * renders beneath the badge and never covers or gates anything — and
 * keyboard-dismissible via Escape.
 */

import React, { useEffect } from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';

interface GracePromptProps {
  /** The grace resume line, announced with the prompt for screen readers. */
  resumeLine: string;
  onLog: () => void;
  onDismiss: () => void;
}

const GracePrompt: React.FC<GracePromptProps> = ({ resumeLine, onLog, onDismiss }) => {
  const { t } = useI18n();

  // Keyboard-dismissible (AC3.2.2 / §12): Escape is "not now".
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-label={`${resumeLine} ${t('grace.promptQuestion')}`}
      className="relative w-full max-w-sm mx-auto flex flex-col items-center gap-3 bg-surface-container-low border border-outline-variant/30 rounded-2xl px-5 py-4"
    >
      <p className="font-body-md text-body-md text-on-surface text-center">
        {t('grace.promptQuestion')}
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={onLog}
          className="bg-primary-container text-on-primary rounded-xl h-touch-target-min px-6 flex items-center justify-center gap-2 font-label-md text-label-md hover:opacity-90 active-scale-95 transition-all"
        >
          <MaterialIcon icon="edit_calendar" className="text-[20px]" />
          {t('grace.promptLog')}
        </button>
        <button
          onClick={onDismiss}
          className="h-touch-target-min px-4 rounded-xl font-label-md text-label-md text-on-surface-variant hover:bg-surface-variant/50 transition-colors"
        >
          {t('grace.promptDismiss')}
        </button>
      </div>
    </div>
  );
};

export default GracePrompt;
