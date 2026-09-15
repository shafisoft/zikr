/**
 * Plans — pure logic utilities (phase, targets, shared-plan progress,
 * timezone-aware recurring boundaries). No backend or DB imports so the
 * rules stay trivially testable.
 */

import { Plan, PlanPeriod, PlanZikr } from '../db/types';
import { formatTimeRemaining, progressPercent } from './sharedRoomUtils';

/** uuid for new plan rows (works without crypto.randomUUID). */
export function newPlanId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'plan-xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type PlanPhase = 'upcoming' | 'active' | 'ended';

/**
 * Which phase the plan is in relative to `now`. Personal statuses
 * (paused/completed) never gate the window — they only pause tracking.
 */
export function getPlanPhase(
  plan: Pick<Plan, 'status' | 'period' | 'startDate' | 'endDate'>,
  now: Date = new Date()
): PlanPhase {
  if (plan.status === 'ended') return 'ended';
  if (plan.period === 'one-time') {
    const start = plan.startDate ? new Date(plan.startDate) : null;
    const end = plan.endDate ? new Date(plan.endDate) : null;
    if (start && now < start) return 'upcoming';
    if (end && now > end) return 'ended';
  }
  return 'active';
}

/** Whether contributions can be made to the plan right now. */
export function canContribute(
  plan: Pick<Plan, 'status' | 'period' | 'startDate' | 'endDate'>,
  now: Date = new Date()
): boolean {
  return getPlanPhase(plan, now) === 'active';
}

/** The plan's total target: combined target, or the sum of per-zikr targets. */
export function planTargetTotal(plan: Pick<Plan, 'mode' | 'target' | 'zikrs'>): number {
  if (plan.mode === 'per-zikr') {
    return (plan.zikrs || []).reduce((sum, z) => sum + (z.target ?? 0), 0);
  }
  return plan.target ?? 0;
}

export interface SharedPlanProgress {
  percent: number;
  /** Target(s) reached in the current scope (window for one-time, period for recurring). */
  done: boolean;
  combined: number;
  target: number;
}

/**
 * Progress of a server-mirrored (group) plan from its mirror fields:
 * one-time plans read lifetime totals; recurring plans read the current
 * period's totals. Per-zikr mode completes when EVERY zikr hits its target.
 */
export function sharedPlanProgress(plan: Plan): SharedPlanProgress {
  const recurring = plan.period !== 'one-time';
  const zTotal = (z: PlanZikr) => (recurring ? z.periodTotal ?? 0 : z.total ?? 0);

  if (plan.mode === 'per-zikr') {
    const zikrs = plan.zikrs || [];
    const target = zikrs.reduce((sum, z) => sum + (z.target ?? 0), 0);
    const combined = zikrs.reduce((sum, z) => sum + zTotal(z), 0);
    const percent = zikrs.length
      ? Math.min(...zikrs.map((z) => progressPercent(zTotal(z), z.target ?? 0)))
      : 0;
    const done = zikrs.length > 0 && zikrs.every((z) => zTotal(z) >= (z.target ?? 0));
    return { percent, done, combined, target };
  }

  const combined = recurring ? plan.periodTotal ?? 0 : plan.total ?? 0;
  const target = plan.target ?? 0;
  return {
    percent: progressPercent(combined, target),
    done: target > 0 && combined >= target,
    combined,
    target,
  };
}

// ---------- Recurring boundaries in a plan's timezone ----------

/** Offset (ms) between UTC and `timeZone` at the given instant. */
function tzOffsetMs(instant: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second')
  );
  return asUTC - instant;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The START of the current period in the plan's timezone: today's midnight
 * (daily), this Monday midnight (weekly), or the 1st of the month
 * (monthly). Contributions at/after this instant belong to the current
 * period. Two-pass offset correction keeps DST edges honest.
 */
export function currentPeriodStart(
  period: Exclude<PlanPeriod, 'one-time'>,
  timeZone: string,
  now: Date = new Date()
): Date {
  const nowMs = now.getTime();
  const off = tzOffsetMs(nowMs, timeZone);

  // Wall-clock date in the plan's timezone, represented as a UTC timestamp.
  const wall = new Date(nowMs + off);
  let boundary = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());

  if (period === 'weekly') {
    const dow = new Date(boundary).getUTCDay(); // 0 = Sunday
    boundary -= ((dow + 6) % 7) * DAY_MS; // back to Monday
  } else if (period === 'monthly') {
    boundary = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), 1);
  }

  const guess = boundary - off;
  return new Date(boundary - tzOffsetMs(guess, timeZone));
}

/**
 * The next reset instant for a recurring plan: local midnight (daily),
 * next Monday midnight (weekly), or the 1st of next month (monthly) in the
 * plan's timezone.
 */
export function nextPeriodStart(
  period: Exclude<PlanPeriod, 'one-time'>,
  timeZone: string,
  now: Date = new Date()
): Date {
  const nowMs = now.getTime();
  const off = tzOffsetMs(nowMs, timeZone);

  // Wall-clock date in the plan's timezone, represented as a UTC timestamp.
  const wall = new Date(nowMs + off);
  let boundary = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());

  if (period === 'daily') {
    boundary += DAY_MS;
  } else if (period === 'weekly') {
    const dow = new Date(boundary).getUTCDay(); // 0 = Sunday
    const daysUntilMonday = dow === 1 ? 7 : (8 - dow) % 7;
    boundary += daysUntilMonday * DAY_MS;
  } else {
    boundary = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth() + 1, 1);
  }

  const guess = boundary - off;
  return new Date(boundary - tzOffsetMs(guess, timeZone));
}

/** Short human time until a recurring plan resets, e.g. "3d 4h". */
export function formatResetsIn(
  period: Exclude<PlanPeriod, 'one-time'>,
  timeZone: string,
  now: Date = new Date()
): string {
  return formatTimeRemaining(nextPeriodStart(period, timeZone, now), now);
}
