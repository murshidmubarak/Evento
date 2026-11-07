import { apiClient } from '../../services/apiClient';
import type {
  AttendanceSession,
  AttendanceRosterResponse,
  AttendanceRosterItem,
  IndividualCheckInPayload,
  FinalizeCheckInPayload,
  FinalizeCheckInSummary,
  FinalizeCheckOutPayload,
  FinalizeCheckOutSummary,
  CorrectAttendancePayload,
  VerifyAttendancePayload,
  AttendanceVerificationSummary,
} from './attendance.types';

export const attendanceApi = {
  /**
   * GET /api/attendance/events/:eventId/session
   * Retrieves or initializes the event attendance session.
   */
  async getSession(eventId: string): Promise<AttendanceSession> {
    const response = await apiClient.get<{
      success: boolean;
      message: string;
      data: AttendanceSession;
    }>(`/attendance/events/${eventId}/session`);
    return response.data.data;
  },

  /**
   * GET /api/attendance/events/:eventId/roster
   * Retrieves the complete assigned-worker roster for the event with attendance status.
   */
  async getRoster(eventId: string): Promise<AttendanceRosterResponse> {
    const response = await apiClient.get<{
      success: boolean;
      message: string;
      data: AttendanceRosterResponse;
    }>(`/attendance/events/${eventId}/roster`);
    return response.data.data;
  },

  /**
   * POST /api/attendance/events/:eventId/workers/:workerId/checkin
   * Immediately records and persists individual worker check-in upon explicit confirmation.
   */
  async recordWorkerCheckIn(
    eventId: string,
    workerId: string,
    payload: IndividualCheckInPayload
  ): Promise<AttendanceRosterItem> {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: AttendanceRosterItem;
    }>(`/attendance/events/${eventId}/workers/${workerId}/checkin`, payload);
    return response.data.data;
  },

  /**
   * POST /api/attendance/events/:eventId/finalize-checkin
   * Finalizes check-in for the event using exception-based reporting.
   * Requires an Idempotency-Key header.
   */
  async finalizeCheckIn(
    eventId: string,
    payload: FinalizeCheckInPayload,
    idempotencyKey: string
  ): Promise<FinalizeCheckInSummary> {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: FinalizeCheckInSummary;
    }>(`/attendance/events/${eventId}/finalize-checkin`, payload, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data.data;
  },

  /**
   * POST /api/attendance/events/:eventId/finalize-checkout
   * Finalizes checkout for the event using exception-based reporting.
   * Requires an Idempotency-Key header.
   */
  async finalizeCheckOut(
    eventId: string,
    payload: FinalizeCheckOutPayload,
    idempotencyKey: string
  ): Promise<FinalizeCheckOutSummary> {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: FinalizeCheckOutSummary;
    }>(`/attendance/events/${eventId}/finalize-checkout`, payload, {
      headers: {
        'Idempotency-Key': idempotencyKey,
      },
    });
    return response.data.data;
  },

  /**
   * PATCH /api/attendance/records/:attendanceId/correct
   * Executes attendance correction or absence reversal with mandatory reason and recalculations.
   */
  async correctAttendance(
    attendanceId: string,
    payload: CorrectAttendancePayload
  ): Promise<AttendanceRosterItem> {
    const response = await apiClient.patch<{
      success: boolean;
      message: string;
      data: AttendanceRosterItem;
    }>(`/attendance/records/${attendanceId}/correct`, payload);
    return response.data.data;
  },

  /**
   * POST /api/attendance/events/:eventId/verify
   * Submits final manager approval or rejection for the event attendance roster.
   */
  async verifyAttendance(
    eventId: string,
    payload: VerifyAttendancePayload
  ): Promise<AttendanceVerificationSummary> {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: AttendanceVerificationSummary;
    }>(`/attendance/events/${eventId}/verify`, payload);
    return response.data.data;
  },
};

/**
 * Normalizes a time string (12h AM/PM or 24h) to total minutes from midnight (0–1439).
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const trimmed = timeStr.trim();

  // 12-hour AM/PM: "08:30 AM", "8:30pm", "12:15 PM"
  const match12 = trimmed.match(/^(0?[0-9]|1[0-2]):([0-5]\d)(?::[0-5]\d)?\s*([APap][Mm])$/);
  if (match12) {
    let hours = parseInt(match12[1], 10);
    const minutes = parseInt(match12[2], 10);
    const ampm = match12[3].toUpperCase();
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    return hours * 60 + minutes;
  }

  // 24-hour: "08:30", "14:45", "00:15"
  const match24 = trimmed.match(/^([0-1]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (match24) {
    const hours = parseInt(match24[1], 10);
    const minutes = parseInt(match24[2], 10);
    return hours * 60 + minutes;
  }

  return null;
}

/**
 * Formats duration in minutes to human-readable string (e.g. "8 hrs 30 mins" or "45 mins").
 */
export function formatDurationMinutes(minutes: number): string {
  if (minutes <= 0) return '0 mins';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0 && mins > 0) return `${hours} hr${hours > 1 ? 's' : ''} ${mins} min${mins > 1 ? 's' : ''}`;
  if (hours > 0) return `${hours} hr${hours > 1 ? 's' : ''}`;
  return `${mins} min${mins > 1 ? 's' : ''}`;
}

/**
 * Calculates late arrival delay in minutes, validating that actual arrival is strictly later than scheduled reporting time.
 */
export function calculateDelayMinutes(
  reportingTimeStr: string,
  actualArrivalTimeStr: string
): {
  delayMinutes: number;
  isValid: boolean;
  error?: string;
  previewText?: string;
} {
  const repMins = parseTimeToMinutes(reportingTimeStr);
  const arrMins = parseTimeToMinutes(actualArrivalTimeStr);

  if (repMins === null || arrMins === null) {
    return {
      delayMinutes: 0,
      isValid: false,
      error: 'Please enter a valid time (e.g. 08:45 AM or 14:30)',
    };
  }

  let diff = arrMins - repMins;
  // Overnight shift edge case (e.g. reporting 23:00 and arrival 00:30)
  if (diff < 0 && repMins >= 12 * 60 && arrMins < 12 * 60) {
    diff += 24 * 60;
  }

  if (diff <= 0) {
    return {
      delayMinutes: 0,
      isValid: false,
      error: `Actual arrival time must be strictly later than scheduled reporting time (${reportingTimeStr})`,
    };
  }

  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  let previewText = '';
  if (hours > 0 && mins > 0) {
    previewText = `+${hours} hr ${mins} min late`;
  } else if (hours > 0) {
    previewText = `+${hours} hr late`;
  } else {
    previewText = `+${mins} min late`;
  }

  return { delayMinutes: diff, isValid: true, previewText };
}

/**
 * Calculates early departure minutes, validating that actual checkout is strictly earlier than normal finish time.
 */
export function calculateEarlyDepartureMinutes(
  applicableFinishTimeStr: string,
  actualCheckoutTimeStr: string,
  checkInTimeStr?: string | null
): {
  earlyMinutes: number;
  isValid: boolean;
  error?: string;
  previewText?: string;
} {
  const finMins = parseTimeToMinutes(applicableFinishTimeStr);
  const outMins = parseTimeToMinutes(actualCheckoutTimeStr);

  if (finMins === null || outMins === null) {
    return {
      earlyMinutes: 0,
      isValid: false,
      error: 'Please enter a valid time (e.g. 15:30 or 03:30 PM)',
    };
  }

  let diff = finMins - outMins;
  // Handle overnight shift where finish is next morning (e.g. finish 02:00, checkout 23:00 previous day)
  if (diff < 0 && finMins < 12 * 60 && outMins >= 12 * 60) {
    diff += 24 * 60;
  }

  if (diff <= 0) {
    return {
      earlyMinutes: 0,
      isValid: false,
      error: `Early departure time must be earlier than the applicable normal finish time (${applicableFinishTimeStr})`,
    };
  }

  if (checkInTimeStr) {
    const inMins = parseTimeToMinutes(checkInTimeStr);
    if (inMins !== null) {
      let worked = outMins - inMins;
      if (worked < 0 && inMins >= 12 * 60 && outMins < 12 * 60) {
        worked += 24 * 60;
      }
      if (worked <= 0) {
        return {
          earlyMinutes: 0,
          isValid: false,
          error: `Checkout time must be later than check-in time (${checkInTimeStr})`,
        };
      }
    }
  }

  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  let previewText = '';
  if (hours > 0 && mins > 0) {
    previewText = `-${hours} hr ${mins} min early`;
  } else if (hours > 0) {
    previewText = `-${hours} hr early`;
  } else {
    previewText = `-${mins} min early`;
  }

  return { earlyMinutes: diff, isValid: true, previewText };
}

/**
 * Calculates overtime minutes, validating that actual checkout is strictly later than normal finish time.
 */
export function calculateOvertimeMinutes(
  applicableFinishTimeStr: string,
  actualCheckoutTimeStr: string,
  checkInTimeStr?: string | null
): {
  overtimeMinutes: number;
  isValid: boolean;
  error?: string;
  previewText?: string;
} {
  const finMins = parseTimeToMinutes(applicableFinishTimeStr);
  const outMins = parseTimeToMinutes(actualCheckoutTimeStr);

  if (finMins === null || outMins === null) {
    return {
      overtimeMinutes: 0,
      isValid: false,
      error: 'Please enter a valid time (e.g. 19:30 or 07:30 PM)',
    };
  }

  let diff = outMins - finMins;
  // Handle overnight shift where checkout is next morning (e.g. finish 23:00, checkout 01:00 next day)
  if (diff < 0 && finMins >= 12 * 60 && outMins < 12 * 60) {
    diff += 24 * 60;
  }

  if (diff <= 0) {
    return {
      overtimeMinutes: 0,
      isValid: false,
      error: `Overtime checkout time must be later than the applicable normal finish time (${applicableFinishTimeStr})`,
    };
  }

  if (checkInTimeStr) {
    const inMins = parseTimeToMinutes(checkInTimeStr);
    if (inMins !== null) {
      let worked = outMins - inMins;
      if (worked < 0 && inMins >= 12 * 60 && outMins < 12 * 60) {
        worked += 24 * 60;
      }
      if (worked <= 0) {
        return {
          overtimeMinutes: 0,
          isValid: false,
          error: `Checkout time must be later than check-in time (${checkInTimeStr})`,
        };
      }
    }
  }

  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  let previewText = '';
  if (hours > 0 && mins > 0) {
    previewText = `+${hours} hr ${mins} min overtime`;
  } else if (hours > 0) {
    previewText = `+${hours} hr overtime`;
  } else {
    previewText = `+${mins} min overtime`;
  }

  return { overtimeMinutes: diff, isValid: true, previewText };
}

/**
 * Returns the calendar date string (YYYY-MM-DD) for a timestamp in the specified timezone
 * (defaults to 'Asia/Kolkata' for EventOps operations).
 */
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
 * Determines whether checkout occurred on a subsequent calendar day relative to check-in
 * in the operational timezone (defaults to 'Asia/Kolkata').
 */
export function isOvernightCheckout(
  checkIn: string | Date | null | undefined,
  checkOut: string | Date | null | undefined,
  timeZone = 'Asia/Kolkata'
): boolean {
  if (!checkIn || !checkOut) return false;
  const inDateStr = getOperationalDateString(checkIn, timeZone);
  const outDateStr = getOperationalDateString(checkOut, timeZone);
  if (!inDateStr || !outDateStr) return false;
  return outDateStr > inDateStr;
}



