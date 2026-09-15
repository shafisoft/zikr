/**
 * Derived metrics — one pure computation per number the UI shows.
 *
 * Home and Progress render from these via useMemo (no useEffect+setState
 * round-trips), so both pages can never disagree again: same inputs, same
 * functions, same numbers.
 */

import { Session, Plan } from '../db/types';
import { formatDate, getToday } from './dateUtils';
import { planTargetTotal } from './planUtils';

/** Total count of today's sessions (any zikr). */
export function todayTotal(sessions: Session[]): number {
  const todayStr = formatDate(getToday());
  return sessions
    .filter(s => formatDate(s.date) === todayStr)
    .reduce((sum, s) => sum + s.count, 0);
}

/** Lifetime total count. */
export function totalDhikr(sessions: Session[]): number {
  return sessions.reduce((sum, s) => sum + s.count, 0);
}

export interface PlanRing {
  percent: number;
  todayCount: number;
  target: number;
}

/**
 * Home's daily ring: aggregate across ALL active personal plans (only
 * looking at the first one showed 0% whenever the day's practice belonged
 * to another plan). Overlapping zikrs between plans are counted once (Set).
 */
export function planRingProgress(plans: Plan[], sessions: Session[]): PlanRing {
  const todayStr = formatDate(getToday());
  const todaySessions = sessions.filter(s => formatDate(s.date) === todayStr);
  const activePlans = plans.filter(p => p.status === 'active');
  const coveredZikrIds = new Set(
    activePlans.flatMap(p => p.zikrs.map(z => z.zikrId).filter((id): id is number => id != null))
  );
  const todayCount = coveredZikrIds.size > 0
    ? todaySessions
        .filter(s => coveredZikrIds.has(s.zikrId) && s.countsToGoals !== false)
        .reduce((sum, s) => sum + s.count, 0)
    : 0;
  const target = activePlans.reduce((sum, p) => sum + planTargetTotal(p), 0);
  const percent =
    target > 0 && todayCount > 0
      ? Math.min(Math.round((todayCount / target) * 100), 100)
      : 0;
  return { percent, todayCount, target };
}

export interface WeekPoint {
  /** Localized day label supplied by the caller (Monday-first). */
  day: string;
  /** Bar height 0–100, normalized to the week's busiest day. */
  value: number;
  isToday: boolean;
}

/**
 * Current week (Monday-first), one point per day, normalized to the
 * busiest day. Labels are a UI concern — pass them in.
 */
export function weeklyData(sessions: Session[], labels: readonly string[]): WeekPoint[] {
  const today = getToday();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  const data: WeekPoint[] = [];
  let maxValue = 0;
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    const dateStr = formatDate(date);
    const dayTotal = sessions
      .filter(s => formatDate(s.date) === dateStr)
      .reduce((sum, s) => sum + s.count, 0);
    if (dayTotal > maxValue) maxValue = dayTotal;
    data.push({ day: labels[i], value: dayTotal, isToday: dateStr === formatDate(today) });
  }
  return maxValue > 0
    ? data.map(d => ({ ...d, value: Math.round((d.value / maxValue) * 100) }))
    : data;
}
