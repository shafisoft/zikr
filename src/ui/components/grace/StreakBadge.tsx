/**
 * StreakBadge — presentational streak pill for the R3 "Gentle restarts"
 * framing (docs/solution-design.md §16.5). Props in, copy at render, zero
 * data access: the number, mode, and framing switch come from
 * StreakStatusContainer, the one place that derives them.
 *
 * - normal: today's plain badge (unchanged look).
 * - grace:  quieter pill holding the streak value, with a short resume line —
 *           the held number must never read as a false claim (AC3.1.1).
 * - fresh-break: honest 0 with fresh-start framing — never guilt copy
 *           (AC3.3.1). When `framingEnabled` is off, every mode renders as
 *           the plain badge; the NUMBER still follows the new walk (§3.2).
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';
import { StreakMode } from '../../../core/utils/overallStreak';

interface StreakBadgeProps {
  value: number;
  mode: StreakMode;
  framingEnabled: boolean;
}

const StreakBadge: React.FC<StreakBadgeProps> = ({ value, mode, framingEnabled }) => {
  const { t } = useI18n();

  const framed = framingEnabled && mode !== 'normal';

  if (mode === 'grace' && framed) {
    return (
      <div className="relative flex flex-col items-center gap-1.5">
        <div
          role="status"
          aria-label={t('grace.heldAria', { count: value })}
          className="inline-flex items-center gap-2 bg-surface-container-low text-on-surface-variant border border-outline-variant/30 px-4 py-1.5 rounded-full font-label-md text-label-md"
        >
          <MaterialIcon icon="bedtime" className="text-[20px]" />
          <span className="tabular-nums">{t('home.streak', { count: value })}</span>
        </div>
        <p className="font-caption text-caption text-on-surface-variant">
          {t('grace.resumeLine')}
        </p>
      </div>
    );
  }

  if (mode === 'fresh-break' && framed) {
    return (
      <div className="relative flex flex-col items-center gap-1.5">
        <div
          role="status"
          className="inline-flex items-center gap-2 bg-surface-container-low text-on-surface-variant border border-outline-variant/30 px-4 py-1.5 rounded-full font-label-md text-label-md"
        >
          <MaterialIcon icon="spa" className="text-[20px]" />
          <span className="tabular-nums">{t('home.streak', { count: value })}</span>
        </div>
        <p className="font-caption text-caption text-on-surface-variant">
          {t('grace.freshStart')}
        </p>
      </div>
    );
  }

  // Plain badge — current behavior. Whether a zero shows at all is the
  // container's render decision (AC3.1.3), never the badge's.
  return (
    <div className="relative inline-flex items-center gap-2 bg-tertiary-container/10 text-tertiary border border-tertiary-container/30 px-4 py-1.5 rounded-full font-label-md text-label-md">
      <MaterialIcon icon="local_fire_department" filled className="text-[20px]" />
      <span className="tabular-nums">{t('home.streak', { count: value })}</span>
    </div>
  );
};

export default StreakBadge;
