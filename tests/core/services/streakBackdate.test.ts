// DB-backed tests for the backdated-entry rule in streakService: a session
// older than the streak's last processed day must trigger a full
// recalculation, never the incremental fold (which would rewind the stored
// day and let the NEXT session zero a real streak).
import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';

import { db } from '../../../src/core/db/db';
import { getStreak, updateStreak } from '../../../src/core/services/streakService';

const ZIKR = 1;
const day = (n: number) => new Date(2026, 5, n, 10, 0, 0); // June n 2026

async function seedSession(n: number): Promise<void> {
  await db.sessions.add({
    zikrId: ZIKR,
    count: 1,
    source: 'manual',
    timestamp: day(n),
    date: day(n),
    editableUntil: day(30),
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('updateStreak with backdated sessions', () => {
  beforeEach(async () => {
    await Promise.all(db.tables.map(t => t.clear()));
  });

  it('recalculates instead of rewinding when the entry predates the streak', async () => {
    for (const n of [6, 7, 8, 9, 10]) await seedSession(n);
    // Fold a 4-day streak up to day 10 (first session resets from epoch).
    for (const n of [6, 7, 8, 9, 10]) await updateStreak(ZIKR, day(n));

    // Backdated practice for day 5: the recorder stores the session, then
    // updates the streak (the session must exist for the rebuild to see it).
    await seedSession(5);
    await updateStreak(ZIKR, day(5));

    const streak = await getStreak(ZIKR);
    // The fold must not have rewound lastProcessedDate to day 5; the
    // recalculation sees six consecutive days (5..10) ending at day 10.
    expect(streak?.currentStreak).toBe(6);
    expect(streak?.lastProcessedDate.getDate()).toBe(10);
  });

  it('the streak keeps growing after a backdated entry (no zeroing)', async () => {
    for (const n of [6, 7, 8, 9, 10]) await seedSession(n);
    for (const n of [6, 7, 8, 9, 10]) await updateStreak(ZIKR, day(n));

    await seedSession(5);
    await updateStreak(ZIKR, day(5)); // backdated
    const streak = await updateStreak(ZIKR, day(11)); // next day's practice

    // Without the guard, the rewind to day 5 makes day 11 read as a 6-day
    // gap and zeros the streak; with it, the run simply extends to 7.
    expect(streak.currentStreak).toBe(7);
    expect(streak.longestStreak).toBe(7);
  });
});
