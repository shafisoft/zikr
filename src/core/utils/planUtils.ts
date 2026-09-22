/**
 * Plans — pure logic utilities (phase, targets, shared-plan progress,
 * timezone-aware recurring boundaries). No backend or DB imports so the
 * rules stay trivially testable.
 */

import { Plan, PlanPeriod, PlanZikr, Session, SharedRoom, Zikr } from '../db/types';
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

/** Display name for a plan: its title, else the covered zikrs' names. */
export function planDisplayName(plan: Pick<Plan, 'title' | 'zikrs'>): string {
  return plan.title?.trim() || plan.zikrs.map(z => z.name).join(' · ');
}

/**
 * The local zikr a plan-zikr entry counts on. Personal plans bind by id;
 * group plans bind by exact name (members' libraries differ — duplicate
 * names are rejected at creation, so the match is unambiguous).
 */
export function matchLocalZikr(
  zikrs: Zikr[],
  zp: Pick<PlanZikr, 'name' | 'zikrId'>
): Zikr | undefined {
  if (zp.zikrId != null) return zikrs.find(z => z.id === zp.zikrId);
  return zikrs.find(z => z.name === zp.name);
}

/**
 * Mirror-field total for a group-plan zikr: lifetime total on one-time
 * plans, current-period total on recurring ones. Undefined entry → 0.
 */
export function sharedZikrTotal(
  zp: Pick<PlanZikr, 'total' | 'periodTotal'> | undefined,
  recurring: boolean
): number {
  if (!zp) return 0;
  return recurring ? zp.periodTotal ?? 0 : zp.total ?? 0;
}

/**
 * The number a counter opened for this plan's zikr should aim at: the
 * zikr's per-zikr target, or the combined target. Undefined → the caller
 * falls back (the zikr's library default).
 */
export function planZikrTarget(plan: Plan, zikrId?: number): number | undefined {
  if (plan.mode === 'combined') return plan.target;
  const entry = zikrId != null ? plan.zikrs.find(z => z.zikrId === zikrId) : undefined;
  return entry?.target;
}

/** One step of a per-zikr plan's counter sequence. */
export interface PlanStep {
  target?: number;
  zikr: Zikr;
}

/**
 * A per-zikr plan's countable zikr sequence, in plan order — only zikrs
 * with a local record, since a plan row without one cannot be counted.
 * Combined plans do not sequence: they count every zikr toward one number.
 */
export function planSequence(plan: Plan | undefined, zikrs: Zikr[]): PlanStep[] {
  if (!plan || plan.mode !== 'per-zikr') return [];
  const steps: PlanStep[] = [];
  for (const zp of plan.zikrs) {
    const zikr = matchLocalZikr(zikrs, zp);
    if (zikr?.id != null) steps.push({ target: zp.target, zikr });
  }
  return steps;
}

/** One countable row for "your goals"-style surfaces. */
export interface GoalZikrRow {
  key: string;
  zikrId: number;
  title: string;
  /** Group name, for group targets. */
  subtitle?: string;
  current: number;
  target: number;
  /** Personal plan id — lets the counter continue through the plan's zikrs. */
  planId?: string;
}

/** Structural slice of the personal-plan progress the plan store exposes. */
interface PersonalPlanProgressLike {
  currentCount: number;
  perZikr: ReadonlyArray<{
    name: string;
    zikrId?: number;
    currentCount: number;
    target: number;
  }>;
}

/**
 * The "Your Goals" rows: every zikr the user's countable plans cover —
 * personal plans first, then group targets — each with its live progress.
 * Personal rows require status 'active' (paused/completed plans are not
 * something to count toward; getPlanPhase alone only reads the window).
 * Group rows additionally require an active room: propagation skips
 * closed rooms, so their rows must not offer counting either. Group rows
 * need a local zikr sharing the plan zikr's name — that match is also
 * what lets a count from here propagate to the group.
 */
export function buildGoalRows(input: {
  personalPlans: Plan[];
  groupPlans: Plan[];
  rooms: ReadonlyArray<Pick<SharedRoom, 'code' | 'title' | 'status'>>;
  zikrs: Zikr[];
  sessions: Session[];
  progressOf: (plan: Plan, sessions: Session[]) => PersonalPlanProgressLike;
  now?: Date;
}): GoalZikrRow[] {
  const { personalPlans, groupPlans, rooms, zikrs, sessions, progressOf } = input;
  const now = input.now ?? new Date();
  const rows: GoalZikrRow[] = [];

  for (const plan of personalPlans) {
    if (plan.status !== 'active' || getPlanPhase(plan, now) !== 'active') continue;
    const progress = progressOf(plan, sessions);
    if (plan.mode === 'per-zikr') {
      for (const pz of progress.perZikr) {
        const zikr = pz.zikrId != null ? zikrs.find(z => z.id === pz.zikrId) : undefined;
        if (zikr?.id == null || pz.target <= 0) continue;
        rows.push({
          key: `p:${plan.id}:${zikr.id}`,
          zikrId: zikr.id,
          title: pz.name,
          current: pz.currentCount,
          target: pz.target,
          planId: plan.id,
        });
      }
    } else {
      const target = plan.target ?? 0;
      if (target <= 0) continue;
      const first = plan.zikrs.find(z => z.zikrId != null);
      const zikr = first ? matchLocalZikr(zikrs, first) : undefined;
      if (zikr?.id == null) continue;
      rows.push({
        key: `p:${plan.id}`,
        zikrId: zikr.id,
        title: planDisplayName(plan),
        current: progress.currentCount,
        target,
        planId: plan.id,
      });
    }
  }

  for (const plan of groupPlans) {
    if (getPlanPhase(plan, now) !== 'active') continue;
    const room = plan.roomCode ? rooms.find(r => r.code === plan.roomCode) : undefined;
    if (room?.status !== 'active') continue;
    if (plan.mode === 'per-zikr') {
      for (const zp of plan.zikrs) {
        const zikr = matchLocalZikr(zikrs, zp);
        const target = zp.target ?? 0;
        if (zikr?.id == null || target <= 0) continue;
        rows.push({
          key: `g:${plan.id}:${zp.name}`,
          zikrId: zikr.id,
          title: zp.name,
          subtitle: room.title,
          current: sharedZikrTotal(zp, plan.period !== 'one-time'),
          target,
        });
      }
    } else {
      const target = plan.target ?? 0;
      if (target <= 0) continue;
      const zikr = plan.zikrs
        .map(zp => matchLocalZikr(zikrs, zp))
        .find(z => z?.id != null);
      if (zikr?.id == null) continue;
      rows.push({
        key: `g:${plan.id}`,
        zikrId: zikr.id,
        title: planDisplayName(plan),
        subtitle: room.title,
        current: sharedPlanProgress(plan).combined,
        target,
      });
    }
  }

  return rows;
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
  const zTotal = (z: PlanZikr) => sharedZikrTotal(z, recurring);

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
