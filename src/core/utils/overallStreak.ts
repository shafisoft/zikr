/**
 * Overall streak — the single source of truth for the "N Day Streak" number
 * shown on Home and Progress (R3 "Gentle restarts", docs/solution-design.md §3).
 *
 * A streak is consecutive calendar days with at least one session (any zikr).
 *
 * The rule is "never miss twice" (§6.2):
 * - R3.0 (retained): a day with no session yet today does not break anything;
 *   the streak anchors from yesterday.
 * - R3.1 (forgiveness): exactly ONE missed day at a gap is skipped when the
 *   day before the gap has a session — at the trailing edge the streak is
 *   "held" in a grace state, and interior single gaps were forgiven at their
 *   own trailing edge when they happened (P−P → 2, PP−P−P → 4).
 * - R3.2 (break): a SECOND consecutive missed day ends the streak — the walk
 *   stops, the value is 0, framed as a fresh start (never guilt copy).
 *
 * Everything here is strictly derived from history — nothing is persisted —
 * so deletes, restores, and backdated logs re-derive identically (AC3.4.3).
 * Routine streaks (R2) reuse the same `streakStatus` with their own `hasDay`
 * predicate (AC3.4.2) — the derivation is not hardcoded to any zikr set.
 */

import { formatDate, getToday } from './dateUtils';

export type StreakMode = 'normal' | 'grace' | 'fresh-break';

export interface StreakStatus {
  value: number;
  mode: StreakMode;
}

/**
 * How far back the "prior history" probe looks when the walk stopped at a
 * double gap. A streak that died more than a year ago is ancient history:
 * the user keeps today's behavior (nothing shown), per AC3.1.3.
 */
const PRIOR_HISTORY_LOOKBACK_DAYS = 366;

function addDays(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + delta);
  return next;
}

/**
 * The one walk both surfaces (and routine streaks) use.
 *
 * `hasDay` answers "was there a session on this YYYY-MM-DD?" for whatever
 * day-set the caller cares about (global zikr history today, one routine's
 * done-days later). `today` must be a midnight-normalized date.
 */
export function streakStatus(
  hasDay: (dateStr: string) => boolean,
  today: Date
): StreakStatus {
  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(addDays(today, -1));
  const todayHas = hasDay(todayStr);
  const yesterdayHas = hasDay(yesterdayStr);

  // R3.0 anchor (unchanged): if today has no session yet, count from yesterday.
  const cursor = todayHas ? todayStr : yesterdayStr;

  let value = 0;
  let current = cursor;
  while (true) {
    if (hasDay(current)) {
      value++;
      current = formatDate(addDays(new Date(current + 'T00:00:00'), -1));
    } else {
      // Missing day: peek one further — a single gap with practice right
      // before it is skipped (R3.1); a second consecutive miss stops the
      // walk (R3.2). The same branch covers the trailing edge (skip reads
      // as grace) and interior gaps (each was forgiven at its own).
      const peek = formatDate(addDays(new Date(current + 'T00:00:00'), -1));
      if (!hasDay(peek)) break;
      current = peek;
    }
  }

  // Mode (§3.1): grace is the return day — today AND yesterday both without
  // a session while a held value survived the single-gap skip. The "log
  // yesterday?" prompt keys off this too, so it can never fire when
  // yesterday has a session (AC3.2.2). fresh-break is the honest zero after
  // the walk stopped at a double gap with prior history behind it (AC3.3.1).
  let mode: StreakMode = 'normal';
  if (!todayHas && !yesterdayHas && value >= 1) {
    mode = 'grace';
  } else if (value === 0 && hasPriorHistory(hasDay, today, 2)) {
    mode = 'fresh-break';
  }

  return { value, mode };
}

/** Bounded probe: any practiced day at least `skipDays` before `today`? */
function hasPriorHistory(
  hasDay: (dateStr: string) => boolean,
  today: Date,
  skipDays: number
): boolean {
  const start = addDays(today, -skipDays);
  for (let i = 0; i < PRIOR_HISTORY_LOOKBACK_DAYS; i++) {
    if (hasDay(formatDate(addDays(start, -i)))) return true;
  }
  return false;
}

/**
 * Pure prompt-visibility rule for the "Log yesterday?" repair prompt
 * (§16.5, AC3.2.2): framing-gated, grace-only, at most once per return
 * day — `dismissedFor` is the persisted dismissal date (settings KV
 * `gracePrompt`). When yesterday gains any session the mode stops being
 * `grace` and this self-resolves — derivation, no extra code.
 */
export function gracePromptVisible(options: {
  mode: StreakMode;
  framingEnabled: boolean;
  dismissedFor?: string;
  today: string;
}): boolean {
  const { mode, framingEnabled, dismissedFor, today } = options;
  return framingEnabled && mode === 'grace' && dismissedFor !== today;
}

/** Unique, normalized session dates (any order; duplicates allowed). */
export function calculateOverallStreak(sessionDates: Date[]): number {
  return streakStatusOf(sessionDates).value;
}

/** Full streak status (value + mode) over raw session dates. */
export function streakStatusOf(sessionDates: Date[]): StreakStatus {
  const daySet = new Set(sessionDates.map(d => formatDate(d)));
  if (daySet.size === 0) return { value: 0, mode: 'normal' }; // AC3.1.3: no history
  return streakStatus(dateStr => daySet.has(dateStr), getToday());
}
