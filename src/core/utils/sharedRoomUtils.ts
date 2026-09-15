/**
 * Shared Goals (Rooms) — pure logic utilities.
 * No backend or DB imports so the rules are trivially testable.
 * See docs/SharedGoals-Design.md
 *
 * Plan-level phase/progress rules live in planUtils.ts (rooms are
 * persistent groups since v6 — only plans have windows).
 */

/** Code alphabet on the server: no 0/O/1/I/L (unambiguous when typed/read aloud). */
const CODE_REGEX = /^[A-HJ-KMNP-Z2-9]{6}$/;

export const MAX_DELTA = 10000;

/** Normalize user input into a canonical room code, or null if invalid. */
export function normalizeRoomCode(input: string): string | null {
  const normalized = (input || '').toUpperCase().replace(/[\s-]/g, '');
  return CODE_REGEX.test(normalized) ? normalized : null;
}

/** Validate a contribution delta (1..MAX_DELTA). */
export function isValidDelta(delta: number): boolean {
  return Number.isInteger(delta) && delta >= 1 && delta <= MAX_DELTA;
}

/** Combined progress 0..100 (capped — overshoot shows 100%). */
export function progressPercent(total: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(Math.round((Math.max(total, 0) / target) * 100), 100);
}

/** Short human time remaining, e.g. "3d 4h", "2h 15m", "45m", "<1m". */
export function formatTimeRemaining(endsAt: Date, now: Date = new Date()): string {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (ms <= 0) return 'ended';
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Exponential backoff for outbox retries: 30s, 1m, 2m, 4m … capped at 15m. */
export function backoffDelayMs(attempts: number): number {
  const base = 30_000;
  return Math.min(base * Math.pow(2, Math.max(attempts - 1, 0)), 15 * 60_000);
}

/**
 * Window presets for one-time plans. Boundaries are local-time midnights,
 * matching the app convention of normalizing dates to midnight (dateUtils).
 */
export function windowPreset(
  preset: 'today' | 'week',
  now: Date = new Date()
): { startsAt: Date; endsAt: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (preset === 'today') {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { startsAt: start, endsAt: end };
  }

  // This week: Monday 00:00 → next Monday 00:00
  const day = start.getDay(); // 0 = Sunday
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(start);
  monday.setDate(monday.getDate() - daysSinceMonday);
  const nextMonday = new Date(monday);
  nextMonday.setDate(nextMonday.getDate() + 7);
  return { startsAt: monday, endsAt: nextMonday };
}
