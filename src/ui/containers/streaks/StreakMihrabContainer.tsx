/**
 * StreakMihrabContainer — Progress's arch slot (Noor 2.0 phase 3): the
 * one place on the page that derives the streak story. Same canonical
 * derivations StreakStatusContainer feeds Home (streakStatusOf), plus the
 * day-by-day strip (practiceDayStates) and the lifetime total. Pure
 * utils memoized off the store; the page owns nothing data-shaped.
 */

import React, { useMemo } from 'react';
import StreakArch from '../../components/progress/StreakArch';
import { useSessionStore } from '../../../core/stores/sessionStore';
import {
  practiceDayStates,
  streakStatusOf,
} from '../../../core/utils/overallStreak';
import { totalDhikr as metricsTotalDhikr } from '../../../core/utils/metrics';

const StreakMihrabContainer: React.FC = () => {
  const sessions = useSessionStore(state => state.sessions);

  const streak = useMemo(() => streakStatusOf(sessions.map(s => s.date)), [sessions]);
  const days = useMemo(() => practiceDayStates(sessions.map(s => s.date), 30), [sessions]);
  const lifetimeTotal = useMemo(() => metricsTotalDhikr(sessions), [sessions]);

  return (
    <StreakArch
      streak={streak}
      days={days}
      lifetimeTotal={lifetimeTotal}
      showDots={sessions.length > 0}
    />
  );
};

export default StreakMihrabContainer;
