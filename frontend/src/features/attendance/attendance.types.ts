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

export interface CategoryActualDeparture {
  workerType: string;
  actualDepartureTime: string;
  actualDepartureDate: string;
  source?: string;
  recordedBy?: string;
  recordedAt?: string;
  departureRecordedAt?: string;
}

export interface CategorySummary {
  workerType: string;
  totalAssigned?: number;
  assignedCount?: number;
  eligibleCount: number;
  absentCount: number;
  normalCount: number;
  earlyCount?: number;
  earlyDepartureCount?: number;
  overtimeCount: number;
  pendingCount: number;
  actualDepartureTime?: string | null;
  actualDepartureDate?: string | null;
  departureRecordedAt?: string | null;
  status?: string;
  checkInFinalized?: boolean;
  checkInFinalizedAt?: string | null;
  checkInFinalizedBy?: string | null;
  checkInChangesPending?: boolean;
  checkInRevision?: number;
  canFinalizeCheckIn?: boolean;
  canReFinalizeCheckIn?: boolean;
  canModifyCheckout?: boolean;
  ineligibleOvertimeRequiredCount?: number;
}

export interface CategoryCheckInConfirmation {
  workerType: string;
  checkInFinalized: boolean;
  checkInFinalizedAt?: string | null;
  checkInFinalizedBy?: string | null;
  checkInChangesPending: boolean;
  checkInRevision: number;
  checkInRevisions?: AttendanceCheckInRevision[];
  canFinalizeCheckIn: boolean;
  canReFinalizeCheckIn: boolean;
  canModifyCheckout: boolean;
}

export interface FinalizeCategoryCheckInSummary {
  eventId: string;
  workerType: string;
  totalProcessed: number;
  onTimeCount: number;
  lateCount: number;
  absentCount: number;
  checkInFinalized: boolean;
  checkInFinalizedAt: string;
  checkInRevision: number;
  checkInChangesPending: boolean;
}

export interface RecordCategoryDeparturePayload {
  workerType: string;
  actualDepartureDate: string;
  actualDepartureTime: string;
  reason?: string;
}

export interface RecordCategoryDepartureResult {
  eventId: string;
  workerType: string;
  actualDepartureTime: string;
  actualDepartureDate: string;
  affectedWorkersCount: number;
  normalWorkersCount?: number;
  normalCount?: number;
  exceptionWorkersCount?: number;
  earlyDepartureCount?: number;
  overtimeCount?: number;
  absentWorkersCount?: number;
  departureStatus?: string;
}

export interface RecordWorkerCheckOutExceptionPayload {
  actualDepartureDate: string;
  actualDepartureTime?: string;
  actualCheckoutTime?: string;
  reason?: string;
}

export interface AttendanceCheckInRevision {
  revision: number;
  finalizedAt: string;
  finalizedBy?: string;
  changeReason?: string;
  committedSummary?: Record<string, unknown>;
}

export interface AttendanceSession {
  _id: string;
  eventId: string;
  lifecycleStatus: AttendanceLifecycleStatus;
  checkInFinalized: boolean;
  checkInFinalizedAt?: string;
  checkInFinalizedBy?: string;
  checkInChangesPending?: boolean;
  checkInRevision?: number;
  checkInRevisions?: AttendanceCheckInRevision[];
  categoryCheckInConfirmations?: CategoryCheckInConfirmation[];
  categoryActualDepartures?: CategoryActualDeparture[];
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
  actualDepartureTime?: string;
  checkOutSource?: string; // 'category_default' | 'individual_exception' | 'manager_actual' | 'system_default' | 'not_recorded'
  departureStatus?: string; // 'normal' | 'early_departure' | 'overtime' | 'not_recorded'
  earlyDepartureMinutes?: number;
  overtimeMinutes?: number;
  durationMinutes?: number;
  totalWorkingDurationMinutes?: number;
  verificationStatus?: 'pending_review' | 'approved' | 'rejected';
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  corrections?: AttendanceCorrection[];
  isAssigned: boolean;
  isStatusLocked?: boolean;
  statusLockedAt?: string;
  statusLockedReason?: string;
  hasOpenConcern?: boolean;
  activeConcernId?: string | null;
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
  isEventDay?: boolean;
  isBeforeEventDay?: boolean;
  isAfterEventDay?: boolean;
  eventOperationalDate?: string;
  currentOperationalDate?: string;
  checkInFinalized?: boolean;
  checkInFinalizedAt?: string;
  checkInFinalizedBy?: string;
  checkInChangesPending?: boolean;
  checkInRevision?: number;
  session: {
    checkInFinalized: boolean;
    checkInFinalizedAt?: string;
    checkInFinalizedBy?: string;
    checkInChangesPending?: boolean;
    checkInRevision?: number;
    checkInRevisions?: AttendanceCheckInRevision[];
    actualNormalFinishTime?: string;
    actualNormalFinishDate?: string;
    categoryActualDepartures?: CategoryActualDeparture[];
    categoryFinishTimes?: CategoryFinishTime[];
    requirementFinishOverrides?: AttendanceRequirementOverride[];
    checkOutFinalized: boolean;
    checkOutFinalizedAt?: string;
    lifecycleStatus: string;
    verificationStatus?: 'pending_review' | 'approved' | 'rejected';
    verifiedBy?: string;
    verifiedAt?: string;
    rejectionReason?: string;
    categoryCheckInConfirmations?: CategoryCheckInConfirmation[];
  };
  categoryCheckInConfirmations?: CategoryCheckInConfirmation[];
  latestReportingTime: string;
  latestReportingTimestamp: string | null;
  canFinalizeCheckIn: boolean;
  canReFinalizeCheckIn?: boolean;
  canEditCheckIn?: boolean;
  totalAssigned: number;
  scheduledEventEndAt?: string;
  correctionDeadlineAt?: string;
  canNormalCorrect?: boolean;
  isAfterCorrectionDeadline?: boolean;
  canModifyCheckout?: boolean;
  checkoutModificationDeadlineAt?: string;
  checkoutModificationTimeRemainingMs?: number;
  categoryActualDepartures?: CategoryActualDeparture[];
  categorySummaries?: CategorySummary[];
  totalEligibleWorkers?: number;
  totalAbsentWorkers?: number;
  totalNormalWorkers?: number;
  totalEarlyDepartureWorkers?: number;
  totalOvertimeWorkers?: number;
  totalPendingWorkers?: number;
  openConcernsCount?: number;
  requirements?: AttendanceRosterRequirementItem[];
  roster: AttendanceRosterItem[];
  summary?: {
    total: number;
    present: number;
    late: number;
    absent: number;
    checkedOutCount: number;
    pendingCheckOutCount: number;
    normalCount: number;
    earlyDepartureCount: number;
    overtimeCount: number;
  };
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

// =============================================================================
// Attendance Concerns Lifecycle Types (§4, §5, §6, §11, §12)
// =============================================================================

export type ConcernStatus = 'open' | 'closed';
export type ConcernResolutionOutcome = 'accepted' | 'rejected';
export type ConcernCategory =
  | 'late_dispute'
  | 'absent_dispute'
  | 'time_recording_error'
  | 'technical_issue'
  | 'other';

export interface ConcernMessage {
  senderId: string | { _id: string; name: string; role: string };
  senderRole: 'worker' | 'event_manager' | 'admin';
  message: string;
  sentAt: string;
}

export interface AttendanceConcern {
  _id: string;
  attendanceId: string | any;
  eventId: string | any;
  workerId: string | any;
  managerId: string | any;
  concernCategory: ConcernCategory;
  explanation: string;
  additionalDetails?: string;
  status: ConcernStatus;
  resolutionOutcome?: ConcernResolutionOutcome;
  resolutionExplanation?: string;
  resultingArrivalStatus?: 'on_time' | 'late' | 'absent';
  resultingActualArrivalTime?: string;
  closedBy?: string | any;
  closedAt?: string;
  messages: ConcernMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface SubmitConcernPayload {
  attendanceId: string;
  concernCategory: ConcernCategory;
  explanation: string;
  additionalDetails?: string;
}

export interface ResolveConcernPayload {
  action: 'accept' | 'reject';
  resolutionExplanation: string;
  resultingArrivalStatus?: 'on_time' | 'late' | 'absent';
  resultingActualArrivalTime?: string;
}

export interface WorkerAttendanceRecordWithConcern {
  attendanceId: string;
  eventId: string;
  eventTitle: string;
  eventType: string;
  eventDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
  eventLocation?: { address: string };
  eventStatus: string;
  workerType: string;
  reportingTime: string;
  arrivalStatus: string;
  departureStatus?: string;
  status: string;
  checkIn?: string;
  checkOut?: string;
  delayMinutes: number;
  isStatusLocked: boolean;
  hasOpenConcern: boolean;
  scheduledEventEndAt?: string;
  correctionDeadlineAt?: string;
  isBeforeEventEnd: boolean;
  isAfterDeadline: boolean;
  canRaiseConcern: boolean;
  eligibilityReason: string;
  concern?: {
    concernId: string;
    status: ConcernStatus;
    concernCategory: ConcernCategory;
    explanation: string;
    resolutionOutcome?: ConcernResolutionOutcome;
    resolutionExplanation?: string;
    resultingArrivalStatus?: 'on_time' | 'late' | 'absent';
    createdAt: string;
    closedAt?: string;
  } | null;
}



