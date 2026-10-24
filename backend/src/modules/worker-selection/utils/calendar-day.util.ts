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

/**
 * Checks whether an event date (and optional endTime) has already passed.
 * Returns true if:
 * 1. The event calendar day is before today (e.g. 2026-10-23 when today is 2026-10-24).
 * 2. The event calendar day is today, and the event endTime has already passed.
 * 3. The date object has a specific timestamp that is strictly in the past.
 */
export function isEventDatePassed(dateInput: Date | string | null | undefined, endTimeStr?: string): boolean {
  if (!dateInput) return false;
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return false;

  const now = new Date();

  // Compare calendar days in UTC / ISO
  let todayStr = '';
  let eventDayStr = '';
  try {
    todayStr = toCalendarDayString(now);
    eventDayStr = toCalendarDayString(d);
  } catch {
    return d.getTime() < now.getTime();
  }

  // If the event day is strictly in the past
  if (eventDayStr < todayStr) {
    return true;
  }

  // If the event day is strictly in the future
  if (eventDayStr > todayStr) {
    return false;
  }

  // If today is the event day:
  // If an end time string is specified, check against current time
  if (endTimeStr && typeof endTimeStr === 'string') {
    const match = endTimeStr.trim().match(/^(\d{1,2}):(\d{2})(\s?[APap][Mm])?$/);
    if (match) {
      let hours = parseInt(match[1], 10);
      const mins = parseInt(match[2], 10);
      const ampm = match[3]?.trim().toUpperCase();
      if (ampm === 'PM' && hours < 12) hours += 12;
      if (ampm === 'AM' && hours === 12) hours = 0;

      // Construct a boundary datetime for today using local time
      const eventEndLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, mins, 59, 999);
      if (now.getTime() > eventEndLocal.getTime()) {
        return true;
      }
    }
  }

  // If event date has explicit non-zero UTC hours/minutes and raw timestamp is in the past
  if (d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0) {
    if (d.getTime() < now.getTime()) {
      return true;
    }
  }

  return false;
}
