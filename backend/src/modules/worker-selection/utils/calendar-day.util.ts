/**
 * backend/src/modules/worker-selection/utils/calendar-day.util.ts
 *
 * Calendar-day formatting and equality utilities for strict same-day assignment enforcement.
 */

/**
 * Returns a standardized YYYY-MM-DD calendar day string for a given Date or ISO date string.
 */
export function toCalendarDayString(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid date provided for calendar day calculation: ${dateInput}`);
  }

  // Use ISO date format slice (YYYY-MM-DD)
  return d.toISOString().slice(0, 10);
}

/**
 * Checks whether two dates fall on the exact same calendar day.
 */
export function isSameCalendarDay(date1: Date | string, date2: Date | string): boolean {
  try {
    return toCalendarDayString(date1) === toCalendarDayString(date2);
  } catch {
    return false;
  }
}
