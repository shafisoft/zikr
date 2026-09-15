import { db } from '../db/db';
import { SessionInput, BulkResult, Session } from '../db/types';
import { updateStreak } from './streakService';
import { recalculatePlansForSession } from './planService';

const CHUNK_SIZE = 10;

/**
 * Progressive Save Service
 * Handles chunked save for large batches with state preservation
 */

export async function saveInChunks(
  sessions: SessionInput[],
  onProgress?: (progress: number) => void
): Promise<BulkResult> {
  const results: BulkResult = {
    success: 0,
    failed: 0,
    errors: [],
    completed: false
  };

  // Create state for resume capability
  const stateId = await db.sessionFormState.add({
    sessions,
    currentIndex: 0,
    createdAt: new Date(),
    totalSessions: sessions.length
  });
  results.stateId = Number(stateId);

  try {
    for (let i = 0; i < sessions.length; i += CHUNK_SIZE) {
      const chunk = sessions.slice(i, Math.min(i + CHUNK_SIZE, sessions.length));

      // Save chunk in transaction
      await db.transaction('rw', db.sessions, db.sessionFormState, db.zikrLastCount, async () => {
        let sessionIndex = i; // Track actual session index
        for (const session of chunk) {
          try {
            const timestamp = session.timestamp;
            await db.sessions.add({
              ...session,
              source: 'manual',
              date: timestamp,
              editableUntil: addDays(timestamp, 3),
              createdAt: new Date(),
              updatedAt: new Date()
            });

            await db.zikrLastCount.put({
              zikrId: session.zikrId,
              count: session.count,
              updatedAt: new Date()
            });

            results.success++;
          } catch (error) {
            results.failed++;
            results.errors.push({
              index: sessionIndex++, // Use actual session index
              session,
              error: error instanceof Error ? error.message : 'Save failed'
            });
          }
        }

        // Update state
        await db.sessionFormState.update(stateId, {
          currentIndex: i + chunk.length
        });
      });

      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 0));

      // Report progress
      if (onProgress) {
        const progress = Math.min(100, Math.round(((i + chunk.length) / sessions.length) * 100));
        onProgress(progress);
      }
    }

    // NEW (design review feedback): Optimize bulk integration updates (batch by zikrId)
    await batchUpdateGoalsAndStreaks(sessions);

    results.completed = true;

    // Clean up state
    await db.sessionFormState.delete(stateId);
    delete results.stateId;

  } catch (error) {
    console.error('Progressive save failed:', error);
    results.completed = false;
  }

  return results;
}

export async function resumeInterruptedSave(
  stateId: number,
  onProgress?: (progress: number) => void
): Promise<BulkResult> {
  const state = await db.sessionFormState.get(stateId);
  if (!state) {
    throw new Error('Save state not found');
  }

  // NEW (design review feedback): Start from currentIndex to prevent duplicates
  const remainingSessions = state.sessions.slice(state.currentIndex);
  const alreadySaved = state.currentIndex; // Track already saved count

  const results = await saveInChunks(remainingSessions, onProgress);

  // Update results with cumulative counts (not starting from 0)
  results.success += alreadySaved;

  return results;
}

export async function discardInterruptedSave(stateId: number): Promise<void> {
  await db.sessionFormState.delete(stateId);
}

export async function hasInterruptedSave(): Promise<number | null> {
  const states = await db.sessionFormState.toArray();
  return states.length > 0 ? states[0].id! : null;
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

// Helper function for date arithmetic
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export const progressiveSaveService = {
  saveInChunks,
  resumeInterruptedSave,
  discardInterruptedSave,
  hasInterruptedSave
};