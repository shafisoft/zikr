import { db } from '../db/db';
import { Session, SessionUpdate } from '../db/types';
import { formatDate } from '../utils/dateUtils';
import { updateStreak } from './streakService';
import { recalculatePlansForSession } from './planService';

// === EXISTING (enhanced for v2) ===
export async function add(session: Omit<Session, 'id'>): Promise<number> {
  // NEW (design review feedback): Wrap in transaction for data integrity
  return await db.transaction('rw', db.sessions, db.streaks, db.plans, db.planOwners, async () => {
    const id = await db.sessions.add(session);

    // Automatically update streak and goals within same transaction
    await updateStreak(session.zikrId, session.date);
    await recalculatePlansForSession(session as Session, 'add');

    return typeof id === 'number' ? id : parseInt(id as string, 10);
  });
}

export async function getSessionById(id: number): Promise<Session | undefined> {
  return await db.sessions.get(id);
}

export async function getAllSessions(): Promise<Session[]> {
  return await db.sessions.toArray();
}

export async function getSessionsByZikr(zikrId: number): Promise<Session[]> {
  return await db.sessions.where('zikrId').equals(zikrId).toArray();
}

export async function getSessionsByDate(date: Date): Promise<Session[]> {
  const dateStr = formatDate(date);
  return await db.sessions.where('date').equals(dateStr).toArray();
}

export async function getSessionsByDateRange(startDate: Date, endDate: Date): Promise<Session[]> {
  const startDateStr = formatDate(startDate);
  const endDateStr = formatDate(endDate);
  return await db.sessions.where('date').between(startDateStr, endDateStr).toArray();
}

// === NEW (v2) CRUD operations ===
export async function updateSession(
  id: number,
  sessionUpdate: SessionUpdate
): Promise<number> {
  // NEW (design review feedback): Wrap in transaction for data integrity
  return await db.transaction('rw', db.sessions, db.streaks, db.plans, db.planOwners, async () => {
    const existing = await getSessionById(id);
    if (!existing) {
      throw new Error('Session not found');
    }

    if (!(await isEditable(id))) {
      throw new Error('Session is no longer editable (3-day window expired)');
    }

    const updated = await db.sessions.update(id, {
      ...sessionUpdate,
      updatedAt: new Date(),
      date: sessionUpdate.timestamp ? sessionUpdate.timestamp : existing.date  // Update denormalized date
    });

    // Recalculate goals and streaks within same transaction
    const updatedSession = { ...existing, ...sessionUpdate, updatedAt: new Date() } as Session;
    await updateStreak(updatedSession.zikrId, updatedSession.date);
    await recalculatePlansForSession(updatedSession, 'update', existing);

    return updated;
  });
}

export async function deleteSession(id: number): Promise<void> {
  // NEW (design review feedback): Wrap in transaction for data integrity
  return await db.transaction('rw', db.sessions, db.streaks, db.plans, db.planOwners, async () => {
    const existing = await getSessionById(id);
    if (!existing) {
      throw new Error('Session not found');
    }

    if (!(await isEditable(id))) {
      throw new Error('Session is no longer editable (3-day window expired)');
    }

    await db.sessions.delete(id);

    // Recalculate goals and streaks within same transaction
    await updateStreak(existing.zikrId, existing.date);
    await recalculatePlansForSession(existing, 'delete');
  });
}

export async function isEditable(sessionId: number | Session): Promise<boolean> {
  const session = typeof sessionId === 'number'
    ? await getSessionById(sessionId)
    : sessionId;

  if (!session) return false;

  const now = new Date();
  return now < session.editableUntil;
}

// Service export
export const sessionService = {
  add,
  updateSession,
  deleteSession,
  getSessionById,
  getAllSessions,
  getSessionsByZikr,
  getSessionsByDate,
  getSessionsByDateRange,
  isEditable
};

// Legacy exports for backward compatibility
export const addSession = add;
