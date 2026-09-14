import { db } from '../db/db';
import { Goal, Session } from '../db/types';
import { getPeriodStart, getPeriodEnd } from '../utils/goalPeriod';

export interface Progress {
  currentCount: number;
  target: number;
  percentage: number;
}

/** The zikrs a goal covers. Runtime-defensive against rows missing the field. */
export function getGoalZikrIds(goal: Goal): number[] {
  return Array.isArray(goal.zikrIds) ? goal.zikrIds : [];
}

export async function add(goal: Omit<Goal, 'id'>): Promise<number> {
  const id = await db.goals.add(goal);
  return typeof id === 'number' ? id : parseInt(id as string, 10);
}

export async function update(id: number, goal: Partial<Goal>): Promise<number> {
  return await db.goals.update(id, goal);
}

export async function updateStatus(goalId: number, status: 'active' | 'paused' | 'completed'): Promise<void> {
  await db.goals.update(goalId, { status });
}

export async function deleteGoal(id: number): Promise<void> {
  await db.goals.delete(id);
}

export async function getGoalById(id: number): Promise<Goal | undefined> {
  return await db.goals.get(id);
}

export async function getAllGoals(): Promise<Goal[]> {
  return await db.goals.toArray();
}

export function getGoalsByZikr(zikrId: number): Promise<Goal[]> {
  // In-memory filter: the goals table is small and covers goals whose
  // zikrIds array merely contains the zikr (multi-entry index not needed).
  return db.goals
    .toArray()
    .then(goals => goals.filter(goal => getGoalZikrIds(goal).includes(zikrId)));
}

export async function getActiveGoals(): Promise<Goal[]> {
  return await db.goals.where('status').equals('active').toArray();
}

export async function getCompletedGoals(): Promise<Goal[]> {
  return await db.goals.where('status').equals('completed').toArray();
}

export async function getPausedGoals(): Promise<Goal[]> {
  return await db.goals.where('status').equals('paused').toArray();
}

export function calculateProgress(goal: Goal, sessions: Session[]): Progress {
  const zikrIdSet = new Set(getGoalZikrIds(goal));

  const startDate = goal.period === 'custom' && goal.startDate
    ? new Date(goal.startDate)
    : getPeriodStart(goal.period as any);

  const endDate = goal.period === 'custom' && goal.endDate
    ? new Date(goal.endDate)
    : getPeriodEnd(goal.period as any);

  // Combined counts across every zikr the goal covers. Sessions saved while
  // the "count towards goals & groups" setting was off are excluded.
  const filteredSessions = sessions.filter(session => {
    const sessionDate = new Date(session.date);
    return (
      zikrIdSet.has(session.zikrId) &&
      sessionDate >= startDate &&
      sessionDate <= endDate &&
      session.countsToGoals !== false
    );
  });

  const currentCount = filteredSessions.reduce((sum, session) => sum + session.count, 0);
  const percentage = Math.min((currentCount / goal.target) * 100, 100);

  return {
    currentCount,
    target: goal.target,
    percentage
  };
}

export async function checkCompletion(zikrId: number): Promise<void> {
  const goals = await getGoalsByZikr(zikrId);

  for (const goal of goals) {
    if (goal.status !== 'active') continue;

    const allSessions = await db.sessions
      .where('zikrId')
      .anyOf(getGoalZikrIds(goal))
      .toArray();

    const progress = calculateProgress(goal, allSessions);

    if (progress.currentCount >= goal.target) {
      await update(goal.id!, {
        status: 'completed',
        completedAt: new Date()
      });

      // Could trigger celebration here
      console.log(`🎉 Goal reached for zikr ${zikrId}!`);
    }
  }
}

// Recalculate goal progress for session changes (add/update/delete).
// Supports advanced manual progress edits: completes goals when their target
// is reached and reactivates completed goals when an edit/delete drops progress
// back below target.
export async function recalculateGoalForSession(
  session: Session,
  _operation: 'add' | 'update' | 'delete',
  _oldValue?: Session
): Promise<void> {
  // Consider both active and completed goals for the session's zikr so we can
  // complete newly-reached goals and reactivate ones that fall behind.
  const goals = await getGoalsByZikr(session.zikrId);
  const affectedGoals = goals.filter(
    g => g.status === 'active' || g.status === 'completed'
  );

  for (const goal of affectedGoals) {
    const allSessions = await db.sessions
      .where('zikrId')
      .anyOf(getGoalZikrIds(goal))
      .toArray();

    const progress = calculateProgress(goal, allSessions);

    if (progress.currentCount >= goal.target && goal.status === 'active') {
      await update(goal.id!, { status: 'completed', completedAt: new Date() });
    } else if (progress.currentCount < goal.target && goal.status === 'completed') {
      // An edit or deletion dropped progress below target — reactivate the goal.
      await update(goal.id!, { status: 'active', completedAt: undefined });
    }
  }
}

// Service export
export const goalService = {
  add,
  update,
  updateStatus,
  delete: deleteGoal,
  getGoalById,
  getAllGoals,
  getGoalsByZikr,
  getActiveGoals,
  getCompletedGoals,
  getPausedGoals,
  calculateProgress,
  checkCompletion,
  recalculateGoalForSession,
  getGoalZikrIds
};
