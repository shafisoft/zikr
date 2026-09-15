/**
 * Plan Service — personal plans (user-owned) CRUD + progress computation.
 *
 * A Plan wraps 1..5 zikrs with targets; group plans are server mirrors and
 * are managed by the sharedRoom service — this file owns the user-owned
 * ('me') half: progress from local sessions, auto complete/reactivate on
 * session changes, and zikr-reference maintenance.
 */

import { db } from '../db/db';
import { Plan, PlanOwner, PlanStatus, PlanZikr, Session } from '../db/types';
import { getPeriodStart, getPeriodEnd } from '../utils/goalPeriod';
import { newPlanId } from '../utils/planUtils';

/** ownerId of the device user — personal plans are ('user', 'me') rows. */
export const LOCAL_USER = 'me';

export interface PlanZikrProgress {
  name: string;
  zikrId?: number;
  currentCount: number;
  target: number;
  percentage: number;
}

export interface PlanProgress {
  currentCount: number;
  target: number;
  percentage: number;
  /** Populated for per-zikr plans (each zikr against its own target). */
  perZikr: PlanZikrProgress[];
}

/** The zikrs a plan covers. Runtime-defensive against rows missing the field. */
export function getPlanZikrs(plan: Plan): PlanZikr[] {
  return Array.isArray(plan.zikrs) ? plan.zikrs : [];
}

/** Local zikr ids referenced by the plan (personal plans bind records). */
export function getPlanZikrIds(plan: Plan): number[] {
  return getPlanZikrs(plan)
    .map((z) => z.zikrId)
    .filter((id): id is number => id != null);
}

function planWindow(plan: Plan, now: Date): { start: Date; end: Date } {
  if (plan.period === 'one-time' && plan.startDate && plan.endDate) {
    return { start: new Date(plan.startDate), end: new Date(plan.endDate) };
  }
  // Recurring windows roll; a one-time plan missing dates falls back to
  // today (parity with the legacy 'custom' period without dates).
  const period = plan.period === 'one-time' ? 'custom' : plan.period;
  return { start: getPeriodStart(period, now), end: getPeriodEnd(period, now) };
}

/**
 * Progress of a personal plan over the given sessions, for its current
 * period (rolling for recurring plans; fixed window for one-time).
 * Sessions saved while "count towards goals & groups" was off are excluded.
 */
export function computePlanProgress(plan: Plan, sessions: Session[], now: Date = new Date()): PlanProgress {
  const { start, end } = planWindow(plan, now);
  const inWindow = (s: Session) => {
    const d = new Date(s.date);
    return d >= start && d <= end && s.countsToGoals !== false;
  };
  const countOf = (zikrId: number) =>
    sessions.filter((s) => s.zikrId === zikrId && inWindow(s)).reduce((sum, s) => sum + s.count, 0);

  if (plan.mode === 'per-zikr') {
    const perZikr: PlanZikrProgress[] = getPlanZikrs(plan).map((z) => {
      const target = z.target ?? 0;
      const currentCount = z.zikrId == null ? 0 : countOf(z.zikrId);
      return {
        name: z.name,
        zikrId: z.zikrId,
        currentCount,
        target,
        percentage: target > 0 ? Math.min((currentCount / target) * 100, 100) : 0,
      };
    });
    // The plan completes when EVERY zikr reaches its own target.
    const percentage = perZikr.length
      ? Math.min(...perZikr.map((p) => p.percentage))
      : 0;
    return {
      currentCount: perZikr.reduce((sum, p) => sum + p.currentCount, 0),
      target: perZikr.reduce((sum, p) => sum + p.target, 0),
      percentage,
      perZikr,
    };
  }

  // Combined: one target across every zikr the plan covers.
  const zikrIdSet = new Set(getPlanZikrIds(plan));
  const currentCount = sessions
    .filter((s) => zikrIdSet.has(s.zikrId) && inWindow(s))
    .reduce((sum, s) => sum + s.count, 0);
  const target = plan.target ?? 0;
  return {
    currentCount,
    target,
    percentage: target > 0 ? Math.min((currentCount / target) * 100, 100) : 0,
    perZikr: [],
  };
}

// ---------- CRUD (user-owned plans) ----------

export async function add(plan: Omit<Plan, 'id'>): Promise<string> {
  const id = newPlanId();
  const full: Plan = { ...plan, id };
  await db.transaction('rw', db.plans, db.planOwners, async () => {
    await db.plans.put(full);
    await db.planOwners.put({ planId: id, ownerKind: 'user', ownerId: LOCAL_USER } satisfies PlanOwner);
  });
  return id;
}

export async function update(id: string, patch: Partial<Plan>): Promise<number> {
  return await db.plans.update(id, patch);
}

export async function updateStatus(id: string, status: PlanStatus): Promise<void> {
  await db.plans.update(id, { status });
}

export async function deletePlan(id: string): Promise<void> {
  await db.transaction('rw', db.plans, db.planOwners, async () => {
    await db.plans.delete(id);
    await db.planOwners.where('planId').equals(id).delete();
  });
}

export async function getPlanById(id: string): Promise<Plan | undefined> {
  return await db.plans.get(id);
}

/** Every plan owned by this device's user (personal plans only). */
export async function getUserPlans(): Promise<Plan[]> {
  const [plans, owners] = await Promise.all([db.plans.toArray(), db.planOwners.toArray()]);
  const mine = new Set(
    owners.filter((o) => o.ownerKind === 'user' && o.ownerId === LOCAL_USER).map((o) => o.planId)
  );
  return plans.filter((p) => mine.has(p.id));
}

/** Personal plans that cover the zikr (any status — callers filter). */
export async function getPlansByZikr(zikrId: number): Promise<Plan[]> {
  const plans = await getUserPlans();
  return plans.filter((p) => getPlanZikrs(p).some((z) => z.zikrId === zikrId));
}

function planReachedTarget(plan: Plan, progress: PlanProgress): boolean {
  if (progress.target <= 0) return false;
  if (plan.mode === 'per-zikr') {
    return progress.perZikr.length > 0 && progress.perZikr.every((p) => p.target > 0 && p.currentCount >= p.target);
  }
  return progress.currentCount >= (plan.target ?? 0);
}

/**
 * Recalculate plan progress for session changes (add/update/delete).
 * Completes plans when their target is reached and reactivates completed
 * plans when an edit/delete drops progress back below target.
 */
export async function recalculatePlansForSession(
  session: Session,
  _operation: 'add' | 'update' | 'delete',
  _oldValue?: Session
): Promise<void> {
  // Consider both active and completed plans for the session's zikr so we can
  // complete newly-reached plans and reactivate ones that fall behind.
  const plans = await getPlansByZikr(session.zikrId);
  const affected = plans.filter((p) => p.status === 'active' || p.status === 'completed');

  for (const plan of affected) {
    const allSessions = await db.sessions
      .where('zikrId')
      .anyOf(getPlanZikrIds(plan))
      .toArray();

    const progress = computePlanProgress(plan, allSessions);

    if (planReachedTarget(plan, progress) && plan.status === 'active') {
      await update(plan.id, { status: 'completed', completedAt: new Date() });
    } else if (!planReachedTarget(plan, progress) && plan.status === 'completed') {
      // An edit or deletion dropped progress below target — reactivate.
      await update(plan.id, { status: 'active', completedAt: undefined });
    }
  }
}

// Service export
export const planService = {
  add,
  update,
  updateStatus,
  delete: deletePlan,
  getPlanById,
  getUserPlans,
  getPlansByZikr,
  computePlanProgress,
  recalculatePlansForSession,
  getPlanZikrs,
  getPlanZikrIds,
};
