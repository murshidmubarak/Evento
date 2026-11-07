export type AttendanceLifecycleStatus =
  | 'checkin_in_progress'
  | 'checkin_finalized'
  | 'checkout_finalized'
  | 'cancelled';

export interface AttendanceRequirementOverride {
  requirementId: string;
  normalFinishTime: string;
  normalFinishDate?: string;
}

export interface CategoryFinishTime {
  workerType: string;
  normalFinishTime: string;
  normalFinishDate?: string;
}

export interface AttendanceSession {
  _id: string;
  eventId: string;
  lifecycleStatus: AttendanceLifecycleStatus;
  checkInFinalized: boolean;
  checkInFinalizedAt?: string;
  checkInFinalizedBy?: string;
  actualNormalFinishTime?: string;
  actualNormalFinishDate?: string;
  categoryFinishTimes?: CategoryFinishTime[];
  requirementFinishOverrides?: AttendanceRequirementOverride[];
  checkOutFinalized: boolean;
  checkOutFinalizedAt?: string;
  checkOutFinalizedBy?: string;
  verificationStatus?: 'pending_review' | 'approved' | 'rejected';
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AttendanceCorrection {
  modifiedBy: string;
  modifiedAt: string;
  field: string;
  previousValue?: string;
  previousSource?: string;
  previousStatus?: string;
  previousArrivalStatus?: string;
  previousDepartureStatus?: string;
  newValue?: string;
  newSource?: string;
  newStatus?: string;
  newArrivalStatus?: string;
  newDepartureStatus?: string;
  reason: string;
}

export interface AttendanceRosterItem {
  workerId: string;
  workerName: string;
  workerEmail: string;
  workerPhone: string;
  businessId: string;
  workerType: string;
  requirementId: string;
  reportingTime: string;
  reportingTimeSnapshot: string;
  applicableNormalFinishTimeSnapshot?: string;
  applicableNormalFinishDate?: string | null;
  attendanceId: string | null;
  status: string; // 'scheduled' | 'present' | 'late' | 'absent' | 'not_started' | 'checked_in' | 'checked_out'
  arrivalStatus: string; // 'on_time' | 'late' | 'absent' | 'unrecorded'
  checkIn: string | null;
  checkInSource: string; // 'system_default' | 'manager_actual' | 'not_recorded'
  delayMinutes: number;
  checkOut?: string | null;
  checkOutSource?: string; // 'system_default' | 'manager_actual' | 'not_recorded'
  departureStatus?: string; // 'normal' | 'early_departure' | 'overtime' | 'not_recorded'
  earlyDepartureMinutes?: number;
  overtimeMinutes?: number;
  durationMinutes?: number;
  verificationStatus?: 'pending_review' | 'approved' | 'rejected';
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  corrections?: AttendanceCorrection[];
  isAssigned: boolean;
}

export interface AttendanceRosterRequirementItem {
  requirementId: string;
  workerType: string;
  reportingTime: string;
  assignedCount: number;
}

export interface AttendanceRosterResponse {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  session: {
    checkInFinalized: boolean;
    checkInFinalizedAt?: string;
    actualNormalFinishTime?: string;
    actualNormalFinishDate?: string;
    categoryFinishTimes?: CategoryFinishTime[];
    requirementFinishOverrides?: AttendanceRequirementOverride[];
    checkOutFinalized: boolean;
    checkOutFinalizedAt?: string;
    lifecycleStatus: string;
    verificationStatus?: 'pending_review' | 'approved' | 'rejected';
    verifiedBy?: string;
    verifiedAt?: string;
    rejectionReason?: string;
  };
  latestReportingTime: string;
  latestReportingTimestamp: string | null;
  canFinalizeCheckIn: boolean;
  totalAssigned: number;
  requirements?: AttendanceRosterRequirementItem[];
  roster: AttendanceRosterItem[];
}

export interface LateExceptionInput {
  workerId: string;
  actualArrivalTime: string;
}

export interface FinalizeCheckInPayload {
  lateExceptions?: LateExceptionInput[];
  absentExceptions?: string[];
}

export interface FinalizeCheckInSummary {
  eventId: string;
  totalProcessed: number;
  onTimeCount: number;
  lateCount: number;
  absentCount: number;
  checkInFinalized: boolean;
  checkInFinalizedAt: string;
}

export interface IndividualCheckInPayload {
  arrivalStatus: 'on_time' | 'late' | 'absent';
  actualArrivalTime?: string;
  status?: 'checked_in' | 'absent';
}

export type WorkerCheckInExceptionType = 'present' | 'late' | 'absent';

export type WorkerCheckOutExceptionType = 'normal' | 'early' | 'overtime';

export interface CategoryFinishTimeInput {
  workerType: string;
  normalFinishTime: string;
}

export interface RequirementFinishOverrideInput {
  requirementId: string;
  normalFinishTime: string;
}

export interface EarlyDepartureExceptionInput {
  workerId: string;
  actualCheckoutTime: string;
}

export interface OvertimeExceptionInput {
  workerId: string;
  actualCheckoutTime: string;
}

export interface FinalizeCheckOutPayload {
  actualNormalFinishTime?: string;
  categoryFinishTimes?: CategoryFinishTimeInput[];
  requirementFinishOverrides?: RequirementFinishOverrideInput[];
  earlyDepartureExceptions?: EarlyDepartureExceptionInput[];
  overtimeExceptions?: OvertimeExceptionInput[];
}

export interface FinalizeCheckOutSummary {
  eventId: string;
  totalProcessed: number;
  normalCheckoutCount: number;
  earlyDepartureCount: number;
  overtimeCount: number;
  absentCount: number;
  checkOutFinalized: boolean;
  checkOutFinalizedAt: string;
}

export interface CorrectAttendancePayload {
  reason: string;
  actualArrivalTime?: string;
  actualCheckoutTime?: string;
  arrivalStatus?: 'on_time' | 'late' | 'absent';
  departureStatus?: 'normal' | 'early_departure' | 'overtime';
  status?: 'checked_in' | 'checked_out' | 'absent';
  applyDefaultCheckout?: boolean;
}

export interface VerifyAttendancePayload {
  action: 'approve' | 'reject';
  rejectionReason?: string;
}

export interface AttendanceVerificationSummary {
  eventId: string;
  verificationStatus: 'approved' | 'rejected';
  verifiedBy: string;
  verifiedAt: string;
  totalRecords: number;
  rejectionReason?: string;
}


