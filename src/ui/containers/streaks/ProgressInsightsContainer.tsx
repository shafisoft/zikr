/**
 * ProgressInsightsContainer — the Progress page's two quiet insights
 * (Noor 2.0 phase 3): the hour of day the user counts the most dhikr in,
 * and their most-practiced zikr. Both derive purely (metrics utils)
 * memoized off the stores; the grid renders nothing until there is
 * history to read.
 */

import React, { useMemo } from 'react';
import MaterialIcon from '../../components/MaterialIcon';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { useZikrStore } from '../../../core/stores/zikrStore';
import { useI18n } from '../../../core/i18n';
import { bestPracticeHour, topZikr } from '../../../core/utils/metrics';
import { getZikrDisplayInfoFromZikr } from '../../utils/zikrMapping';

/** Locale-aware "5 AM – 6 AM" style label for a one-hour bucket. */
function hourRangeLabel(hour: number, lang: string): string {
  const fmt = new Intl.DateTimeFormat(lang === 'bn' ? 'bn' : 'en', { hour: 'numeric' });
  const at = (h: number) => fmt.format(new Date(2000, 0, 1, h));
  return `${at(hour)} – ${at((hour + 1) % 24)}`;
}

const ProgressInsightsContainer: React.FC = () => {
  const { lang, t } = useI18n();
  const sessions = useSessionStore(state => state.sessions);
  const zikrs = useZikrStore(state => state.zikrs);

  const hour = useMemo(() => bestPracticeHour(sessions), [sessions]);
  const top = useMemo(() => topZikr(sessions), [sessions]);

  if (!hour && !top) return null;

  // A zikr deleted since the sessions were counted has no display record —
  // the card then leads with the honest count instead of a name.
  const topZikrRecord = top ? zikrs.find(z => z.id === top.zikrId) : undefined;
  const topName = topZikrRecord
    ? getZikrDisplayInfoFromZikr(topZikrRecord, lang).localizedName
    : null;

  return (
    <div className="grid grid-cols-2 gap-4">
      {hour && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-5 text-center">
          <MaterialIcon icon="schedule" className="text-tertiary mb-1.5 text-[20px]" />
          <p className="font-label-md text-label-md text-on-surface tabular-nums">
            {hourRangeLabel(hour.hour, lang)}
          </p>
          <p className="font-caption text-caption text-on-surface-variant mt-0.5">
            {t('progress.insight.bestHour')}
          </p>
        </div>
      )}
      {top && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-5 text-center">
          <MaterialIcon icon="auto_awesome_motion" className="text-tertiary mb-1.5 text-[20px]" />
          <p className="font-label-md text-label-md text-on-surface truncate max-w-full tabular-nums">
            {topName ?? top.count.toLocaleString()}
          </p>
          <p className="font-caption text-caption text-on-surface-variant mt-0.5">
            {t('progress.insight.topZikr')}
            {topName && (
              <> · <span className="tabular-nums">{top.count.toLocaleString()}</span></>
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProgressInsightsContainer;
