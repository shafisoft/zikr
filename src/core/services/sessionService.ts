import { db } from '../db/db';
import { Session, SessionInput, SessionUpdate, BulkResult } from '../db/types';
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

export async function getLastCount(zikrId: number): Promise<number> {
  const lastCount = await db.zikrLastCount.get(zikrId);
  return lastCount?.count || 0;
}

export async function setLastCount(zikrId: number, count: number): Promise<void> {
  await db.zikrLastCount.put({
    zikrId,
    count,
    updatedAt: new Date()
  });
}

export async function addBulkSessions(sessions: SessionInput[], onProgress?: (progress: number) => void): Promise<BulkResult> {
  const results: BulkResult = {
    success: 0,
    failed: 0,
    errors: [],
    completed: false
  };

  // For progressive save, delegate to ProgressiveSaveService
  if (sessions.length >= 50) {
    const progressiveService = await import('./progressiveSaveService');
    return progressiveService.saveInChunks(sessions, onProgress);
  }

  // Validate all sessions first
  const validSessions: SessionInput[] = [];
  for (let i = 0; i < sessions.length; i++) {
    try {
      validateSessionInput(sessions[i]);
      validSessions.push(sessions[i]);
    } catch (error) {
      results.errors.push({
        index: i,
        session: sessions[i],
        error: error instanceof Error ? error.message : 'Validation failed'
      });
      results.failed++;
    }
  }

  // Save valid sessions in transaction
  try {
    // NEW (design review feedback): Wrap in transaction for data integrity
    await db.transaction('rw', db.sessions, db.zikrLastCount, db.streaks, db.plans, db.planOwners, async () => {
      for (const session of validSessions) {
        const timestamp = session.timestamp;
        await db.sessions.add({
          ...session,
          source: 'manual',
          date: timestamp,
          editableUntil: addDays(timestamp, 3),
          createdAt: new Date(),
          updatedAt: new Date()
        });

        // Update last count
        await setLastCount(session.zikrId, session.count);

        results.success++;
      }
    });

    // NEW (design review feedback): Optimize bulk integration updates (batch by zikrId)
    await batchUpdateGoalsAndStreaks(validSessions);

    results.completed = true;
  } catch (error) {
    results.errors.push({
      index: -1,
      session: sessions[0],
      error: error instanceof Error ? error.message : 'Transaction failed'
    });
  }

  return results;
}

// NEW (design review feedback): Batch updates for efficiency
async function batchUpdateGoalsAndStreaks(sessions: SessionInput[]): Promise<void> {
  // Group sessions by zikrId to reduce redundant calculations
  const sessionsByZikr = sessions.reduce((acc, session) => {
    if (!acc[session.zikrId]) acc[session.zikrId] = [];
    acc[session.zikrId].push(session);
    return acc;
  }, {} as Record<number, SessionInput[]>);

  // Update each zikr's goals/streaks once instead of per session
  for (const zikrId in sessionsByZikr) {
    const zikrSessions = sessionsByZikr[zikrId];
    // Use the most recent session date for updates
    const latestSession = zikrSessions.reduce((latest, current) =>
      current.timestamp > latest.timestamp ? current : latest
    );

    try {
      await updateStreak(Number(zikrId), latestSession.timestamp);
      await recalculatePlansForSession(
        { ...latestSession, source: 'manual', editableUntil: addDays(latestSession.timestamp, 3), createdAt: new Date(), updatedAt: new Date() } as Session,
        'add'
      );
    } catch (error) {
      console.error(`Failed to update goals/streaks for zikr ${zikrId}:`, error);
    }
  }
}

// Validation helper
function validateSessionInput(session: SessionInput): void {
  if (!session.zikrId || session.zikrId <= 0 || isNaN(session.zikrId)) {
    throw new Error('Invalid zikrId');
  }
  if (!session.count || session.count <= 0 || session.count > 10000 || isNaN(session.count)) {
    throw new Error('Count must be between 1 and 10000');
  }
  if (!session.timestamp || isNaN(session.timestamp.getTime())) {
    throw new Error('Invalid timestamp');
  }
}

// Helper function for date arithmetic
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
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
  isEditable,
  getLastCount,
  setLastCount,
  addBulkSessions
};

// Legacy exports for backward compatibility
export const addSession = add;
