import { isValidTimeString, isValidDateString } from '../validation/attendance.validation.js';

export function getOperationalDateString(
  dateVal: string | Date | null | undefined,
  timeZone = 'Asia/Kolkata'
): string {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

/**
 * Constructs a canonical UTC Date representing an exact Asia/Kolkata (+05:30) wall-clock date and time.
 * Accepts:
 *  - dateVal: string (YYYY-MM-DD) or Date instance
 *  - timeStr24h: normalized 24-hour time string ("HH:mm")
 *
 * Example:
 *  constructKolkataDateTime('2026-11-14', '15:55') -> 2026-11-14T10:25:00.000Z
 *  constructKolkataDateTime('2026-11-15', '02:00') -> 2026-11-14T20:30:00.000Z
 */
export function constructKolkataDateTime(
  dateVal: string | Date,
  timeStr24h: string
): Date {
  let opDateStr: string;
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
    const check = isValidDateString(dateVal.trim());
    if (!check.valid) {
      throw new Error(`Invalid date format for Kolkata conversion: '${dateVal}' - ${check.error}`);
    }
    opDateStr = check.normalized!;
  } else {
    opDateStr = getOperationalDateString(dateVal, 'Asia/Kolkata');
  }

  if (!opDateStr) {
    throw new Error(`Unable to extract Asia/Kolkata operational date from: '${dateVal}'`);
  }

  const [hStr, mStr] = timeStr24h.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    throw new Error(`Invalid time format for Kolkata conversion: '${timeStr24h}'`);
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  const isoString = `${opDateStr}T${pad(h)}:${pad(m)}:00.000+05:30`;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    throw new Error(`Failed to construct valid Date from '${isoString}'`);
  }
  return d;
}

export interface EventCorrectionWindow {
  scheduledEventEndAt: Date;
  correctionDeadlineAt: Date;
  isBeforeEventEnd: boolean;
  isAfterDeadline: boolean;
  canNormalCorrect: boolean;
  eventOperationalDate: string;
  currentOperationalDate: string;
  isEventDay: boolean;
  isBeforeEventDay: boolean;
  isAfterEventDay: boolean;
}

/**
 * Calculates canonical scheduled event end time in Asia/Kolkata timezone and the 24-hour correction/concern deadline.
 *
 * Rules:
 * 1. event.date represents the calendar day in Asia/Kolkata.
 * 2. startTime and endTime are evaluated. If endTime <= startTime, it is treated as an overnight shift ending on the next calendar day.
 * 3. scheduledEventEndAt is constructed as an exact Date with Asia/Kolkata (+05:30) offset.
 * 4. correctionDeadlineAt = scheduledEventEndAt + 24 hours.
 * 5. canNormalCorrect = current time <= correctionDeadlineAt.
 */
export function calculateEventCorrectionWindow(
  event: { date: Date | string; startTime?: string; endTime?: string },
  now = new Date(),
  options?: { latestDepartureDate?: string }
): EventCorrectionWindow {
  const eventOperationalDate = getOperationalDateString(event.date, 'Asia/Kolkata');
  const currentOperationalDate = getOperationalDateString(now, 'Asia/Kolkata');

  // Normalize start time (default: 09:00)
  const startVal = isValidTimeString(event.startTime);
  const startStr = startVal.valid && startVal.normalized24h ? startVal.normalized24h : '09:00';
  const [sH, sM] = startStr.split(':').map(Number);
  const startMinutes = sH * 60 + sM;

  // Normalize end time (default: 18:00)
  const endVal = isValidTimeString(event.endTime);
  const endStr = endVal.valid && endVal.normalized24h ? endVal.normalized24h : '18:00';
  const [eH, eM] = endStr.split(':').map(Number);
  const endMinutes = eH * 60 + eM;

  // Overnight condition
  const isOvernight = endMinutes <= startMinutes;

  const [yearStr, monthStr, dayStr] = eventOperationalDate.split('-');
  let y = parseInt(yearStr, 10);
  let m = parseInt(monthStr, 10);
  let d = parseInt(dayStr, 10);

  if (isOvernight) {
    const nextDate = new Date(Date.UTC(y, m - 1, d + 1));
    y = nextDate.getUTCFullYear();
    m = nextDate.getUTCMonth() + 1;
    d = nextDate.getUTCDate();
  }

  const pad = (n: number) => n.toString().padStart(2, '0');
  let endOperationalDate = isOvernight ? `${y}-${pad(m)}-${pad(d)}` : eventOperationalDate;

  if (options?.latestDepartureDate && options.latestDepartureDate > endOperationalDate) {
    const [ey, em, ed] = options.latestDepartureDate.split('-').map(Number);
    if (!isNaN(ey) && !isNaN(em) && !isNaN(ed)) {
      y = ey;
      m = em;
      d = ed;
      endOperationalDate = options.latestDepartureDate;
    }
  }

  const isoEndString = `${y}-${pad(m)}-${pad(d)}T${pad(eH)}:${pad(eM)}:00.000+05:30`;
  const scheduledEventEndAt = new Date(isoEndString);

  const correctionDeadlineAt = new Date(scheduledEventEndAt.getTime() + 24 * 60 * 60 * 1000);

  const nowMs = now.getTime();
  const isBeforeEventEnd = nowMs < scheduledEventEndAt.getTime();
  const isAfterDeadline = nowMs > correctionDeadlineAt.getTime();
  const canNormalCorrect = !isAfterDeadline;

  const isEventDay =
    currentOperationalDate >= eventOperationalDate && currentOperationalDate <= endOperationalDate;
  const isBeforeEventDay = currentOperationalDate < eventOperationalDate;
  const isAfterEventDay = currentOperationalDate > endOperationalDate;

  return {
    scheduledEventEndAt,
    correctionDeadlineAt,
    isBeforeEventEnd,
    isAfterDeadline,
    canNormalCorrect,
    eventOperationalDate,
    currentOperationalDate,
    isEventDay,
    isBeforeEventDay,
    isAfterEventDay,
  };
}

