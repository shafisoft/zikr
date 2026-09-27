/**
 * FlowDoneCard — the calm completion state of a guided flow (AC1.3.6 /
 * AC2.3.3): a quiet line and one way out. Presentational only — the set
 * line arrives as a prop from CounterFlowContainer, i18n at render.
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import OrnamentDivider from '../decor/OrnamentDivider';
import { useI18n } from '../../../core/i18n';

interface FlowDoneCardProps {
  /** The completion line (or the gentle missing-item note). */
  setLine: string;
  onDone: () => void;
}

const FlowDoneCard: React.FC<FlowDoneCardProps> = ({ setLine, onDone }) => {
  const { t } = useI18n();

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-5 z-10 px-8">
      <MaterialIcon icon="task_alt" className="text-5xl text-tertiary" />
      <OrnamentDivider className="w-40" />
      <p className="font-body-lg text-body-lg text-on-surface" aria-live="polite">
        {setLine}
      </p>
      <button
        onClick={onDone}
        className="w-full max-w-xs h-touch-target-min bg-primary-container text-on-primary rounded-xl font-label-md text-label-md flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-sm"
      >
        <MaterialIcon icon="home" className="text-[18px]" />
        {t('counter.done')}
      </button>
    </div>
  );
};

export default FlowDoneCard;
