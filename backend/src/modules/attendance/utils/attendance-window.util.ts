import { isValidTimeString } from '../validation/attendance.validation.js';

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
  now = new Date()
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
  const isoEndString = `${y}-${pad(m)}-${pad(d)}T${pad(eH)}:${pad(eM)}:00.000+05:30`;
  const scheduledEventEndAt = new Date(isoEndString);

  const correctionDeadlineAt = new Date(scheduledEventEndAt.getTime() + 24 * 60 * 60 * 1000);

  const nowMs = now.getTime();
  const isBeforeEventEnd = nowMs < scheduledEventEndAt.getTime();
  const isAfterDeadline = nowMs > correctionDeadlineAt.getTime();
  const canNormalCorrect = !isAfterDeadline;

  const isEventDay = currentOperationalDate === eventOperationalDate;
  const isBeforeEventDay = currentOperationalDate < eventOperationalDate;
  const isAfterEventDay = currentOperationalDate > eventOperationalDate;

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

