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
 * Home's daily ring: aggregate across ALL countable personal plans (only
 * looking at the first one showed 0% whenever the day's practice belonged
 * to another plan). Countable = active OR completed: a plan auto-flips to
 * 'completed' the moment its target is reached, and dropping it here would
 * reset the ring to 0% exactly when the user finishes — the goal counts
 * until the owner pauses it. Overlapping zikrs between plans are counted
 * once (Set) and — for per-zikr plans — demanded once: the same round
 * cannot fill two copies of a target, so a zikr listed by several plans
 * contributes its largest per-zikr target, not their sum. Combined plans
 * keep their whole-plan target (it has no per-zikr split to dedupe
 * against).
 */
export function planRingProgress(plans: Plan[], sessions: Session[]): PlanRing {
  const todayStr = formatDate(getToday());
  const todaySessions = sessions.filter(s => formatDate(s.date) === todayStr);
  const activePlans = plans.filter(
    p => p.status === 'active' || p.status === 'completed'
  );
  const coveredZikrIds = new Set(
    activePlans.flatMap(p => p.zikrs.map(z => z.zikrId).filter((id): id is number => id != null))
  );
  const todayCount = coveredZikrIds.size > 0
    ? todaySessions
        .filter(s => coveredZikrIds.has(s.zikrId) && s.countsToGoals !== false)
        .reduce((sum, s) => sum + s.count, 0)
    : 0;
  const perZikrDemand = new Map<number, number>();
  let target = 0;
  for (const p of activePlans) {
    if (p.mode === 'per-zikr') {
      for (const z of p.zikrs) {
        if (z.zikrId == null) continue;
        const demand = Math.max(perZikrDemand.get(z.zikrId) ?? 0, z.target ?? 0);
        const prev = perZikrDemand.get(z.zikrId) ?? 0;
        if (demand > prev) {
          target += demand - prev;
          perZikrDemand.set(z.zikrId, demand);
        }
      }
    } else {
      target += planTargetTotal(p);
    }
  }
  const percent =
    target > 0 && todayCount > 0
      ? Math.min(Math.round((todayCount / target) * 100), 100)
      : 0;
  return { percent, todayCount, target };
}

/**
 * Mean daily total across the `days` FULL days before `now` (today is
 * never averaged into its own rhythm — an in-progress day would drag the
 * comparison it is being judged against). Rounded. The UI hides the pace
 * line while this is 0: a rhythm needs history before it can compare.
 */
export function recentDailyAverage(
  sessions: Session[],
  days = 7,
  now: Date = new Date()
): number {
  let total = 0;
  for (let i = 1; i <= days; i++) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const dayStr = formatDate(day);
    total += sessions
      .filter(s => formatDate(s.date) === dayStr)
      .reduce((sum, s) => sum + s.count, 0);
  }
  return Math.round(total / days);
}

// ---------------------------------------------------------------
// Noor 2.0 phase 3 — quiet insights for the Progress mihrab.
// ---------------------------------------------------------------

export interface HourInsight {
  /** Hour of day 0–23 (device-local, from session timestamps). */
  hour: number;
  /** Total dhikr counted in that hour across all history. */
  count: number;
}

/**
 * The hour of day the user has counted the most dhikr in, across all
 * history. Null when there is nothing to read yet.
 */
export function bestPracticeHour(sessions: Session[]): HourInsight | null {
  const buckets = new Array<number>(24).fill(0);
  for (const s of sessions) {
    buckets[new Date(s.timestamp).getHours()] += s.count;
  }
  let best = -1;
  for (let h = 0; h < 24; h++) {
    if (buckets[h] > 0 && (best === -1 || buckets[h] > buckets[best])) best = h;
  }
  return best === -1 ? null : { hour: best, count: buckets[best] };
}

export interface ZikrInsight {
  zikrId: number;
  count: number;
}

/** The most-practiced zikr by lifetime count. Null with no sessions. */
export function topZikr(sessions: Session[]): ZikrInsight | null {
  const totals = new Map<number, number>();
  for (const s of sessions) {
    totals.set(s.zikrId, (totals.get(s.zikrId) ?? 0) + s.count);
  }
  let bestId = -1;
  let bestCount = 0;
  totals.forEach((count, zikrId) => {
    if (count > bestCount) {
      bestCount = count;
      bestId = zikrId;
    }
  });
  return bestId === -1 ? null : { zikrId: bestId, count: bestCount };
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
