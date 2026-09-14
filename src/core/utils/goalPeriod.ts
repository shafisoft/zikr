/**
 * Goal period calculation utilities
 */

export type GoalPeriod = 'daily' | 'weekly' | 'monthly' | 'custom';

export interface PeriodRange {
  start: Date;
  end: Date;
}

/**
 * Get the start date for a goal period
 */
export function getPeriodStart(period: GoalPeriod, baseDate: Date = new Date()): Date {
  const date = new Date(baseDate);

  switch (period) {
    case 'daily':
      // Start of day (midnight)
      date.setHours(0, 0, 0, 0);
      return date;

    case 'weekly':
      // Start of week (Monday)
      const day = date.getDay();
      const diff = (day + 6) % 7; // Calculate days since last Monday
      date.setDate(date.getDate() - diff);
      date.setHours(0, 0, 0, 0);
      return date;

    case 'monthly':
      // Start of month (1st day)
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date;

    default:
      return date;
  }
}

/**
 * Get the end date for a goal period
 */
export function getPeriodEnd(period: GoalPeriod, baseDate: Date = new Date()): Date {
  const date = new Date(baseDate);

  switch (period) {
    case 'daily':
      // End of day (23:59:59.999)
      date.setHours(23, 59, 59, 999);
      return date;

    case 'weekly':
      // End of week (Sunday)
      const day = date.getDay();
      const diff = (7 - day) % 7; // Calculate days until next Sunday
      date.setDate(date.getDate() + diff);
      date.setHours(23, 59, 59, 999);
      return date;

    case 'monthly':
      // End of month (last day)
      const month = date.getMonth();
      date.setMonth(month + 1);
      date.setDate(0);
      date.setHours(23, 59, 59, 999);
      return date;

    default:
      // For custom, return end of day
      date.setHours(23, 59, 59, 999);
      return date;
  }
}

/**
 * Get the date range for a goal period
 */
export function getPeriodRange(period: GoalPeriod, baseDate: Date = new Date()): PeriodRange {
  return {
    start: getPeriodStart(period, baseDate),
    end: getPeriodEnd(period, baseDate)
  };
}

/**
 * Check if a date is within a goal's period range
 */
export function isDateInPeriod(date: Date, period: GoalPeriod, baseDate: Date = new Date()): boolean {
  const range = getPeriodRange(period, baseDate);
  return date >= range.start && date <= range.end;
}

/**
 * Check if a goal period is complete
 */
export function isPeriodComplete(goal: { period: GoalPeriod; startDate?: Date; endDate?: Date }, currentDate: Date = new Date()): boolean {
  if (goal.period === 'custom' && goal.startDate && goal.endDate) {
    return currentDate > goal.endDate;
  }

  // For daily/weekly/monthly, period is never "complete" - they roll over
  return false;
}

/**
 * Format period for display
 */
export function formatPeriod(period: GoalPeriod, baseDate: Date = new Date()): string {
  const date = new Date(baseDate);

  switch (period) {
    case 'daily':
      return `Today (${date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })})`;

    case 'weekly':
      const weekStart = getPeriodStart('weekly', date);
      return `Week of ${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    case 'monthly':
      return `${date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`;

    case 'custom':
      return 'Custom';

    default:
      return '';
  }
}