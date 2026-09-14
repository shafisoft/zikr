import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../src/core/db/db';
import { recordCount } from '../../../src/core/services/countRecorder';

beforeEach(async () => {
  await Promise.all([db.sessions.clear(), db.streaks.clear(), db.goals.clear()]);
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
