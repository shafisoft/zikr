import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../src/core/db/db';
import {
  recordCount,
  checkpointProgress,
  clearCheckpoint,
} from '../../../src/core/services/countRecorder';

beforeEach(async () => {
  await Promise.all([
    db.sessions.clear(),
    db.streaks.clear(),
    db.plans.clear(),
    db.zikrLastCount.clear(),
  ]);
  vi.restoreAllMocks();
});

describe('countRecorder', () => {
  it('persists an app session with the 3-day edit window and given count', async () => {
    const before = Date.now();
    await recordCount({ zikrId: 1, zikrName: 'SubhanAllah', count: 33 });

    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(1);
    const s = sessions[0];
    expect(s.count).toBe(33);
    expect(s.source).toBe('app');
    expect(s.zikrId).toBe(1);
    const windowMs = s.editableUntil.getTime() - before;
    expect(windowMs).toBeGreaterThanOrEqual(3 * 24 * 60 * 60 * 1000 - 1000);
    expect(windowMs).toBeLessThanOrEqual(3 * 24 * 60 * 60 * 1000 + 60_000);
  });

  it('defaults countsToGoals to true', async () => {
    await recordCount({ zikrId: 1, count: 5 });
    expect((await db.sessions.toArray())[0].countsToGoals).toBe(true);
  });

  it('respects the countsToGoals resolver when it returns false', async () => {
    await recordCount({ zikrId: 1, count: 5, countsToGoalsResolver: () => false });
    expect((await db.sessions.toArray())[0].countsToGoals).toBe(false);
  });

  it('does not throw when room propagation fails (best-effort by design)', async () => {
    // zikrName triggers propagation; the recorder swallows its failures.
    await expect(
      recordCount({ zikrId: 1, zikrName: 'SubhanAllah', count: 3 })
    ).resolves.toBeDefined();
    // The session itself still landed.
    expect(await db.sessions.count()).toBe(1);
  });
});

describe('progress checkpoints', () => {
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  it('auto-saves an in-progress count after the debounce window', async () => {
    await checkpointProgress({ zikrId: 9, count: 40 });
    // Debounced: nothing written yet.
    expect(await db.zikrLastCount.get(9)).toBeUndefined();
    await wait(1100);
    expect(await db.zikrLastCount.get(9)).toMatchObject({ zikrId: 9, count: 40 });
  });

  it('collapses a burst of taps into a single write', async () => {
    await checkpointProgress({ zikrId: 9, count: 5 });
    await checkpointProgress({ zikrId: 9, count: 6 });
    await checkpointProgress({ zikrId: 9, count: 7 });
    await wait(1100);
    expect(await db.zikrLastCount.get(9)).toMatchObject({ count: 7 });
  });

  it('clears immediately on zero so a killed app cannot resurrect a reset', async () => {
    await db.zikrLastCount.put({ zikrId: 9, count: 40, updatedAt: new Date() });
    await checkpointProgress({ zikrId: 9, count: 0 });
    expect(await db.zikrLastCount.get(9)).toBeUndefined();
  });

  it('clearCheckpoint cancels a pending write and removes the row', async () => {
    await checkpointProgress({ zikrId: 9, count: 12 });
    await clearCheckpoint(9);
    await wait(1100);
    expect(await db.zikrLastCount.get(9)).toBeUndefined();
  });
});
