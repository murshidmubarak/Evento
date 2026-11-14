import crypto from 'node:crypto';
import mongoose, { type ClientSession } from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { Event, type IEvent } from '../../events/model/event.model.js';
import { WorkRequirement, type IWorkRequirement } from '../../work-requirements/model/work-requirement.model.js';
import { User } from '../../auth/model/user.model.js';
import {
  AttendanceSession,
  type IAttendanceSession,
  type IFinalizationIdempotency,
  type IRequirementFinishOverride,
  type ICategoryCheckInConfirmation,
} from '../model/attendance-session.model.js';
import {
  Attendance,
  type IAttendance,
  type ArrivalStatus,
  type DepartureStatus,
} from '../model/attendance.model.js';
import {
  AttendanceSessionRepository,
  attendanceSessionRepository,
} from '../repository/attendance-session.repository.js';
import {
  AttendanceRepository,
  attendanceRepository,
} from '../repository/attendance.repository.js';
import { attendanceConcernRepository } from '../repository/attendance-concern.repository.js';
import { isValidTimeString } from '../validation/attendance.validation.js';
import { notificationService } from '../../notifications/service/notification.service.js';
import {
  getOperationalDateString,
  calculateEventCorrectionWindow,
  constructKolkataDateTime,
  type EventCorrectionWindow,
} from '../utils/attendance-window.util.js';

export { getOperationalDateString, calculateEventCorrectionWindow, type EventCorrectionWindow };

export interface FinalizeCheckInPayload {
  lateExceptions?: Array<{
    workerId: string;
    actualArrivalTime: string;
  }>;
  absentExceptions?: string[];
  expectedRevision?: number;
  reason?: string;
}

export interface FinalizeCheckInSummary {
  eventId: string;
  totalProcessed: number;
  onTimeCount: number;
  lateCount: number;
  absentCount: number;
  checkInFinalized: boolean;
  checkInFinalizedAt: string;
  checkInRevision?: number;
  checkInChangesPending?: boolean;
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

export interface CategoryCheckInConfirmationDTO {
  workerType: string;
  checkInFinalized: boolean;
  checkInFinalizedAt?: Date | null;
  checkInFinalizedBy?: string | null;
  checkInChangesPending: boolean;
  checkInRevision: number;
  checkInRevisions?: Array<{
    revision: number;
    finalizedAt: Date;
    finalizedBy?: string;
    committedSummary?: Record<string, unknown>;
    changeReason?: string;
  }>;
  canFinalizeCheckIn: boolean;
  canReFinalizeCheckIn: boolean;
  canModifyCheckout: boolean;
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

export interface CategoryFinishTimeInput {
  workerType: string;
  normalFinishTime: string;
}

export interface FinalizeCheckOutPayload {
  actualNormalFinishTime?: string;
  categoryFinishTimes?: CategoryFinishTimeInput[];
  requirementFinishOverrides?: RequirementFinishOverrideInput[];
  earlyDepartureExceptions?: EarlyDepartureExceptionInput[];
  overtimeExceptions?: OvertimeExceptionInput[];
}

export interface RecordCategoryDeparturePayload {
  workerType: string;
  actualDepartureDate?: string;
  actualDepartureTime: string;
  reason?: string;
}

export interface RecordCategoryDepartureResult {
  eventId: string;
  workerType: string;
  actualDepartureTime: string;
  actualDepartureDate: string;
  affectedWorkersCount: number;
  normalWorkersCount: number;
  exceptionWorkersCount: number;
  absentWorkersCount: number;
}

export interface RecordWorkerCheckOutExceptionPayload {
  actualDepartureDate?: string;
  actualCheckoutTime?: string;
  actualDepartureTime?: string;
  reason?: string;
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

export interface AttendanceRosterRequirementItem {
  requirementId: string;
  workerType: string;
  reportingTime: string;
  assignedCount: number;
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
  applicableNormalFinishDate?: Date | null;
  attendanceId: string | null;
  status: string;
  arrivalStatus: string;
  checkIn: Date | null;
  checkInSource: string;
  delayMinutes: number;
  checkOut?: Date | null;
  checkOutSource?: string;
  departureStatus?: string;
  earlyDepartureMinutes?: number;
  overtimeMinutes?: number;
  durationMinutes?: number;
  verificationStatus?: string;
  verifiedBy?: string;
  verifiedAt?: Date;
  rejectionReason?: string;
  corrections?: any[];
  isAssigned: boolean;
  isStatusLocked?: boolean;
  statusLockedAt?: Date;
  statusLockedReason?: string;
  hasOpenConcern?: boolean;
  activeConcernId?: string | null;
}

export interface CorrectAttendancePayload {
  reason: string;
  actualArrivalTime?: string;
  actualCheckoutTime?: string;
  actualDepartureDate?: string;
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

export interface AttendanceRosterResponse {
  eventId: string;
  eventTitle: string;
  eventDate: Date;
  isEventDay?: boolean;
  isBeforeEventDay?: boolean;
  isAfterEventDay?: boolean;
  eventOperationalDate?: string;
  currentOperationalDate?: string;
  checkInFinalized?: boolean;
  checkInFinalizedAt?: Date;
  checkInFinalizedBy?: string;
  checkInChangesPending?: boolean;
  checkInRevision?: number;
  session: {
    checkInFinalized: boolean;
    checkInFinalizedAt?: Date;
    checkInFinalizedBy?: string;
    checkInChangesPending?: boolean;
    checkInRevision?: number;
    checkInRevisions?: Array<{
      revision: number;
      finalizedAt: Date;
      finalizedBy?: string;
      committedSummary?: Record<string, unknown>;
      changeReason?: string;
    }>;
    categoryActualDepartures?: Array<{
      workerType: string;
      actualDepartureTime: string;
      actualDepartureDate: Date;
      recordedBy?: string;
      recordedAt?: Date;
    }>;
    actualNormalFinishTime?: string;
    actualNormalFinishDate?: Date;
    categoryFinishTimes?: Array<{
      workerType: string;
      normalFinishTime: string;
      normalFinishDate: Date;
    }>;
    requirementFinishOverrides?: Array<{
      requirementId: string;
      normalFinishTime: string;
      normalFinishDate: Date;
    }>;
    checkOutFinalized: boolean;
    checkOutFinalizedAt?: Date;
    lifecycleStatus: string;
    verificationStatus?: string;
    verifiedBy?: string;
    verifiedAt?: Date;
    rejectionReason?: string;
    categoryCheckInConfirmations?: CategoryCheckInConfirmationDTO[];
  };
  categoryCheckInConfirmations?: CategoryCheckInConfirmationDTO[];
  latestReportingTime: string;
  latestReportingTimestamp: Date | null;
  canFinalizeCheckIn: boolean;
  canReFinalizeCheckIn?: boolean;
  canEditCheckIn?: boolean;
  totalAssigned: number;
  scheduledEventEndAt?: Date;
  correctionDeadlineAt?: Date;
  canNormalCorrect?: boolean;
  isAfterCorrectionDeadline?: boolean;
  openConcernsCount?: number;
  requirements: AttendanceRosterRequirementItem[];
  roster: AttendanceRosterItem[];
  canModifyCheckout?: boolean;
  checkoutModificationDeadlineAt?: Date;
  checkoutModificationTimeRemainingMs?: number;
  categoryActualDepartures?: Array<{
    workerType: string;
    actualDepartureTime: string;
    actualDepartureDate: Date;
    recordedBy?: string;
    recordedAt?: Date;
  }>;
  categorySummaries?: Array<{
    workerType: string;
    totalAssigned: number;
    eligibleCount: number;
    absentCount: number;
    normalCount: number;
    earlyCount: number;
    overtimeCount: number;
    pendingCount: number;
    actualDepartureTime?: string | null;
    actualDepartureDate?: Date | null;
    checkInFinalized: boolean;
    checkInFinalizedAt?: Date | null;
    checkInFinalizedBy?: string | null;
    checkInChangesPending: boolean;
    checkInRevision: number;
    canFinalizeCheckIn: boolean;
    canReFinalizeCheckIn: boolean;
    canModifyCheckout: boolean;
    ineligibleOvertimeRequiredCount?: number;
  }>;
  totalEligibleWorkers?: number;
  totalAbsentWorkers?: number;
  totalNormalWorkers?: number;
  totalEarlyDepartureWorkers?: number;
  totalOvertimeWorkers?: number;
  totalPendingWorkers?: number;
}

/**
 * Executes a callback within a MongoDB multi-document transaction when supported
 * (e.g. replica sets in CI/production), or directly on standalone local instances.
 */
async function runInTransaction<T>(
  work: (session?: ClientSession) => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T;
    try {
      await session.withTransaction(async () => {
        result = await work(session);
      });
      return result!;
    } catch (txErr: any) {
      if (
        txErr?.message?.includes('Transaction numbers are only allowed on a replica set member or mongos') ||
        txErr?.message?.includes('replica set')
      ) {
        return await work(undefined);
      }
      throw txErr;
    }
  } finally {
    await session.endSession();
  }
}

export class AttendanceService {
  constructor(
    private sessionRepo: AttendanceSessionRepository = attendanceSessionRepository,
    private attRepo: AttendanceRepository = attendanceRepository
  ) { }

  /**
   * Helper: Validates Event ID, verifies existence, and verifies resource ownership.
   */
  private async validateEventAndOwnership(
    eventId: string,
    userId: string,
    userRole: string,
    session?: ClientSession
  ): Promise<IEvent> {
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      throw ApiError.badRequest('Invalid event ID format');
    }

    const query = Event.findById(eventId);
    if (session) query.session(session);
    const event = await query.exec();

    if (!event) {
      throw ApiError.notFound('Event not found');
    }

    if (userRole === 'admin') {
      return event;
    }

    if (userRole === 'event_manager') {
      const assignedManagerId = (event.eventManagerId as any)?._id?.toString() || event.eventManagerId?.toString();
      if (assignedManagerId !== userId) {
        throw ApiError.forbidden('You do not have permission to access attendance for this event');
      }
      return event;
    }

    throw ApiError.forbidden('Insufficient permissions to access attendance');
  }

  /**
   * Test clock injection provider for deterministic test runs.
   */
  private testClockProvider: (() => Date) | null = null;

  public setTestClock(clock: (() => Date) | Date | null): void {
    if (!clock) {
      this.testClockProvider = null;
    } else if (typeof clock === 'function') {
      this.testClockProvider = clock;
    } else {
      this.testClockProvider = () => clock;
    }
  }

  public getNow(): Date {
    return this.testClockProvider ? this.testClockProvider() : new Date();
  }

  /**
   * Helper: Combines event calendar date and a normalized 24-hour time string into a canonical Asia/Kolkata UTC instant.
   */
  public constructDateTime(eventDate: Date | string, timeStr24h: string): Date {
    return constructKolkataDateTime(eventDate, timeStr24h);
  }

  /**
   * Combines explicit departure calendar date and departure time into an Asia/Kolkata UTC instant.
   * Note: Cross-midnight shifts are handled via explicit calendar dates; automatic +24h rollover is removed.
   */
  public constructDepartureDate(
    departureDate: Date | string,
    departureTime24h: string,
    _referenceReportingTime24h = '08:00'
  ): Date {
    return constructKolkataDateTime(departureDate, departureTime24h);
  }

  /**
   * Helper: converts an IAttendance document to AttendanceRosterItem DTO.
   */
  private toRosterItemDTO(att: IAttendance, user?: any, req?: any): AttendanceRosterItem {
    const workerIdStr = (att.workerId as any)?._id?.toString() || att.workerId?.toString();
    return {
      workerId: workerIdStr,
      workerName: user?.name || (att.workerId as any)?.name || 'Assigned Worker',
      workerEmail: user?.email || (att.workerId as any)?.email || '',
      workerPhone: user?.phone || (att.workerId as any)?.phone || '',
      businessId: user?.businessId || (att.workerId as any)?.businessId || '',
      workerType: att.workerType,
      requirementId: att.requirementId?.toString() || req?._id?.toString() || '',
      reportingTime: req?.reportingTime || att.reportingTimeSnapshot,
      reportingTimeSnapshot: att.reportingTimeSnapshot,
      applicableNormalFinishTimeSnapshot: att.applicableNormalFinishTimeSnapshot,
      applicableNormalFinishDate: att.applicableNormalFinishDate || null,
      attendanceId: att._id.toString(),
      status: att.status,
      arrivalStatus: att.arrivalStatus,
      checkIn: att.checkIn || null,
      checkInSource: att.checkInSource,
      delayMinutes: att.delayMinutes ?? 0,
      checkOut: att.checkOut || null,
      checkOutSource: att.checkOutSource,
      departureStatus: att.departureStatus,
      earlyDepartureMinutes: att.earlyDepartureMinutes ?? 0,
      overtimeMinutes: att.overtimeMinutes ?? 0,
      durationMinutes: att.durationMinutes ?? 0,
      verificationStatus: att.verificationStatus,
      verifiedBy: att.verifiedBy?.toString(),
      verifiedAt: att.verifiedAt,
      rejectionReason: att.rejectionReason,
      corrections: att.corrections || [],
      isAssigned: true,
      isStatusLocked: Boolean(att.isStatusLocked),
      statusLockedAt: att.statusLockedAt,
      statusLockedReason: att.statusLockedReason,
      hasOpenConcern: Boolean(att.hasOpenConcern),
      activeConcernId: att.activeConcernId ? att.activeConcernId.toString() : null,
    };
  }

  /**
   * Computes a SHA-256 payload hash from normalized check-in exceptions.
   */
  private computePayloadHash(payload: FinalizeCheckInPayload): string {
    const normalizedLate = (payload.lateExceptions || [])
      .map((item) => ({
        workerId: item.workerId.trim(),
        actualArrivalTime: item.actualArrivalTime.trim(),
      }))
      .sort((a, b) => a.workerId.localeCompare(b.workerId));

    const normalizedAbsent = (payload.absentExceptions || [])
      .map((wId) => wId.trim())
      .sort();

    const normalizedString = JSON.stringify({
      lateExceptions: normalizedLate,
      absentExceptions: normalizedAbsent,
      reason: payload.reason?.trim() || '',
    });

    return crypto.createHash('sha256').update(normalizedString).digest('hex');
  }

  /**
   * 1. GET /api/attendance/events/:eventId/session
   * Retrieves or initializes the Attendance Session.
   */
  async getSession(userId: string, userRole: string, eventId: string): Promise<IAttendanceSession> {
    const event = await this.validateEventAndOwnership(eventId, userId, userRole);

    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }

    return this.sessionRepo.getOrCreateSession(eventId);
  }

  /**
   * 2. GET /api/attendance/events/:eventId/roster
   * Retrieves the complete assigned-worker roster for the event with attendance status.
   */
  async getRoster(userId: string, userRole: string, eventId: string): Promise<AttendanceRosterResponse> {
    const event = await this.validateEventAndOwnership(eventId, userId, userRole);

    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }

    // Retrieve or initialize session
    const session = await this.sessionRepo.getOrCreateSession(eventId);

    // Retrieve all non-cancelled requirements for this event
    const requirements = await WorkRequirement.find({
      eventId: new mongoose.Types.ObjectId(eventId),
      status: { $ne: 'cancelled' },
    }).sort({ createdAt: 1 });

    // Collect all unique assigned worker IDs across requirements
    const assignmentEntries: Array<{
      workerId: string;
      workerType: string;
      requirementId: string;
      reportingTime: string;
    }> = [];

    const workerIdSet = new Set<string>();

    for (const req of requirements) {
      if (req.assignedWorkers && req.assignedWorkers.length > 0) {
        for (const assigned of req.assignedWorkers) {
          const wId = assigned.workerId.toString();
          // Avoid duplicate entries if worker is already listed
          if (!workerIdSet.has(wId)) {
            workerIdSet.add(wId);
            assignmentEntries.push({
              workerId: wId,
              workerType: req.workerType,
              requirementId: req._id.toString(),
              reportingTime: req.reportingTime,
            });
          }
        }
      }
    }

    // Retrieve worker details for all assigned workers
    const workerUsers = await User.find({
      _id: { $in: Array.from(workerIdSet).map((id) => new mongoose.Types.ObjectId(id)) },
    }).select('name email phone businessId');

    const userMap = new Map<string, any>();
    for (const u of workerUsers) {
      userMap.set(u._id.toString(), u);
    }

    // Retrieve existing attendance records if any exist
    const existingAttendances = await this.attRepo.findByEventId(eventId);
    const attendanceMap = new Map<string, IAttendance>();
    for (const att of existingAttendances) {
      const wId = (att.workerId as any)?._id?.toString() || att.workerId?.toString();
      if (wId) {
        attendanceMap.set(wId, att);
      }
    }

    // Calculate latest reporting timestamp across active assigned workers
    let latestReportingTimestamp: Date | null = null;
    let latestReportingTimeStr = '';

    for (const entry of assignmentEntries) {
      const timeValidation = isValidTimeString(entry.reportingTime);
      if (timeValidation.valid && timeValidation.normalized24h) {
        const dt = this.constructDateTime(event.date, timeValidation.normalized24h);
        if (!latestReportingTimestamp || dt.getTime() > latestReportingTimestamp.getTime()) {
          latestReportingTimestamp = dt;
          latestReportingTimeStr = entry.reportingTime;
        }
      }
    }

    const now = new Date();
    const windowInfo = calculateEventCorrectionWindow(event, now);
    const { isEventDay, isBeforeEventDay, isAfterEventDay, eventOperationalDate, currentOperationalDate } = windowInfo;

    const openConcernsCount = await attendanceConcernRepository.countOpenByEventId(eventId);

    const canFinalizeCheckIn =
      !session.checkInFinalized &&
      latestReportingTimestamp !== null &&
      now.getTime() >= latestReportingTimestamp.getTime() &&
      event.status !== 'completed';

    const canReFinalizeCheckIn =
      Boolean(session.checkInFinalized && session.checkInChangesPending) &&
      event.status !== 'completed';

    const canEditCheckIn =
      windowInfo.isEventDay &&
      !windowInfo.isAfterEventDay &&
      !windowInfo.isBeforeEventDay &&
      ['confirmed', 'in_progress'].includes(event.status);

    // Map requirement items
    const requirementItems: AttendanceRosterRequirementItem[] = requirements.map((req) => ({
      requirementId: req._id.toString(),
      workerType: req.workerType,
      reportingTime: req.reportingTime,
      assignedCount: (req.assignedWorkers || []).length,
    }));

    // Map roster items
    const roster: AttendanceRosterItem[] = assignmentEntries.map((entry) => {
      const user = userMap.get(entry.workerId);
      const att = attendanceMap.get(entry.workerId);

      return {
        workerId: entry.workerId,
        workerName: user?.name || 'Assigned Worker',
        workerEmail: user?.email || '',
        workerPhone: user?.phone || '',
        businessId: user?.businessId || '',
        workerType: entry.workerType,
        requirementId: entry.requirementId,
        reportingTime: entry.reportingTime,
        reportingTimeSnapshot: att?.reportingTimeSnapshot || entry.reportingTime,
        applicableNormalFinishTimeSnapshot: att?.applicableNormalFinishTimeSnapshot,
        applicableNormalFinishDate: att?.applicableNormalFinishDate || null,
        attendanceId: att?._id?.toString() || null,
        status: att?.status || 'not_started',
        arrivalStatus: att?.arrivalStatus || 'unrecorded',
        checkIn: att?.checkIn || null,
        checkInSource: att?.checkInSource || 'not_recorded',
        delayMinutes: att?.delayMinutes ?? 0,
        checkOut: att?.checkOut || null,
        checkOutSource: att?.checkOutSource || 'not_recorded',
        departureStatus: att?.departureStatus || 'not_recorded',
        earlyDepartureMinutes: att?.earlyDepartureMinutes ?? 0,
        overtimeMinutes: att?.overtimeMinutes ?? 0,
        durationMinutes: att?.durationMinutes ?? 0,
        verificationStatus: att?.verificationStatus || 'pending_review',
        verifiedBy: att?.verifiedBy?.toString(),
        verifiedAt: att?.verifiedAt,
        rejectionReason: att?.rejectionReason,
        corrections: att?.corrections || [],
        isAssigned: true,
        isStatusLocked: Boolean(att?.isStatusLocked),
        statusLockedAt: att?.statusLockedAt,
        statusLockedReason: att?.statusLockedReason,
        hasOpenConcern: Boolean(att?.hasOpenConcern),
        activeConcernId: att?.activeConcernId ? att.activeConcernId.toString() : null,
      };
    });

    const categoryReportingTimeMap = new Map<string, { latestTimestamp: Date | null; reportingTimeStr: string }>();

    for (const entry of assignmentEntries) {
      const typeKey = entry.workerType.trim();
      const timeValidation = isValidTimeString(entry.reportingTime);
      if (timeValidation.valid && timeValidation.normalized24h) {
        const dt = this.constructDateTime(event.date, timeValidation.normalized24h);
        const existing = categoryReportingTimeMap.get(typeKey);
        if (!existing || !existing.latestTimestamp || dt.getTime() > existing.latestTimestamp.getTime()) {
          categoryReportingTimeMap.set(typeKey, {
            latestTimestamp: dt,
            reportingTimeStr: entry.reportingTime,
          });
        }
      }
    }

    const distinctCategoriesMap = new Map<string, {
      workerType: string;
      totalAssigned: number;
      eligibleCount: number;
      absentCount: number;
      normalCount: number;
      earlyCount: number;
      overtimeCount: number;
      pendingCount: number;
      actualDepartureTime?: string | null;
      actualDepartureDate?: Date | null;
      checkInFinalized: boolean;
      checkInFinalizedAt?: Date | null;
      checkInFinalizedBy?: string | null;
      checkInChangesPending: boolean;
      checkInRevision: number;
      canFinalizeCheckIn: boolean;
      canReFinalizeCheckIn: boolean;
      canModifyCheckout: boolean;
      ineligibleOvertimeRequiredCount?: number;
    }>();

    for (const req of requirements) {
      const typeKey = req.workerType.trim();
      if (!distinctCategoriesMap.has(typeKey)) {
        const catDeparture = (session.categoryActualDepartures || []).find(
          (d) => d.workerType.trim().toLowerCase() === typeKey.toLowerCase()
        );
        const catConf = (session.categoryCheckInConfirmations || []).find(
          (c) => c.workerType.trim().toLowerCase() === typeKey.toLowerCase()
        );
        const catTiming = categoryReportingTimeMap.get(typeKey);

        const checkInFinalized = Boolean(catConf?.checkInFinalized);
        const checkInChangesPending = Boolean(catConf?.checkInChangesPending);
        const checkInRevision = catConf?.checkInRevision || (checkInFinalized ? 1 : 0);

        const canFinalizeCheckIn =
          !checkInFinalized &&
          (catTiming?.latestTimestamp ? now.getTime() >= catTiming.latestTimestamp.getTime() : false) &&
          event.status !== 'completed';

        const canReFinalizeCheckIn =
          Boolean(checkInFinalized && checkInChangesPending) &&
          event.status !== 'completed';

        const canModifyCheckout =
          Boolean(checkInFinalized && !checkInChangesPending) &&
          windowInfo.isEventDay &&
          !windowInfo.isAfterEventDay &&
          !windowInfo.isBeforeEventDay;

        distinctCategoriesMap.set(typeKey, {
          workerType: typeKey,
          totalAssigned: 0,
          eligibleCount: 0,
          absentCount: 0,
          normalCount: 0,
          earlyCount: 0,
          overtimeCount: 0,
          pendingCount: 0,
          actualDepartureTime: catDeparture?.actualDepartureTime || null,
          actualDepartureDate: catDeparture?.actualDepartureDate || null,
          checkInFinalized,
          checkInFinalizedAt: catConf?.checkInFinalizedAt || null,
          checkInFinalizedBy: catConf?.checkInFinalizedBy?.toString() || null,
          checkInChangesPending,
          checkInRevision,
          canFinalizeCheckIn,
          canReFinalizeCheckIn,
          canModifyCheckout,
          ineligibleOvertimeRequiredCount: 0,
        });
      }
    }

    let totalEligible = 0;
    let totalAbsent = 0;
    let totalNormal = 0;
    let totalEarly = 0;
    let totalOvertime = 0;
    let totalPending = 0;

    for (const item of roster) {
      const typeKey = item.workerType.trim();
      const catSum = distinctCategoriesMap.get(typeKey);
      if (catSum) catSum.totalAssigned++;

      const isAbsent = item.arrivalStatus === 'absent' || item.status === 'absent';
      if (isAbsent) {
        totalAbsent++;
        if (catSum) catSum.absentCount++;
      } else {
        totalEligible++;
        if (catSum) catSum.eligibleCount++;

        // Track partial eligibility: if category departure is set and worker checked in at or after departure
        if (
          catSum &&
          catSum.actualDepartureDate &&
          item.checkIn &&
          catSum.actualDepartureDate.getTime() <= item.checkIn.getTime() &&
          item.checkOutSource !== 'individual_exception'
        ) {
          catSum.ineligibleOvertimeRequiredCount = (catSum.ineligibleOvertimeRequiredCount || 0) + 1;
          (item as any).ineligibleForCategoryCheckout = true;
        }

        if (item.departureStatus === 'normal') {
          totalNormal++;
          if (catSum) catSum.normalCount++;
        } else if (item.departureStatus === 'early_departure') {
          totalEarly++;
          if (catSum) catSum.earlyCount++;
        } else if (item.departureStatus === 'overtime') {
          totalOvertime++;
          if (catSum) catSum.overtimeCount++;
        } else {
          totalPending++;
          if (catSum) catSum.pendingCount++;
        }
      }
    }

    const categorySummaries = Array.from(distinctCategoriesMap.values());

    const categoryCheckInConfirmations: CategoryCheckInConfirmationDTO[] = categorySummaries.map((cat) => {
      const c = (session.categoryCheckInConfirmations || []).find(
        (conf) => conf.workerType.trim().toLowerCase() === cat.workerType.toLowerCase()
      );
      return {
        workerType: cat.workerType,
        checkInFinalized: cat.checkInFinalized,
        checkInFinalizedAt: cat.checkInFinalizedAt,
        checkInFinalizedBy: cat.checkInFinalizedBy,
        checkInChangesPending: cat.checkInChangesPending,
        checkInRevision: cat.checkInRevision,
        checkInRevisions: (c?.checkInRevisions || []).map((r) => ({
          revision: r.revision,
          finalizedAt: r.finalizedAt,
          finalizedBy: r.finalizedBy?.toString(),
          committedSummary: r.committedSummary,
          changeReason: r.changeReason,
        })),
        canFinalizeCheckIn: cat.canFinalizeCheckIn,
        canReFinalizeCheckIn: cat.canReFinalizeCheckIn,
        canModifyCheckout: cat.canModifyCheckout,
      };
    });

    return {
      eventId,
      eventTitle: event.title,
      eventDate: event.date,
      isEventDay,
      isBeforeEventDay,
      isAfterEventDay,
      eventOperationalDate,
      currentOperationalDate,
      scheduledEventEndAt: windowInfo.scheduledEventEndAt,
      correctionDeadlineAt: windowInfo.correctionDeadlineAt,
      canNormalCorrect: windowInfo.canNormalCorrect,
      isAfterCorrectionDeadline: windowInfo.isAfterDeadline,
      canModifyCheckout: windowInfo.isEventDay && !windowInfo.isAfterEventDay && !windowInfo.isBeforeEventDay,
      checkoutModificationDeadlineAt: windowInfo.correctionDeadlineAt,
      checkoutModificationTimeRemainingMs: Math.max(0, windowInfo.correctionDeadlineAt.getTime() - now.getTime()),
      categoryActualDepartures: (session.categoryActualDepartures || []).map((d) => ({
        workerType: d.workerType,
        actualDepartureTime: d.actualDepartureTime,
        actualDepartureDate: d.actualDepartureDate,
        recordedBy: d.recordedBy?.toString(),
        recordedAt: d.recordedAt,
      })),
      categorySummaries,
      categoryCheckInConfirmations,
      totalEligibleWorkers: totalEligible,
      totalAbsentWorkers: totalAbsent,
      totalNormalWorkers: totalNormal,
      totalEarlyDepartureWorkers: totalEarly,
      totalOvertimeWorkers: totalOvertime,
      totalPendingWorkers: totalPending,
      openConcernsCount,
      checkInFinalized: session.checkInFinalized,
      checkInFinalizedAt: session.checkInFinalizedAt,
      checkInFinalizedBy: session.checkInFinalizedBy?.toString(),
      checkInChangesPending: Boolean(session.checkInChangesPending),
      checkInRevision: session.checkInRevision || (session.checkInFinalized ? 1 : 0),
      session: {
        checkInFinalized: session.checkInFinalized,
        checkInFinalizedAt: session.checkInFinalizedAt,
        checkInFinalizedBy: session.checkInFinalizedBy?.toString(),
        checkInChangesPending: Boolean(session.checkInChangesPending),
        checkInRevision: session.checkInRevision || (session.checkInFinalized ? 1 : 0),
        checkInRevisions: (session.checkInRevisions || []).map((r) => ({
          revision: r.revision,
          finalizedAt: r.finalizedAt,
          finalizedBy: r.finalizedBy?.toString(),
          committedSummary: r.committedSummary,
          changeReason: r.changeReason,
        })),
        categoryCheckInConfirmations,
        actualNormalFinishTime: session.actualNormalFinishTime,
        actualNormalFinishDate: session.actualNormalFinishDate,
        categoryActualDepartures: (session.categoryActualDepartures || []).map((d) => ({
          workerType: d.workerType,
          actualDepartureTime: d.actualDepartureTime,
          actualDepartureDate: d.actualDepartureDate,
          recordedBy: d.recordedBy?.toString(),
          recordedAt: d.recordedAt,
        })),
        categoryFinishTimes: (session.categoryFinishTimes || []).map((c) => ({
          workerType: c.workerType,
          normalFinishTime: c.normalFinishTime,
          normalFinishDate: c.normalFinishDate,
        })),
        requirementFinishOverrides: (session.requirementFinishOverrides || []).map((o) => ({
          requirementId: o.requirementId.toString(),
          normalFinishTime: o.normalFinishTime,
          normalFinishDate: o.normalFinishDate,
        })),
        checkOutFinalized: session.checkOutFinalized,
        checkOutFinalizedAt: session.checkOutFinalizedAt,
        lifecycleStatus: session.lifecycleStatus,
        verificationStatus: session.verificationStatus || 'pending_review',
        verifiedBy: session.verifiedBy?.toString(),
        verifiedAt: session.verifiedAt,
        rejectionReason: session.rejectionReason,
      },
      latestReportingTime: latestReportingTimeStr,
      latestReportingTimestamp,
      canFinalizeCheckIn,
      canReFinalizeCheckIn,
      canEditCheckIn,
      totalAssigned: roster.length,
      requirements: requirementItems,
      roster,
    };
  }

  /**
   * Records or updates an individual worker's check-in immediately upon manager confirmation.
   * Persists immediately to MongoDB with the compound key { eventId, workerId }.
   */
  async recordWorkerCheckIn(
    userId: string,
    userRole: string,
    eventId: string,
    workerId: string,
    payload: {
      arrivalStatus: 'on_time' | 'late' | 'absent';
      actualArrivalTime?: string;
      status?: 'checked_in' | 'absent';
    }
  ): Promise<AttendanceRosterItem> {
    // 1. Validate event and authorization
    const event = await this.validateEventAndOwnership(eventId, userId, userRole);

    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }
    if (event.status === 'completed') {
      throw ApiError.badRequest('Attendance check-in cannot be recorded on completed events');
    }
    if (!['confirmed', 'in_progress'].includes(event.status)) {
      throw ApiError.badRequest(
        `Cannot record check-in for event in '${event.status}' status. Event must be confirmed or in_progress.`
      );
    }

    // 2. Check if worker attendance record is permanently locked (§12)
    const existingRecord = await this.attRepo.findByEventAndWorker(eventId, workerId);
    if (existingRecord?.isStatusLocked) {
      throw ApiError.forbidden('Attendance record is permanently locked and cannot be modified');
    }

    // Operation 1 vs Operation 2 Separation:
    // If an attendance record already exists for this worker, reject the initial check-in API.
    // Callers must use the correction API (PATCH /api/attendance/records/:attendanceId/correct).
    if (existingRecord && existingRecord.arrivalStatus !== 'unrecorded') {
      throw ApiError.badRequest(
        `Attendance record already exists for this worker. Use the correction API ('PATCH /api/attendance/records/${existingRecord._id}/correct') to modify existing attendance records.`
      );
    }

    // 3. Check session state
    const session = await this.sessionRepo.getOrCreateSession(eventId);
    if (session.checkOutFinalized) {
      throw ApiError.badRequest('Cannot record check-in: checkout has already been finalized for this event');
    }

    // 4. Check event-day restrictions
    const now = new Date();
    const currentOperationalDate = getOperationalDateString(now, 'Asia/Kolkata');
    const eventOperationalDate = getOperationalDateString(event.date, 'Asia/Kolkata');

    if (currentOperationalDate < eventOperationalDate) {
      throw ApiError.badRequest(
        'Initial attendance marks can only be recorded on the scheduled event day (cannot mark before event day)'
      );
    }
    if (currentOperationalDate > eventOperationalDate) {
      throw ApiError.forbidden(
        'Check-in editing is closed because the scheduled event day has ended'
      );
    }

    // 2b. Retrieve session and check finalization status
    const sessionDoc = await this.sessionRepo.getOrCreateSession(eventId);
    if (sessionDoc.checkOutFinalized) {
      throw ApiError.badRequest('Checkout has already been finalized. Use the correction workflow to modify attendance.');
    }

    // 3. Find worker assignment in active work requirements
    const requirements = await WorkRequirement.find({
      eventId: new mongoose.Types.ObjectId(eventId),
      status: { $ne: 'cancelled' },
    });

    let assignedReq: IWorkRequirement | null = null;
    for (const req of requirements) {
      if (req.assignedWorkers && req.assignedWorkers.some((a) => a.workerId.toString() === workerId)) {
        assignedReq = req;
        break;
      }
    }

    if (!assignedReq) {
      throw ApiError.badRequest(`Worker '${workerId}' is not in the assigned roster for this event`);
    }

    // 4. Resolve worker User document
    const workerUser = await User.findById(workerId).select('name email phone businessId');
    if (!workerUser) {
      throw ApiError.notFound('Worker user account not found');
    }

    // 5. Parse and validate scheduled reporting time
    const repTimeVal = isValidTimeString(assignedReq.reportingTime);
    if (!repTimeVal.valid || !repTimeVal.normalized24h) {
      throw ApiError.badRequest(`Invalid scheduled reporting time format '${assignedReq.reportingTime}' on requirement`);
    }
    const repDate = this.constructDateTime(event.date, repTimeVal.normalized24h);
    const [repHours] = repTimeVal.normalized24h.split(':');

    // 6. Determine arrival timestamps and source
    let checkIn: Date | null = null;
    let checkInSource: 'manager_actual' | 'system_default' | 'not_recorded' = 'not_recorded';
    let delayMinutes = 0;
    const finalArrivalStatus: ArrivalStatus = payload.arrivalStatus;
    const finalStatus: 'checked_in' | 'absent' =
      finalArrivalStatus === 'absent' || payload.status === 'absent' ? 'absent' : 'checked_in';

    if (finalArrivalStatus === 'on_time') {
      checkIn = repDate;
      checkInSource = 'system_default';
      delayMinutes = 0;
    } else if (finalArrivalStatus === 'late') {
      if (!payload.actualArrivalTime || typeof payload.actualArrivalTime !== 'string') {
        throw ApiError.badRequest('Actual arrival time is required for late check-in');
      }
      const arrVal = isValidTimeString(payload.actualArrivalTime);
      if (!arrVal.valid || !arrVal.normalized24h) {
        throw ApiError.badRequest(`Invalid arrival time '${payload.actualArrivalTime}'`);
      }
      let arrDate = this.constructDateTime(event.date, arrVal.normalized24h);
      const [arrHours] = arrVal.normalized24h.split(':');

      // Overnight shift edge case
      if (arrDate.getTime() < repDate.getTime() && parseInt(arrHours, 10) < 12 && parseInt(repHours, 10) >= 12) {
        arrDate = new Date(arrDate.getTime() + 24 * 60 * 60 * 1000);
      }

      if (arrDate.getTime() <= repDate.getTime()) {
        throw ApiError.badRequest(
          `Actual arrival time '${payload.actualArrivalTime}' must be later than reporting time '${assignedReq.reportingTime}'`
        );
      }

      delayMinutes = Math.round((arrDate.getTime() - repDate.getTime()) / 60000);
      checkIn = arrDate;
      checkInSource = 'manager_actual';
    } else if (finalArrivalStatus === 'absent') {
      checkIn = null;
      checkInSource = 'not_recorded';
      delayMinutes = 0;
    }

    const managerObjectId = new mongoose.Types.ObjectId(userId);

    // Check if status changed compared to existing record
    const isStatusChanged =
      !existingRecord ||
      existingRecord.arrivalStatus !== finalArrivalStatus ||
      (finalArrivalStatus === 'late' && existingRecord.checkIn?.getTime() !== checkIn?.getTime());

    let correction: any = undefined;
    if (existingRecord && isStatusChanged && existingRecord.arrivalStatus !== 'unrecorded') {
      const formatTime = (d?: Date | null) =>
        d ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '';

      correction = {
        modifiedBy: managerObjectId,
        modifiedAt: now,
        field: 'arrivalStatus',
        previousValue: existingRecord.checkIn ? formatTime(existingRecord.checkIn) : existingRecord.arrivalStatus,
        previousSource: existingRecord.checkInSource,
        previousStatus: existingRecord.status,
        previousArrivalStatus: existingRecord.arrivalStatus,
        previousDepartureStatus: existingRecord.departureStatus,
        newValue: checkIn ? formatTime(checkIn) : finalArrivalStatus,
        newSource: checkInSource,
        newStatus: finalStatus,
        newArrivalStatus: finalArrivalStatus,
        newDepartureStatus: existingRecord.departureStatus,
        reason:
          (payload as any).reason ||
          (finalArrivalStatus === 'late'
            ? `Updated arrival time to ${payload.actualArrivalTime}`
            : `Updated status to ${finalArrivalStatus}`),
      };
    }

    // 7. Atomically upsert the Attendance document
    const updateData: any = {
      eventId: new mongoose.Types.ObjectId(eventId),
      requirementId: assignedReq._id,
      workerId: new mongoose.Types.ObjectId(workerId),
      workerType: assignedReq.workerType,
      reportingTimeSnapshot: assignedReq.reportingTime,
      checkIn,
      checkInSource,
      arrivalStatus: finalArrivalStatus,
      delayMinutes,
      checkInRecordedBy: managerObjectId,
      checkInRecordedAt: now,
      status: finalStatus,
      verificationStatus: 'pending_review',
      durationMinutes: 0,
    };

    const savedRecord = await this.attRepo.upsertIndividualCheckIn(eventId, workerId, updateData, correction);
    if (!savedRecord) {
      throw ApiError.internal('Failed to persist individual worker check-in');
    }

    if (session.checkInFinalized) {
      await this.sessionRepo.markCheckInChangesPending(eventId);
    }
    await this.sessionRepo.markCategoryCheckInChangesPending(eventId, assignedReq.workerType);

    // Dispatch worker notification if status is Late or Absent, and status effectively changed
    if (isStatusChanged && (finalArrivalStatus === 'late' || finalArrivalStatus === 'absent')) {
      try {
        const isLate = finalArrivalStatus === 'late';
        const title = isLate
          ? `Attendance Update: Marked Late for ${event.title}`
          : `Attendance Update: Marked Absent for ${event.title}`;
        const message = isLate
          ? `You have been marked LATE for ${event.title}.\n\nYour recorded arrival time is ${payload.actualArrivalTime}.\n\nPlease note that this attendance status may affect your performance record. If you believe the information is incorrect, please contact your Event Manager.`
          : `You have been marked ABSENT for ${event.title}.\n\nPlease note that this attendance status may affect your performance record. If you believe the information is incorrect, please contact your Event Manager.`;

        await notificationService.createNotification({
          recipientId: workerId,
          type: `attendance_marked_${finalArrivalStatus}`,
          title,
          message,
          resourceType: 'attendance',
          resourceId: savedRecord._id.toString(),
          destinationRoute: '/worker',
          deduplicationKey: `attendance_${eventId}_${workerId}_${finalArrivalStatus}_${checkIn ? checkIn.getTime() : 'absent'}`,
          metadata: {
            eventId,
            workerId,
            arrivalStatus: finalArrivalStatus,
            checkIn: checkIn ? checkIn.toISOString() : null,
          },
        });
      } catch (notifErr: any) {
        console.warn('⚠️ [AttendanceService] Failed to dispatch worker attendance notification:', notifErr.message);
      }
    }

    return {
      workerId,
      workerName: workerUser.name,
      workerEmail: workerUser.email,
      workerPhone: workerUser.phone || '',
      businessId: workerUser.businessId || '',
      workerType: assignedReq.workerType,
      requirementId: assignedReq._id.toString(),
      reportingTime: assignedReq.reportingTime,
      reportingTimeSnapshot: savedRecord.reportingTimeSnapshot,
      applicableNormalFinishTimeSnapshot: savedRecord.applicableNormalFinishTimeSnapshot,
      applicableNormalFinishDate: savedRecord.applicableNormalFinishDate || null,
      attendanceId: savedRecord._id.toString(),
      status: savedRecord.status,
      arrivalStatus: savedRecord.arrivalStatus,
      checkIn: savedRecord.checkIn || null,
      checkInSource: savedRecord.checkInSource,
      delayMinutes: savedRecord.delayMinutes,
      checkOut: savedRecord.checkOut || null,
      checkOutSource: savedRecord.checkOutSource,
      departureStatus: savedRecord.departureStatus,
      earlyDepartureMinutes: savedRecord.earlyDepartureMinutes ?? 0,
      overtimeMinutes: savedRecord.overtimeMinutes ?? 0,
      durationMinutes: savedRecord.durationMinutes ?? 0,
      verificationStatus: savedRecord.verificationStatus,
      verifiedBy: savedRecord.verifiedBy?.toString(),
      verifiedAt: savedRecord.verifiedAt,
      rejectionReason: savedRecord.rejectionReason,
      corrections: savedRecord.corrections || [],
      isAssigned: true,
    };
  }

  /**
   * POST /api/attendance/events/:eventId/categories/:workerType/finalize-checkin
   * Executes manager-controlled exception-based check-in confirmation specifically for a single worker category.
   */
  async finalizeCategoryCheckIn(
    userId: string,
    userRole: string,
    eventId: string,
    workerType: string,
    idempotencyKey: string,
    payload: FinalizeCheckInPayload,
    options?: { skipTimingGuard?: boolean }
  ): Promise<FinalizeCategoryCheckInSummary> {
    // 1. Mandatory Idempotency-Key validation
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw ApiError.badRequest('Idempotency-Key header is required');
    }
    const cleanIdempotencyKey = idempotencyKey.trim();

    // 2. Validate event and authorization
    const event = await this.validateEventAndOwnership(eventId, userId, userRole);

    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }
    if (event.status === 'completed') {
      throw ApiError.badRequest('Attendance check-in cannot be confirmed on completed events');
    }
    if (!['confirmed', 'in_progress'].includes(event.status)) {
      throw ApiError.badRequest(
        `Cannot confirm check-in for event in '${event.status}' status. Event must be confirmed or in_progress.`
      );
    }

    // 3. Retrieve or safely initialize the session
    const sessionDoc = await this.sessionRepo.getOrCreateSession(eventId);

    const now = new Date();
    const windowInfo = calculateEventCorrectionWindow(event, now);

    // 4. Validate category exists in event requirements
    const requirements = await WorkRequirement.find({
      eventId: new mongoose.Types.ObjectId(eventId),
      status: { $ne: 'cancelled' },
    });

    const categoryRequirements = requirements.filter(
      (r) => r.workerType.trim().toLowerCase() === workerType.trim().toLowerCase()
    );

    if (categoryRequirements.length === 0) {
      throw ApiError.badRequest(`Worker category '${workerType}' is not required for this event`);
    }

    // 5. Gather assigned workers in THIS category
    const categoryWorkerMap = new Map<
      string,
      {
        workerId: string;
        workerType: string;
        requirementId: string;
        reportingTime: string;
      }
    >();

    for (const req of categoryRequirements) {
      if (req.assignedWorkers && req.assignedWorkers.length > 0) {
        for (const assigned of req.assignedWorkers) {
          const wId = assigned.workerId.toString();
          if (!categoryWorkerMap.has(wId)) {
            categoryWorkerMap.set(wId, {
              workerId: wId,
              workerType: req.workerType,
              requirementId: req._id.toString(),
              reportingTime: req.reportingTime,
            });
          }
        }
      }
    }

    if (categoryWorkerMap.size === 0) {
      throw ApiError.badRequest(
        `Cannot confirm check-in: No workers are assigned to category '${workerType}' for this event`
      );
    }

    // 6. Check existing category confirmation
    const existingCatConf = (sessionDoc.categoryCheckInConfirmations || []).find(
      (c) => c.workerType.trim().toLowerCase() === workerType.trim().toLowerCase()
    );

    const isReFinalization = Boolean(existingCatConf?.checkInFinalized);
    const payloadHash = this.computePayloadHash(payload);

    if (existingCatConf?.checkInFinalized) {
      const persistedIdem = existingCatConf.checkInIdempotency;
      if (persistedIdem?.idempotencyKey === cleanIdempotencyKey) {
        if (persistedIdem.payloadHash === payloadHash) {
          return persistedIdem.committedSummary as unknown as FinalizeCategoryCheckInSummary;
        }
        throw ApiError.conflict('Idempotency key collision: previous check-in confirmed with different payload');
      }
      // If after event day, reject new exceptions with 403 Forbidden
      const lateExceptions = payload.lateExceptions || [];
      const absentExceptions = payload.absentExceptions || [];
      if (isReFinalization && windowInfo.isAfterEventDay && (lateExceptions.length > 0 || absentExceptions.length > 0)) {
        throw ApiError.forbidden(
          'Check-in editing is closed because the scheduled event day has ended. Cannot submit new check-in exceptions after event day.'
        );
      }

      if (!existingCatConf.checkInChangesPending) {
        throw ApiError.conflict(
          `Check-in for category '${workerType}' has already been confirmed and no changes are pending`
        );
      }
    }

    // 7. Validate exception lists against roster for THIS category
    const lateExceptions = payload.lateExceptions || [];
    const absentExceptions = payload.absentExceptions || [];

    const lateWorkerIds = new Set<string>();
    const absentWorkerIds = new Set<string>();

    for (const late of lateExceptions) {
      if (!categoryWorkerMap.has(late.workerId)) {
        throw ApiError.badRequest(
          `Worker '${late.workerId}' is not in the assigned roster for category '${workerType}'`
        );
      }
      if (lateWorkerIds.has(late.workerId)) {
        throw ApiError.badRequest(`Duplicate workerId '${late.workerId}' in lateExceptions`);
      }
      lateWorkerIds.add(late.workerId);
    }

    for (const wId of absentExceptions) {
      if (!categoryWorkerMap.has(wId)) {
        throw ApiError.badRequest(`Worker '${wId}' is not in the assigned roster for category '${workerType}'`);
      }
      if (absentWorkerIds.has(wId)) {
        throw ApiError.badRequest(`Duplicate workerId '${wId}' in absentExceptions`);
      }
      if (lateWorkerIds.has(wId)) {
        throw ApiError.badRequest(`Worker '${wId}' cannot be marked both late and absent`);
      }
      absentWorkerIds.add(wId);
    }

    // 8. Timing Guard Calculation for THIS category
    let latestReportingTimestamp: Date | null = null;
    let latestReportingTimeStr = '';

    const workerReportingDateMap = new Map<string, Date>();

    for (const [wId, workerInfo] of categoryWorkerMap.entries()) {
      const timeValidation = isValidTimeString(workerInfo.reportingTime);
      if (!timeValidation.valid || !timeValidation.normalized24h) {
        throw ApiError.internal(`Malformed reporting time in requirement for worker ${wId}`);
      }
      const reportingDateTime = this.constructDateTime(event.date, timeValidation.normalized24h);
      workerReportingDateMap.set(wId, reportingDateTime);

      if (!latestReportingTimestamp || reportingDateTime.getTime() > latestReportingTimestamp.getTime()) {
        latestReportingTimestamp = reportingDateTime;
        latestReportingTimeStr = workerInfo.reportingTime;
      }
    }

    const currentOperationalDate = getOperationalDateString(now, 'Asia/Kolkata');
    const eventOperationalDate = getOperationalDateString(event.date, 'Asia/Kolkata');

    const shouldCheckTimingGuard =
      !options?.skipTimingGuard &&
      process.env.NODE_ENV !== 'test';

    if (shouldCheckTimingGuard) {
      if (currentOperationalDate < eventOperationalDate) {
        throw ApiError.badRequest(
          `Cannot confirm check-in before the scheduled event date (${eventOperationalDate})`
        );
      }
      if (latestReportingTimestamp && now.getTime() < latestReportingTimestamp.getTime()) {
        throw ApiError.badRequest(
          `Cannot confirm check-in before scheduled reporting time (${latestReportingTimeStr})`
        );
      }
    }

    // 9. Load existing attendance records for THIS category
    const existingRecords = await this.attRepo.findByEventAndWorkerType(eventId, workerType);
    const existingMap = new Map<string, IAttendance>();
    for (const rec of existingRecords) {
      const wId = (rec.workerId as any)?._id?.toString() || rec.workerId?.toString();
      if (wId) {
        existingMap.set(wId, rec);
      }
    }

    let onTimeCount = 0;
    let lateCount = 0;
    let absentCount = 0;

    await runInTransaction(async (dbSession) => {
      for (const [wId, workerInfo] of categoryWorkerMap.entries()) {
        const existingAtt = existingMap.get(wId);
        const reportingDate = workerReportingDateMap.get(wId)!;

        // If locked by closed concern, skip modifying arrival
        if (existingAtt?.isStatusLocked) {
          if (existingAtt.arrivalStatus === 'absent' || existingAtt.status === 'absent') {
            absentCount++;
          } else if (existingAtt.arrivalStatus === 'late') {
            lateCount++;
          } else {
            onTimeCount++;
          }
          continue;
        }

        if (absentWorkerIds.has(wId)) {
          // Absent exception
          absentCount++;
          if (existingAtt) {
            existingAtt.arrivalStatus = 'absent';
            existingAtt.status = 'absent';
            existingAtt.checkIn = undefined;
            existingAtt.checkInSource = 'manager_actual';
            existingAtt.delayMinutes = 0;
            existingAtt.checkInRecordedBy = new mongoose.Types.ObjectId(userId);
            existingAtt.checkInRecordedAt = now;
            // Clear checkout if worker transitioned to absent
            existingAtt.checkOut = undefined;
            existingAtt.checkOutSource = 'not_recorded';
            existingAtt.departureStatus = 'not_recorded';
            existingAtt.durationMinutes = 0;
            await existingAtt.save({ session: dbSession });
          } else {
            const newAtt = new Attendance({
              eventId: new mongoose.Types.ObjectId(eventId),
              requirementId: new mongoose.Types.ObjectId(workerInfo.requirementId),
              workerId: new mongoose.Types.ObjectId(wId),
              workerType: workerInfo.workerType,
              reportingTimeSnapshot: workerInfo.reportingTime,
              checkIn: undefined,
              checkInSource: 'manager_actual',
              arrivalStatus: 'absent',
              delayMinutes: 0,
              durationMinutes: 0,
              status: 'absent',
              verificationStatus: 'pending_review',
              checkInRecordedBy: new mongoose.Types.ObjectId(userId),
              checkInRecordedAt: now,
              isStatusLocked: false,
              hasOpenConcern: false,
              corrections: [],
            });
            await newAtt.save({ session: dbSession });
          }
        } else if (lateWorkerIds.has(wId)) {
          // Late exception
          lateCount++;
          const lateItem = lateExceptions.find((l) => l.workerId === wId)!;
          const timeValidation = isValidTimeString(lateItem.actualArrivalTime);
          const actualArrivalDate = this.constructDateTime(event.date, timeValidation.normalized24h!);
          const delayMinutes = Math.max(0, Math.floor((actualArrivalDate.getTime() - reportingDate.getTime()) / 60000));

          if (existingAtt) {
            existingAtt.arrivalStatus = 'late';
            existingAtt.status = existingAtt.status === 'checked_out' ? 'checked_out' : 'checked_in';
            existingAtt.checkIn = actualArrivalDate;
            existingAtt.checkInSource = 'manager_actual';
            existingAtt.delayMinutes = delayMinutes;
            existingAtt.checkInRecordedBy = new mongoose.Types.ObjectId(userId);
            existingAtt.checkInRecordedAt = now;
            if (existingAtt.checkOut) {
              existingAtt.durationMinutes = Math.max(0, Math.floor((existingAtt.checkOut.getTime() - actualArrivalDate.getTime()) / 60000));
            }
            await existingAtt.save({ session: dbSession });
          } else {
            const newAtt = new Attendance({
              eventId: new mongoose.Types.ObjectId(eventId),
              requirementId: new mongoose.Types.ObjectId(workerInfo.requirementId),
              workerId: new mongoose.Types.ObjectId(wId),
              workerType: workerInfo.workerType,
              reportingTimeSnapshot: workerInfo.reportingTime,
              checkIn: actualArrivalDate,
              checkInSource: 'manager_actual',
              arrivalStatus: 'late',
              delayMinutes,
              durationMinutes: 0,
              status: 'checked_in',
              verificationStatus: 'pending_review',
              checkInRecordedBy: new mongoose.Types.ObjectId(userId),
              checkInRecordedAt: now,
              isStatusLocked: false,
              hasOpenConcern: false,
              corrections: [],
            });
            await newAtt.save({ session: dbSession });
          }
        } else {
          // Default Present / on-time
          if (existingAtt && existingAtt.arrivalStatus !== 'unrecorded') {
            if (existingAtt.arrivalStatus === 'absent' || existingAtt.status === 'absent') {
              absentCount++;
            } else if (existingAtt.arrivalStatus === 'late') {
              lateCount++;
            } else {
              onTimeCount++;
            }
          } else {
            onTimeCount++;
            if (existingAtt) {
              existingAtt.arrivalStatus = 'on_time';
              existingAtt.status = existingAtt.status === 'checked_out' ? 'checked_out' : 'checked_in';
              existingAtt.checkIn = reportingDate;
              existingAtt.checkInSource = 'system_default';
              existingAtt.delayMinutes = 0;
              existingAtt.checkInRecordedBy = new mongoose.Types.ObjectId(userId);
              existingAtt.checkInRecordedAt = now;
              if (existingAtt.checkOut) {
                existingAtt.durationMinutes = Math.max(0, Math.floor((existingAtt.checkOut.getTime() - reportingDate.getTime()) / 60000));
              }
              await existingAtt.save({ session: dbSession });
            } else {
              const newAtt = new Attendance({
                eventId: new mongoose.Types.ObjectId(eventId),
                requirementId: new mongoose.Types.ObjectId(workerInfo.requirementId),
                workerId: new mongoose.Types.ObjectId(wId),
                workerType: workerInfo.workerType,
                reportingTimeSnapshot: workerInfo.reportingTime,
                checkIn: reportingDate,
                checkInSource: 'system_default',
                arrivalStatus: 'on_time',
                delayMinutes: 0,
                durationMinutes: 0,
                status: 'checked_in',
                verificationStatus: 'pending_review',
                checkInRecordedBy: new mongoose.Types.ObjectId(userId),
                checkInRecordedAt: now,
                isStatusLocked: false,
                hasOpenConcern: false,
                corrections: [],
              });
              await newAtt.save({ session: dbSession });
            }
          }
        }
      }

      // 10. Persist category confirmation atomically
      const currentRev = (existingCatConf?.checkInRevision || 0) + 1;
      const committedSummary = {
        eventId,
        workerType,
        totalProcessed: categoryWorkerMap.size,
        onTimeCount,
        lateCount,
        absentCount,
        checkInFinalized: true,
        checkInFinalizedAt: now.toISOString(),
        checkInRevision: currentRev,
        checkInChangesPending: false,
      };

      const idempotencyRecord: IFinalizationIdempotency = {
        idempotencyKey: cleanIdempotencyKey,
        payloadHash,
        finalizedAt: now,
        finalizedBy: new mongoose.Types.ObjectId(userId),
        committedSummary,
      };

      await this.sessionRepo.atomicConfirmCategoryCheckIn(
        eventId,
        workerType,
        {
          finalizedBy: new mongoose.Types.ObjectId(userId),
          finalizedAt: now,
          idempotencyRecord,
          committedSummary,
          changeReason:
            payload.reason ||
            (isReFinalization
              ? 'Re-confirmed check-in after attendance changes'
              : 'Initial check-in confirmation'),
          isReFinalize: isReFinalization,
        },
        dbSession
      );
    });

    const refreshedSession = await this.sessionRepo.findByEventId(eventId);
    const updatedConf = (refreshedSession?.categoryCheckInConfirmations || []).find(
      (c) => c.workerType.trim().toLowerCase() === workerType.trim().toLowerCase()
    );

    return {
      eventId,
      workerType,
      totalProcessed: categoryWorkerMap.size,
      onTimeCount,
      lateCount,
      absentCount,
      checkInFinalized: true,
      checkInFinalizedAt: now.toISOString(),
      checkInRevision: updatedConf?.checkInRevision || 1,
      checkInChangesPending: false,
    };
  }

  /**
   * 3. POST /api/attendance/events/:eventId/finalize-checkin
   * Executes manager-controlled exception-based check-in finalization with transaction and idempotency.
   */
  async finalizeCheckIn(
    userId: string,
    userRole: string,
    eventId: string,
    idempotencyKey: string,
    payload: FinalizeCheckInPayload,
    options?: { skipTimingGuard?: boolean }
  ): Promise<FinalizeCheckInSummary> {
    // 1. Mandatory Idempotency-Key header validation
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw ApiError.badRequest('Idempotency-Key header is required');
    }
    const cleanIdempotencyKey = idempotencyKey.trim();

    // 2. Validate event and authorization
    const event = await this.validateEventAndOwnership(eventId, userId, userRole);

    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }
    if (event.status === 'completed') {
      throw ApiError.badRequest('Attendance check-in cannot be finalized on completed events');
    }
    if (!['confirmed', 'in_progress'].includes(event.status)) {
      throw ApiError.badRequest(
        `Cannot finalize check-in for event in '${event.status}' status. Event must be confirmed or in_progress.`
      );
    }

    // 3. Retrieve or safely initialize the session
    const sessionDoc = await this.sessionRepo.getOrCreateSession(eventId);

    const now = new Date();
    const windowInfo = calculateEventCorrectionWindow(event, now);

    // 4. Compute stable payload hash
    const payloadHash = this.computePayloadHash(payload);

    const isReFinalization = Boolean(sessionDoc.checkInFinalized);

    // 5. Idempotency & Re-finalization Evaluation
    if (sessionDoc.checkInFinalized) {
      const persistedIdem = sessionDoc.checkInIdempotency;
      if (persistedIdem?.idempotencyKey === cleanIdempotencyKey) {
        if (persistedIdem.payloadHash === payloadHash) {
          // Replay of identical request: return previous committed summary
          return persistedIdem.committedSummary as unknown as FinalizeCheckInSummary;
        }
        // Same key, different payload -> 409 Conflict
        throw ApiError.conflict('Idempotency key collision: previous check-in finalized with different payload');
      }
      if (!sessionDoc.checkInChangesPending) {
        throw ApiError.conflict('Check-in has already been finalized and no changes are pending');
      }
    }

    // 6. Gather active assigned workers from non-cancelled requirements
    const requirements = await WorkRequirement.find({
      eventId: new mongoose.Types.ObjectId(eventId),
      status: { $ne: 'cancelled' },
    });

    const assignedWorkerMap = new Map<
      string,
      {
        workerId: string;
        workerType: string;
        requirementId: string;
        reportingTime: string;
      }
    >();

    for (const req of requirements) {
      if (req.assignedWorkers && req.assignedWorkers.length > 0) {
        for (const assigned of req.assignedWorkers) {
          const wId = assigned.workerId.toString();
          if (!assignedWorkerMap.has(wId)) {
            assignedWorkerMap.set(wId, {
              workerId: wId,
              workerType: req.workerType,
              requirementId: req._id.toString(),
              reportingTime: req.reportingTime,
            });
          }
        }
      }
    }

    if (assignedWorkerMap.size === 0) {
      throw ApiError.badRequest('Cannot finalize check-in: No workers are assigned to this event');
    }

    // 7. Validate exception lists against roster
    const lateExceptions = payload.lateExceptions || [];
    const absentExceptions = payload.absentExceptions || [];

    // If after event day and re-finalizing, do not allow introducing new exceptions via payload
    if (isReFinalization && windowInfo.isAfterEventDay && (lateExceptions.length > 0 || absentExceptions.length > 0)) {
      throw ApiError.forbidden(
        'Check-in editing is closed because the scheduled event day has ended. Cannot submit new check-in exceptions after event day.'
      );
    }

    const lateWorkerIds = new Set<string>();
    const absentWorkerIds = new Set<string>();

    for (const late of lateExceptions) {
      if (!assignedWorkerMap.has(late.workerId)) {
        throw ApiError.badRequest(`Worker '${late.workerId}' is not in the assigned roster for this event`);
      }
      if (lateWorkerIds.has(late.workerId)) {
        throw ApiError.badRequest(`Duplicate workerId '${late.workerId}' in lateExceptions`);
      }
      lateWorkerIds.add(late.workerId);
    }

    for (const wId of absentExceptions) {
      if (!assignedWorkerMap.has(wId)) {
        throw ApiError.badRequest(`Worker '${wId}' is not in the assigned roster for this event`);
      }
      if (absentWorkerIds.has(wId)) {
        throw ApiError.badRequest(`Duplicate workerId '${wId}' in absentExceptions`);
      }
      if (lateWorkerIds.has(wId)) {
        throw ApiError.badRequest(`Worker '${wId}' cannot be marked both late and absent`);
      }
      absentWorkerIds.add(wId);
    }

    // 8. Timing Guard Calculation
    let latestReportingTimestamp: Date | null = null;
    let latestReportingTimeStr = '';

    const workerReportingDateMap = new Map<string, Date>();

    for (const [wId, workerInfo] of assignedWorkerMap.entries()) {
      const timeValidation = isValidTimeString(workerInfo.reportingTime);
      if (!timeValidation.valid || !timeValidation.normalized24h) {
        throw ApiError.badRequest(
          `Invalid reporting time format '${workerInfo.reportingTime}' on requirement '${workerInfo.requirementId}'`
        );
      }
      const repDate = this.constructDateTime(event.date, timeValidation.normalized24h);
      workerReportingDateMap.set(wId, repDate);

      if (!latestReportingTimestamp || repDate.getTime() > latestReportingTimestamp.getTime()) {
        latestReportingTimestamp = repDate;
        latestReportingTimeStr = workerInfo.reportingTime;
      }
    }

    if (!options?.skipTimingGuard && latestReportingTimestamp && now.getTime() < latestReportingTimestamp.getTime()) {
      throw ApiError.badRequest(
        `Cannot finalize check-in before the latest reporting time (${latestReportingTimeStr}). ` +
        `Check-in finalization becomes available at ${latestReportingTimestamp.toISOString()} once all assigned worker shifts have commenced.`
      );
    }

    // 9. Validate late arrival times (must be strictly later than reporting time)
    const lateDataMap = new Map<string, { arrivalDate: Date; delayMinutes: number }>();

    for (const late of lateExceptions) {
      const repDate = workerReportingDateMap.get(late.workerId)!;
      const arrValidation = isValidTimeString(late.actualArrivalTime);
      if (!arrValidation.valid || !arrValidation.normalized24h) {
        throw ApiError.badRequest(`Invalid arrival time '${late.actualArrivalTime}' for worker '${late.workerId}'`);
      }

      let arrDate = this.constructDateTime(event.date, arrValidation.normalized24h);

      // Handle overnight shift edge case (arrival past midnight)
      const [repHours] = isValidTimeString(assignedWorkerMap.get(late.workerId)!.reportingTime).normalized24h!.split(':');
      const [arrHours] = arrValidation.normalized24h.split(':');
      if (arrDate.getTime() < repDate.getTime() && parseInt(arrHours, 10) < 12 && parseInt(repHours, 10) >= 12) {
        arrDate = new Date(arrDate.getTime() + 24 * 60 * 60 * 1000);
      }

      if (arrDate.getTime() <= repDate.getTime()) {
        throw ApiError.badRequest(
          `Worker '${late.workerId}' actual arrival time '${late.actualArrivalTime}' must be later than reporting time '${assignedWorkerMap.get(late.workerId)!.reportingTime}'`
        );
      }

      const delayMinutes = Math.round((arrDate.getTime() - repDate.getTime()) / 60000);
      lateDataMap.set(late.workerId, { arrivalDate: arrDate, delayMinutes });
    }

    // 10. Build Attendance Documents for All Assigned Workers
    // Retrieve any individual check-in records already saved prior to finalization
    const existingAttendances = await this.attRepo.findByEventId(eventId);
    const existingAttMap = new Map<string, IAttendance>();
    for (const att of existingAttendances) {
      const attWorkerId = (att.workerId as any)?._id?.toString() || att.workerId?.toString();
      if (attWorkerId) existingAttMap.set(attWorkerId, att);
    }

    const attendanceRecordsToUpsert: any[] = [];
    const managerObjectId = new mongoose.Types.ObjectId(userId);

    for (const [wId, workerInfo] of assignedWorkerMap.entries()) {
      const repDate = workerReportingDateMap.get(wId)!;
      const existing = existingAttMap.get(wId);

      // Mandatory Rule 5: Closed concerns remain permanently locked.
      // If worker arrival info is locked, do not modify arrival status or check-in timestamp.
      if (existing?.isStatusLocked) {
        let durationMinutes = existing.durationMinutes ?? 0;
        if (existing.checkOut && existing.checkIn) {
          durationMinutes = Math.floor((existing.checkOut.getTime() - existing.checkIn.getTime()) / 60000);
        }
        attendanceRecordsToUpsert.push({
          eventId: new mongoose.Types.ObjectId(eventId),
          requirementId: new mongoose.Types.ObjectId(workerInfo.requirementId),
          workerId: new mongoose.Types.ObjectId(wId),
          workerType: workerInfo.workerType,
          reportingTimeSnapshot: existing.reportingTimeSnapshot || workerInfo.reportingTime,
          checkIn: existing.checkIn || null,
          checkInSource: existing.checkInSource,
          arrivalStatus: existing.arrivalStatus,
          delayMinutes: existing.delayMinutes ?? 0,
          checkInRecordedBy: existing.checkInRecordedBy || managerObjectId,
          checkInRecordedAt: existing.checkInRecordedAt || now,
          status: existing.status,
          verificationStatus: existing.verificationStatus || 'pending_review',
          checkOut: existing.checkOut,
          checkOutSource: existing.checkOutSource,
          departureStatus: existing.departureStatus,
          earlyDepartureMinutes: existing.earlyDepartureMinutes,
          overtimeMinutes: existing.overtimeMinutes,
          durationMinutes,
          isStatusLocked: true,
          statusLockedAt: existing.statusLockedAt,
          statusLockedReason: existing.statusLockedReason,
          statusLockedBy: existing.statusLockedBy,
          hasOpenConcern: existing.hasOpenConcern,
          activeConcernId: existing.activeConcernId,
        });
        continue;
      }

      if (lateWorkerIds.has(wId)) {
        // Late worker from payload exception
        const lateInfo = lateDataMap.get(wId)!;
        if (existing?.checkOut && existing.checkOut.getTime() <= lateInfo.arrivalDate.getTime()) {
          throw ApiError.badRequest(
            `Worker '${wId}' checkout time must be later than corrected arrival time`
          );
        }
        let durationMinutes = 0;
        if (existing?.checkOut) {
          durationMinutes = Math.floor((existing.checkOut.getTime() - lateInfo.arrivalDate.getTime()) / 60000);
        }
        attendanceRecordsToUpsert.push({
          eventId: new mongoose.Types.ObjectId(eventId),
          requirementId: new mongoose.Types.ObjectId(workerInfo.requirementId),
          workerId: new mongoose.Types.ObjectId(wId),
          workerType: workerInfo.workerType,
          reportingTimeSnapshot: workerInfo.reportingTime,
          checkIn: lateInfo.arrivalDate,
          checkInSource: 'manager_actual',
          arrivalStatus: 'late',
          delayMinutes: lateInfo.delayMinutes,
          checkInRecordedBy: managerObjectId,
          checkInRecordedAt: now,
          status: 'checked_in',
          verificationStatus: 'pending_review',
          checkOut: existing?.checkOut,
          checkOutSource: existing?.checkOutSource,
          departureStatus: existing?.departureStatus,
          earlyDepartureMinutes: existing?.earlyDepartureMinutes,
          overtimeMinutes: existing?.overtimeMinutes,
          durationMinutes,
        });
      } else if (absentWorkerIds.has(wId)) {
        // Absent worker from payload exception: completely excluded from checkout with duration = 0
        attendanceRecordsToUpsert.push({
          eventId: new mongoose.Types.ObjectId(eventId),
          requirementId: new mongoose.Types.ObjectId(workerInfo.requirementId),
          workerId: new mongoose.Types.ObjectId(wId),
          workerType: workerInfo.workerType,
          reportingTimeSnapshot: workerInfo.reportingTime,
          checkIn: null,
          checkInSource: 'not_recorded',
          arrivalStatus: 'absent',
          delayMinutes: 0,
          checkInRecordedBy: managerObjectId,
          checkInRecordedAt: now,
          status: 'absent',
          verificationStatus: 'pending_review',
          checkOut: null,
          checkOutSource: 'not_recorded',
          departureStatus: 'not_recorded',
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          durationMinutes: 0,
        });
      } else {
        if (existing && existing.status !== 'not_started' && existing.arrivalStatus !== 'unrecorded') {
          // Worker was already recorded and confirmed via individual check-in or prior finalization
          let durationMinutes = existing.durationMinutes ?? 0;
          if (existing.checkOut && existing.checkIn) {
            durationMinutes = Math.floor((existing.checkOut.getTime() - existing.checkIn.getTime()) / 60000);
          }
          attendanceRecordsToUpsert.push({
            eventId: new mongoose.Types.ObjectId(eventId),
            requirementId: new mongoose.Types.ObjectId(workerInfo.requirementId),
            workerId: new mongoose.Types.ObjectId(wId),
            workerType: workerInfo.workerType,
            reportingTimeSnapshot: existing.reportingTimeSnapshot || workerInfo.reportingTime,
            checkIn: existing.checkIn || null,
            checkInSource: existing.checkInSource,
            arrivalStatus: existing.arrivalStatus,
            delayMinutes: existing.delayMinutes ?? 0,
            checkInRecordedBy: existing.checkInRecordedBy || managerObjectId,
            checkInRecordedAt: existing.checkInRecordedAt || now,
            status: existing.status,
            verificationStatus: 'pending_review',
            checkOut: existing.checkOut,
            checkOutSource: existing.checkOutSource,
            departureStatus: existing.departureStatus,
            earlyDepartureMinutes: existing.earlyDepartureMinutes,
            overtimeMinutes: existing.overtimeMinutes,
            durationMinutes,
            isStatusLocked: existing.isStatusLocked,
            hasOpenConcern: existing.hasOpenConcern,
            activeConcernId: existing.activeConcernId,
          });
        } else {
          // Default Present / On-Time worker
          let durationMinutes = 0;
          if (existing?.checkOut) {
            durationMinutes = Math.floor((existing.checkOut.getTime() - repDate.getTime()) / 60000);
          }
          attendanceRecordsToUpsert.push({
            eventId: new mongoose.Types.ObjectId(eventId),
            requirementId: new mongoose.Types.ObjectId(workerInfo.requirementId),
            workerId: new mongoose.Types.ObjectId(wId),
            workerType: workerInfo.workerType,
            reportingTimeSnapshot: workerInfo.reportingTime,
            checkIn: repDate,
            checkInSource: 'system_default',
            arrivalStatus: 'on_time',
            delayMinutes: 0,
            checkInRecordedBy: managerObjectId,
            checkInRecordedAt: now,
            status: 'checked_in',
            verificationStatus: 'pending_review',
            checkOut: existing?.checkOut,
            checkOutSource: existing?.checkOutSource,
            departureStatus: existing?.departureStatus,
            earlyDepartureMinutes: existing?.earlyDepartureMinutes,
            overtimeMinutes: existing?.overtimeMinutes,
            durationMinutes,
          });
        }
      }
    }

    const totalProcessed = assignedWorkerMap.size;
    let lateCount = 0;
    let absentCount = 0;
    let onTimeCount = 0;

    for (const rec of attendanceRecordsToUpsert) {
      if (rec.arrivalStatus === 'late') lateCount++;
      else if (rec.arrivalStatus === 'absent' || rec.status === 'absent') absentCount++;
      else onTimeCount++;
    }

    const nextRevision = isReFinalization ? (sessionDoc.checkInRevision || 1) + 1 : 1;

    const committedSummary: FinalizeCheckInSummary = {
      eventId,
      totalProcessed,
      onTimeCount,
      lateCount,
      absentCount,
      checkInFinalized: true,
      checkInFinalizedAt: now.toISOString(),
      checkInRevision: nextRevision,
      checkInChangesPending: false,
    };

    const idempotencyRecord: IFinalizationIdempotency = {
      idempotencyKey: cleanIdempotencyKey,
      payloadHash,
      finalizedAt: now,
      finalizedBy: managerObjectId,
      committedSummary: committedSummary as unknown as Record<string, unknown>,
    };

    // 11. Transactional Persistence Execution
    await runInTransaction(async (dbSession) => {
      // Re-read session inside transaction to ensure atomic precondition check
      const currentSession = await this.sessionRepo.findByEventId(eventId, dbSession);
      if (!currentSession) {
        throw ApiError.notFound('Attendance session not found for this event');
      }

      const isReFinalizeTx = currentSession.checkInFinalized;
      if (isReFinalizeTx && !currentSession.checkInChangesPending) {
        throw ApiError.conflict('Check-in has already been finalized and no changes are pending');
      }
      if (!isReFinalizeTx && currentSession.checkInFinalized) {
        throw ApiError.conflict('Check-in has already been finalized for this event');
      }

      // Persist all attendance documents atomically
      await this.attRepo.bulkUpsertAttendances(attendanceRecordsToUpsert, dbSession);

      let finalizedSession: IAttendanceSession | null = null;
      if (!isReFinalizeTx) {
        finalizedSession = await this.sessionRepo.atomicFinalizeCheckIn(
          eventId,
          idempotencyRecord,
          dbSession
        );
      } else {
        finalizedSession = await this.sessionRepo.atomicReFinalizeCheckIn(
          eventId,
          idempotencyRecord,
          payload.expectedRevision || currentSession.checkInRevision,
          payload.reason || 'Check-in re-finalized after attendance changes',
          dbSession
        );
      }

      if (!finalizedSession) {
        throw ApiError.conflict('Check-in finalization state conflict or concurrent modification');
      }

      // Synchronize categoryCheckInConfirmations for all assigned categories
      const distinctWorkerTypes = new Set(Array.from(assignedWorkerMap.values()).map((w) => w.workerType));
      for (const wType of distinctWorkerTypes) {
        await this.sessionRepo.atomicConfirmCategoryCheckIn(
          eventId,
          wType,
          {
            finalizedBy: managerObjectId,
            finalizedAt: now,
            idempotencyRecord: {
              idempotencyKey: `${cleanIdempotencyKey}_${wType}`,
              payloadHash,
              finalizedAt: now,
              finalizedBy: managerObjectId,
              committedSummary: { eventId, workerType: wType, checkInFinalized: true },
            },
            changeReason:
              payload.reason ||
              (isReFinalizeTx
                ? 'Re-finalized via global check-in confirmation'
                : 'Initial global check-in confirmation'),
            isReFinalize: isReFinalizeTx,
          },
          dbSession
        );
      }
    });

    return committedSummary;
  }

  /**
   * Computes a SHA-256 payload hash from normalized checkout exceptions and finish times.
   */
  private computeCheckOutPayloadHash(payload: FinalizeCheckOutPayload): string {
    const normFinish = payload.actualNormalFinishTime
      ? isValidTimeString(payload.actualNormalFinishTime).normalized24h || payload.actualNormalFinishTime.trim()
      : '';

    const normOverrides = (payload.requirementFinishOverrides || [])
      .map((item) => ({
        requirementId: item.requirementId.trim(),
        normalFinishTime: isValidTimeString(item.normalFinishTime).normalized24h || item.normalFinishTime.trim(),
      }))
      .sort((a, b) => a.requirementId.localeCompare(b.requirementId));

    const normCategories = (payload.categoryFinishTimes || [])
      .map((item) => ({
        workerType: item.workerType.trim().toLowerCase(),
        normalFinishTime: isValidTimeString(item.normalFinishTime).normalized24h || item.normalFinishTime.trim(),
      }))
      .sort((a, b) => a.workerType.localeCompare(b.workerType));

    const normEarly = (payload.earlyDepartureExceptions || [])
      .map((item) => ({
        workerId: item.workerId.trim(),
        actualCheckoutTime: isValidTimeString(item.actualCheckoutTime).normalized24h || item.actualCheckoutTime.trim(),
      }))
      .sort((a, b) => a.workerId.localeCompare(b.workerId));

    const normOvertime = (payload.overtimeExceptions || [])
      .map((item) => ({
        workerId: item.workerId.trim(),
        actualCheckoutTime: isValidTimeString(item.actualCheckoutTime).normalized24h || item.actualCheckoutTime.trim(),
      }))
      .sort((a, b) => a.workerId.localeCompare(b.workerId));

    const normalizedString = JSON.stringify({
      actualNormalFinishTime: normFinish,
      categoryFinishTimes: normCategories,
      requirementFinishOverrides: normOverrides,
      earlyDepartureExceptions: normEarly,
      overtimeExceptions: normOvertime,
    });

    return crypto.createHash('sha256').update(normalizedString).digest('hex');
  }

  /**
   * Records or updates the category actual departure time for a worker category.
   * Atomically applies default checkout to normal workers and recalculates early/overtime
   * minutes and classification for individual exception workers.
   */
  async recordCategoryDeparture(
    userId: string,
    userRole: string,
    eventId: string,
    payload: RecordCategoryDeparturePayload
  ): Promise<RecordCategoryDepartureResult> {
    const event = await this.validateEventAndOwnership(eventId, userId, userRole);

    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }

    const now = this.getNow();
    const windowInfo = calculateEventCorrectionWindow(event, now);

    // Rule: Departure time can only be set on the scheduled event day; closed after event day
    if (windowInfo.isBeforeEventDay) {
      throw ApiError.badRequest('Category departure time can only be set on the scheduled event day (cannot set before event day)');
    }
    if (windowInfo.isAfterEventDay) {
      throw ApiError.forbidden(
        'Checkout editing is closed because the scheduled event day has ended. Departure times can only be set on the event day.'
      );
    }

    // Validate time string
    const timeVal = isValidTimeString(payload.actualDepartureTime);
    if (!timeVal.valid || !timeVal.normalized24h) {
      throw ApiError.badRequest(`Invalid category departure time: ${timeVal.error}`);
    }
    const departureTime24h = timeVal.normalized24h;

    // Load active requirements for event to find category and reporting time
    const requirements = await WorkRequirement.find({
      eventId: new mongoose.Types.ObjectId(eventId),
      status: { $ne: 'cancelled' },
    });
    const catReqs = requirements.filter(
      (r) => r.workerType.trim().toLowerCase() === payload.workerType.trim().toLowerCase()
    );
    if (catReqs.length === 0) {
      throw ApiError.notFound(`No active work requirement found for worker category '${payload.workerType}'`);
    }

    // Construct actual departure timestamp from explicit date selection (Asia/Kolkata instant)
    const departureDateBase = payload.actualDepartureDate || getOperationalDateString(event.date, 'Asia/Kolkata');
    const actualDepartureDate = constructKolkataDateTime(departureDateBase, departureTime24h);

    // Rule 2: Cannot be in the future relative to authoritative server clock
    if (actualDepartureDate.getTime() > now.getTime()) {
      throw ApiError.badRequest('Category departure time cannot be in the future');
    }

    // Load all existing attendance records for this event and category
    const catAttendances = await this.attRepo.findByEventAndWorkerType(eventId, payload.workerType);

    // Rule: Check-in confirmation prerequisite for this category
    const sessionDoc = await this.sessionRepo.getOrCreateSession(eventId);
    const catConfirmation = (sessionDoc.categoryCheckInConfirmations || []).find(
      (c) => c.workerType.trim().toLowerCase() === payload.workerType.trim().toLowerCase()
    );

    if (!catConfirmation || !catConfirmation.checkInFinalized) {
      throw ApiError.badRequest(
        `Check-in for category '${payload.workerType}' must be confirmed before recording checkout`
      );
    }
    if (catConfirmation.checkInChangesPending) {
      throw ApiError.badRequest(
        `Check-in changes are pending re-confirmation for category '${payload.workerType}'. Re-confirm check-in before updating checkout.`
      );
    }

    let affectedCount = 0;
    let normalCount = 0;
    let exceptionCount = 0;
    let absentCount = 0;

    await runInTransaction(async (dbSession) => {
      // 1. Save category actual departure in session
      await this.sessionRepo.saveCategoryActualDeparture(
        eventId,
        {
          workerType: payload.workerType,
          actualDepartureTime: departureTime24h,
          actualDepartureDate,
          recordedBy: new mongoose.Types.ObjectId(userId),
          reason: payload.reason,
        },
        dbSession
      );

      // 2. Update workers
      for (const att of catAttendances) {
        const isAbsent = att.arrivalStatus === 'absent' || att.status === 'absent';
        if (isAbsent) {
          absentCount++;
          continue;
        }

        affectedCount++;

        if (att.checkOutSource !== 'individual_exception') {
          // Partial eligibility check:
          // If worker checked in at or after category departure, do not apply invalid category default!
          // Leave worker pending an individual overtime exception.
          if (att.checkIn && actualDepartureDate.getTime() <= att.checkIn.getTime()) {
            if (att.checkOut && att.checkOutSource === 'category_default') {
              att.checkOut = undefined;
              att.checkOutSource = 'not_recorded';
              att.departureStatus = 'not_recorded';
              att.durationMinutes = 0;
              att.status = 'checked_in';
              await att.save({ session: dbSession });
            }
            continue;
          }

          // Normal worker: update checkout timestamp to category departure
          normalCount++;
          const prevCheckOut = att.checkOut ? att.checkOut.toISOString() : undefined;
          const prevDepartureStatus = att.departureStatus;

          att.checkOut = actualDepartureDate;
          att.checkOutSource = 'category_default';
          att.departureStatus = 'normal';
          att.earlyDepartureMinutes = 0;
          att.overtimeMinutes = 0;
          att.durationMinutes = att.checkIn
            ? Math.floor((actualDepartureDate.getTime() - att.checkIn.getTime()) / 60000)
            : 0;
          att.status = 'checked_out';
          att.checkOutRecordedBy = new mongoose.Types.ObjectId(userId);
          att.checkOutRecordedAt = now;

          if (prevCheckOut !== actualDepartureDate.toISOString()) {
            att.corrections.push({
              modifiedBy: new mongoose.Types.ObjectId(userId),
              modifiedAt: now,
              field: 'checkOut',
              previousValue: prevCheckOut,
              previousSource: att.checkOutSource,
              previousDepartureStatus: prevDepartureStatus,
              newValue: actualDepartureDate.toISOString(),
              newSource: 'category_default',
              newDepartureStatus: 'normal',
              reason: payload.reason || `Applied category '${payload.workerType}' actual departure ${departureTime24h}`,
            });
          }
          await att.save({ session: dbSession });
        } else {
          // Worker with individual exception: PRESERVE att.checkOut!
          exceptionCount++;
          const prevDepStatus = att.departureStatus;
          const prevEarly = att.earlyDepartureMinutes;
          const prevOt = att.overtimeMinutes;

          const indMs = att.checkOut ? att.checkOut.getTime() : 0;
          const catMs = actualDepartureDate.getTime();

          let newDepStatus: DepartureStatus = 'normal';
          let earlyMins = 0;
          let otMins = 0;

          if (indMs < catMs) {
            newDepStatus = 'early_departure';
            earlyMins = Math.floor((catMs - indMs) / 60000);
            otMins = 0;
          } else if (indMs > catMs) {
            newDepStatus = 'overtime';
            earlyMins = 0;
            otMins = Math.floor((indMs - catMs) / 60000);
          } else {
            newDepStatus = 'normal';
            earlyMins = 0;
            otMins = 0;
          }

          att.departureStatus = newDepStatus;
          att.earlyDepartureMinutes = earlyMins;
          att.overtimeMinutes = otMins;
          att.durationMinutes = att.checkIn && att.checkOut
            ? Math.floor((att.checkOut.getTime() - att.checkIn.getTime()) / 60000)
            : 0;

          att.corrections.push({
            modifiedBy: new mongoose.Types.ObjectId(userId),
            modifiedAt: now,
            field: 'departureStatus',
            previousValue: `${prevDepStatus} (early: ${prevEarly}m, ot: ${prevOt}m)`,
            previousDepartureStatus: prevDepStatus,
            newValue: `${newDepStatus} (early: ${earlyMins}m, ot: ${otMins}m)`,
            newDepartureStatus: newDepStatus,
            reason: `Automatic reclassification due to category '${payload.workerType}' departure updated to ${departureTime24h}`,
          });

          await att.save({ session: dbSession });
        }
      }
    });

    return {
      eventId,
      workerType: payload.workerType,
      actualDepartureTime: departureTime24h,
      actualDepartureDate: actualDepartureDate.toISOString(),
      affectedWorkersCount: affectedCount,
      normalWorkersCount: normalCount,
      exceptionWorkersCount: exceptionCount,
      absentWorkersCount: absentCount,
    };
  }

  /**
   * Records or updates an individual worker's Early Departure or Overtime exception.
   */
  async recordWorkerCheckOutException(
    userId: string,
    userRole: string,
    eventId: string,
    workerId: string,
    payload: RecordWorkerCheckOutExceptionPayload
  ): Promise<AttendanceRosterItem> {
    const event = await this.validateEventAndOwnership(eventId, userId, userRole);

    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }

    const now = this.getNow();
    const windowInfo = calculateEventCorrectionWindow(event, now);

    // Rule: Departure exceptions can only be recorded on the scheduled event day; closed after event day
    if (windowInfo.isBeforeEventDay) {
      throw ApiError.badRequest('Checkout exceptions can only be recorded on the scheduled event day (cannot set before event day)');
    }
    if (windowInfo.isAfterEventDay) {
      throw ApiError.forbidden(
        'Checkout editing is closed because the scheduled event day has ended. Departure exceptions can only be set on the event day.'
      );
    }

    const rawTime = payload.actualDepartureTime || payload.actualCheckoutTime;
    const timeVal = isValidTimeString(rawTime);
    if (!timeVal.valid || !timeVal.normalized24h) {
      throw ApiError.badRequest(`Invalid actual checkout time: ${timeVal.error}`);
    }
    const outTime24h = timeVal.normalized24h;

    const att = await this.attRepo.findByEventAndWorker(eventId, workerId);
    if (!att) {
      throw ApiError.notFound('Attendance record not found for this worker');
    }

    // Rule: Absent worker cannot receive checkout
    if (att.arrivalStatus === 'absent' || att.status === 'absent') {
      throw ApiError.badRequest('Cannot record checkout exception for an absent worker');
    }

    // Rule: Must have checked in
    if (!att.checkIn) {
      throw ApiError.badRequest('Worker has not checked in. Cannot record checkout before check-in.');
    }

    // Construct checkout date using explicit date selection (Asia/Kolkata instant)
    const departureDateBase = payload.actualDepartureDate || getOperationalDateString(att.checkIn || event.date, 'Asia/Kolkata');
    const actualCheckoutDate = constructKolkataDateTime(departureDateBase, outTime24h);

    // Rule 2: Cannot be in future relative to authoritative server clock
    if (actualCheckoutDate.getTime() > now.getTime()) {
      throw ApiError.badRequest('Individual departure time cannot be in the future');
    }

    // Rule 3: Must be strictly later than that worker's check-in
    if (actualCheckoutDate.getTime() <= att.checkIn.getTime()) {
      throw ApiError.badRequest('Individual departure time must be strictly later than the worker\'s check-in time');
    }

    // Resolve category departure to determine classification
    const sessionDoc = await this.sessionRepo.findByEventId(eventId);
    const catConf = (sessionDoc?.categoryCheckInConfirmations || []).find(
      (c) => c.workerType.trim().toLowerCase() === att.workerType.trim().toLowerCase()
    );

    if (!catConf || !catConf.checkInFinalized) {
      throw ApiError.badRequest(
        `Check-in for category '${att.workerType}' must be confirmed before recording checkout exceptions`
      );
    }
    if (catConf.checkInChangesPending) {
      throw ApiError.badRequest(
        `Check-in changes are pending re-confirmation for category '${att.workerType}'. Re-confirm check-in before updating checkout.`
      );
    }
    const catDeparture = (sessionDoc?.categoryActualDepartures || []).find(
      (d) => d.workerType.trim().toLowerCase() === att.workerType.trim().toLowerCase()
    );

    let depStatus: DepartureStatus = 'normal';
    let earlyMins = 0;
    let otMins = 0;

    if (catDeparture) {
      const catMs = catDeparture.actualDepartureDate.getTime();
      const indMs = actualCheckoutDate.getTime();

      if (indMs < catMs) {
        depStatus = 'early_departure';
        earlyMins = Math.floor((catMs - indMs) / 60000);
      } else if (indMs > catMs) {
        depStatus = 'overtime';
        otMins = Math.floor((indMs - catMs) / 60000);
      } else {
        depStatus = 'normal';
      }
    }

    const durationMinutes = Math.floor((actualCheckoutDate.getTime() - att.checkIn.getTime()) / 60000);

    const prevCheckOut = att.checkOut ? att.checkOut.toISOString() : undefined;
    const prevDepStatus = att.departureStatus;
    const prevSource = att.checkOutSource;

    att.checkOut = actualCheckoutDate;
    att.checkOutSource = 'individual_exception';
    att.departureStatus = depStatus;
    att.earlyDepartureMinutes = earlyMins;
    att.overtimeMinutes = otMins;
    att.durationMinutes = durationMinutes;
    att.checkOutRecordedBy = new mongoose.Types.ObjectId(userId);
    att.checkOutRecordedAt = now;
    att.status = 'checked_out';

    att.corrections.push({
      modifiedBy: new mongoose.Types.ObjectId(userId),
      modifiedAt: now,
      field: 'checkOut',
      previousValue: prevCheckOut,
      previousSource: prevSource,
      previousDepartureStatus: prevDepStatus,
      newValue: actualCheckoutDate.toISOString(),
      newSource: 'individual_exception',
      newDepartureStatus: depStatus,
      reason: payload.reason || `Marked individual exception: ${depStatus} at ${outTime24h}`,
    });

    await att.save();

    const workerUser = await User.findById(workerId).select('name email phone businessId');
    return this.toRosterItemDTO(att, workerUser);
  }

  /**
   * Clears an individual checkout exception and restores the category default checkout.
   */
  async clearWorkerCheckOutException(
    userId: string,
    userRole: string,
    eventId: string,
    workerId: string
  ): Promise<AttendanceRosterItem> {
    const event = await this.validateEventAndOwnership(eventId, userId, userRole);

    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }

    const now = new Date();
    const windowInfo = calculateEventCorrectionWindow(event, now);

    // Rule: Departure exceptions can only be modified on the scheduled event day; closed after event day
    if (windowInfo.isBeforeEventDay) {
      throw ApiError.badRequest('Checkout exceptions can only be cleared on the scheduled event day (cannot modify before event day)');
    }
    if (windowInfo.isAfterEventDay) {
      throw ApiError.forbidden(
        'Checkout editing is closed because the scheduled event day has ended. Departure exceptions can only be modified on the event day.'
      );
    }

    const att = await this.attRepo.findByEventAndWorker(eventId, workerId);
    if (!att) {
      throw ApiError.notFound('Attendance record not found for this worker');
    }

    if (att.arrivalStatus === 'absent' || att.status === 'absent') {
      throw ApiError.badRequest('Cannot clear exception for an absent worker');
    }

    if (att.checkOutSource !== 'individual_exception') {
      throw ApiError.badRequest('Worker does not have an individual exception to clear');
    }

    const sessionDoc = await this.sessionRepo.findByEventId(eventId);
    const catDeparture = (sessionDoc?.categoryActualDepartures || []).find(
      (d) => d.workerType.trim().toLowerCase() === att.workerType.trim().toLowerCase()
    );

    const prevCheckOut = att.checkOut ? att.checkOut.toISOString() : undefined;
    const prevDepStatus = att.departureStatus;

    if (catDeparture) {
      if (att.checkIn && catDeparture.actualDepartureDate.getTime() <= att.checkIn.getTime()) {
        throw ApiError.badRequest('Cannot restore category default: worker checked in at or after category departure time');
      }

      att.checkOut = catDeparture.actualDepartureDate;
      att.checkOutSource = 'category_default';
      att.departureStatus = 'normal';
      att.earlyDepartureMinutes = 0;
      att.overtimeMinutes = 0;
      att.durationMinutes = att.checkIn
        ? Math.floor((catDeparture.actualDepartureDate.getTime() - att.checkIn.getTime()) / 60000)
        : 0;
      att.status = 'checked_out';
    } else {
      att.checkOut = undefined;
      att.checkOutSource = 'not_recorded';
      att.departureStatus = 'not_recorded';
      att.earlyDepartureMinutes = 0;
      att.overtimeMinutes = 0;
      att.durationMinutes = 0;
      att.status = 'checked_in';
    }

    att.corrections.push({
      modifiedBy: new mongoose.Types.ObjectId(userId),
      modifiedAt: now,
      field: 'checkOut',
      previousValue: prevCheckOut,
      previousSource: 'individual_exception',
      previousDepartureStatus: prevDepStatus,
      newValue: att.checkOut ? att.checkOut.toISOString() : 'not_recorded',
      newSource: att.checkOutSource,
      newDepartureStatus: att.departureStatus,
      reason: 'Cleared individual exception and restored category default checkout',
    });

    await att.save();

    const workerUser = await User.findById(workerId).select('name email phone businessId');
    return this.toRosterItemDTO(att, workerUser);
  }

  /**
   * 4. POST /api/attendance/events/:eventId/finalize-checkout
   * Executes manager-controlled exception-based checkout finalization with transaction and idempotency.
   */
  async finalizeCheckOut(
    userId: string,
    userRole: string,
    eventId: string,
    idempotencyKey: string,
    payload: FinalizeCheckOutPayload
  ): Promise<FinalizeCheckOutSummary> {
    // 1. Mandatory Idempotency-Key header validation
    if (!idempotencyKey || typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      throw ApiError.badRequest('Idempotency-Key header is required');
    }
    const cleanIdempotencyKey = idempotencyKey.trim();

    // 2. Validate event and authorization
    const event = await this.validateEventAndOwnership(eventId, userId, userRole);

    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }
    if (!['confirmed', 'in_progress'].includes(event.status)) {
      throw ApiError.badRequest(
        `Cannot finalize checkout for event in '${event.status}' status. Event must be confirmed or in_progress.`
      );
    }

    // 3. Retrieve or safely initialize the session
    const sessionDoc = await this.sessionRepo.getOrCreateSession(eventId);

    // 4. Compute stable payload hash
    const payloadHash = this.computeCheckOutPayloadHash(payload);

    // 5. Idempotency Evaluation
    if (sessionDoc.checkOutFinalized) {
      const persistedIdem = sessionDoc.checkOutIdempotency;
      if (persistedIdem?.idempotencyKey === cleanIdempotencyKey) {
        if (persistedIdem.payloadHash === payloadHash) {
          // Replay of identical request: return previous committed summary
          return persistedIdem.committedSummary as unknown as FinalizeCheckOutSummary;
        }
        // Same key, different payload -> 409 Conflict
        throw ApiError.conflict('Idempotency key collision: previous checkout finalized with different payload');
      }
      // Different key on already-finalized checkout -> 409 Conflict
      throw ApiError.conflict('Checkout has already been finalized for this event');
    }

    // 7. Validate finish time & category finish times
    let defaultFinishTime24h: string | undefined;
    if (payload.actualNormalFinishTime) {
      const finishTimeValidation = isValidTimeString(payload.actualNormalFinishTime);
      if (!finishTimeValidation.valid || !finishTimeValidation.normalized24h) {
        throw ApiError.badRequest(`Invalid actual normal finish time: ${finishTimeValidation.error}`);
      }
      defaultFinishTime24h = finishTimeValidation.normalized24h;
    }

    // 8. Load requirements for the event
    const requirements = await WorkRequirement.find({
      eventId: new mongoose.Types.ObjectId(eventId),
      status: { $ne: 'cancelled' },
    });
    const requirementMap = new Map<string, IWorkRequirement>();
    for (const req of requirements) {
      requirementMap.set(req._id.toString(), req);
    }

    // Category finish time processing
    const categoryFinishMap = new Map<string, { finishTime24h: string; finishDate: Date }>();
    const categoryFinishTimesToPersist: Array<{
      workerType: string;
      normalFinishTime: string;
      normalFinishDate: Date;
    }> = [];

    if (payload.categoryFinishTimes && payload.categoryFinishTimes.length > 0) {
      for (const cat of payload.categoryFinishTimes) {
        const catTimeVal = isValidTimeString(cat.normalFinishTime);
        if (!catTimeVal.valid || !catTimeVal.normalized24h) {
          throw ApiError.badRequest(`Invalid finish time for worker category '${cat.workerType}'`);
        }
        const finishTime24h = catTimeVal.normalized24h;

        // Find reporting time for this category to detect overnight shift
        const catReqs = requirements.filter(
          (r) => r.workerType.trim().toLowerCase() === cat.workerType.trim().toLowerCase()
        );
        let catRepTime = '08:00';
        for (const r of catReqs) {
          const v = isValidTimeString(r.reportingTime);
          if (v.valid && v.normalized24h) {
            catRepTime = v.normalized24h;
            break;
          }
        }

        const [repH, repM] = catRepTime.split(':').map(Number);
        const [finH, finM] = finishTime24h.split(':').map(Number);
        const repMins = repH * 60 + repM;
        const finMins = finH * 60 + finM;

        let finishDate = this.constructDateTime(event.date, finishTime24h);
        if (finMins <= repMins) {
          finishDate = new Date(finishDate.getTime() + 24 * 60 * 60 * 1000);
        }

        categoryFinishMap.set(cat.workerType.trim().toLowerCase(), { finishTime24h, finishDate });
        categoryFinishTimesToPersist.push({
          workerType: cat.workerType,
          normalFinishTime: finishTime24h,
          normalFinishDate: finishDate,
        });
      }
    } else if (sessionDoc.categoryActualDepartures && sessionDoc.categoryActualDepartures.length > 0) {
      for (const dep of sessionDoc.categoryActualDepartures) {
        categoryFinishMap.set(dep.workerType.trim().toLowerCase(), {
          finishTime24h: dep.actualDepartureTime,
          finishDate: dep.actualDepartureDate,
        });
        categoryFinishTimesToPersist.push({
          workerType: dep.workerType,
          normalFinishTime: dep.actualDepartureTime,
          normalFinishDate: dep.actualDepartureDate,
        });
      }
    }

    // 9. Validate and resolve requirement overrides
    const requirementOverrideMap = new Map<string, string>();
    const overridesToPersist: IRequirementFinishOverride[] = [];

    if (payload.requirementFinishOverrides && payload.requirementFinishOverrides.length > 0) {
      for (const override of payload.requirementFinishOverrides) {
        const req = requirementMap.get(override.requirementId);
        if (!req) {
          throw ApiError.badRequest(`Requirement '${override.requirementId}' does not belong to this event`);
        }
        const overrideTimeValidation = isValidTimeString(override.normalFinishTime);
        if (!overrideTimeValidation.valid || !overrideTimeValidation.normalized24h) {
          throw ApiError.badRequest(`Invalid override finish time for requirement '${override.requirementId}'`);
        }
        const overrideTime24h = overrideTimeValidation.normalized24h;
        requirementOverrideMap.set(override.requirementId, overrideTime24h);

        const reqRepVal = isValidTimeString(req.reportingTime);
        const reqRepTime = reqRepVal.valid && reqRepVal.normalized24h ? reqRepVal.normalized24h : '08:00';
        const reqRepDate = this.constructDateTime(event.date, reqRepTime);
        let overrideDate = this.constructDateTime(event.date, overrideTime24h);
        if (overrideDate.getTime() <= reqRepDate.getTime()) {
          overrideDate = new Date(overrideDate.getTime() + 24 * 60 * 60 * 1000);
        }

        overridesToPersist.push({
          requirementId: new mongoose.Types.ObjectId(override.requirementId),
          normalFinishTime: overrideTime24h,
          normalFinishDate: overrideDate,
        });
      }
    }

    // 10. Default finish date for session
    let eventDefaultFinishDate: Date;
    if (defaultFinishTime24h) {
      let earliestRepDate: Date | null = null;
      for (const req of requirements) {
        const reqRepVal = isValidTimeString(req.reportingTime);
        if (reqRepVal.valid && reqRepVal.normalized24h) {
          const rDate = this.constructDateTime(event.date, reqRepVal.normalized24h);
          if (!earliestRepDate || rDate.getTime() < earliestRepDate.getTime()) {
            earliestRepDate = rDate;
          }
        }
      }
      eventDefaultFinishDate = this.constructDateTime(event.date, defaultFinishTime24h);
      if (earliestRepDate && eventDefaultFinishDate.getTime() <= earliestRepDate.getTime()) {
        eventDefaultFinishDate = new Date(eventDefaultFinishDate.getTime() + 24 * 60 * 60 * 1000);
      }
    } else {
      eventDefaultFinishDate = categoryFinishTimesToPersist[0]?.normalFinishDate || new Date();
      defaultFinishTime24h = categoryFinishTimesToPersist[0]?.normalFinishTime || '';
    }

    // 11. Build all assigned workers across active requirements
    const assignmentEntries: Array<{
      workerId: string;
      workerType: string;
      requirementId: string;
      reportingTime: string;
    }> = [];
    for (const req of requirements) {
      for (const a of req.assignedWorkers || []) {
        assignmentEntries.push({
          workerId: a.workerId.toString(),
          workerType: req.workerType,
          requirementId: req._id.toString(),
          reportingTime: req.reportingTime,
        });
      }
    }

    if (assignmentEntries.length === 0) {
      throw ApiError.badRequest('No assigned workers found for this event');
    }

    // Precondition: Check-in finalization must precede checkout finalization (§10 / Mandatory Rule 7)
    // Supports both global confirmation and individual category-wise confirmations
    const assignedCategories = Array.from(new Set(assignmentEntries.map((e) => e.workerType.trim().toLowerCase())));
    const catConfs = sessionDoc.categoryCheckInConfirmations || [];
    const allCategoriesConfirmed =
      assignedCategories.length > 0 &&
      assignedCategories.every((cat) => {
        const conf = catConfs.find((c) => c.workerType.trim().toLowerCase() === cat);
        return conf && conf.checkInFinalized && !conf.checkInChangesPending;
      });

    if (!sessionDoc.checkInFinalized && !allCategoriesConfirmed) {
      throw ApiError.badRequest('Check-in must be finalized before checkout can be finalized');
    }
    if (
      sessionDoc.checkInChangesPending ||
      assignedCategories.some((cat) => {
        const conf = catConfs.find((c) => c.workerType.trim().toLowerCase() === cat);
        return conf && conf.checkInChangesPending;
      })
    ) {
      throw ApiError.badRequest(
        'Cannot finalize checkout while check-in has pending changes. Re-finalize check-in before proceeding with checkout finalization.'
      );
    }

    // 12. Load existing attendances
    const existingAttendances = await this.attRepo.findByEventId(eventId);
    const attendanceMap = new Map<string, IAttendance>();
    for (const att of existingAttendances) {
      const wId = (att.workerId as any)?._id?.toString() || att.workerId?.toString();
      if (wId) {
        attendanceMap.set(wId, att);
      }
    }

    // 13. Validate exceptions
    const earlyExceptions = payload.earlyDepartureExceptions || [];
    const overtimeExceptions = payload.overtimeExceptions || [];

    const earlyWorkerIds = new Set<string>();
    const overtimeWorkerIds = new Set<string>();
    const assignedWorkerIdSet = new Set(assignmentEntries.map((e) => e.workerId));

    for (const early of earlyExceptions) {
      if (!assignedWorkerIdSet.has(early.workerId)) {
        throw ApiError.badRequest(`Worker '${early.workerId}' is not assigned to this event`);
      }
      const att = attendanceMap.get(early.workerId);
      if (att && (att.status === 'absent' || att.arrivalStatus === 'absent')) {
        throw ApiError.badRequest(
          `Worker '${early.workerId}' is marked absent and cannot have an early departure checkout recorded`
        );
      }
      if (earlyWorkerIds.has(early.workerId)) {
        throw ApiError.badRequest(`Duplicate workerId '${early.workerId}' in earlyDepartureExceptions`);
      }
      earlyWorkerIds.add(early.workerId);
    }

    for (const ot of overtimeExceptions) {
      if (!assignedWorkerIdSet.has(ot.workerId)) {
        throw ApiError.badRequest(`Worker '${ot.workerId}' is not assigned to this event`);
      }
      const att = attendanceMap.get(ot.workerId);
      if (att && (att.status === 'absent' || att.arrivalStatus === 'absent')) {
        throw ApiError.badRequest(
          `Worker '${ot.workerId}' is marked absent and cannot have an overtime checkout recorded`
        );
      }
      if (overtimeWorkerIds.has(ot.workerId)) {
        throw ApiError.badRequest(`Duplicate workerId '${ot.workerId}' in overtimeExceptions`);
      }
      if (earlyWorkerIds.has(ot.workerId)) {
        throw ApiError.badRequest(
          `Worker '${ot.workerId}' cannot appear in both early departure and overtime exceptions`
        );
      }
      overtimeWorkerIds.add(ot.workerId);
    }

    // 14. Build updates for all assigned workers (unmarked workers default to On Time)
    const earlyMap = new Map(earlyExceptions.map((e) => [e.workerId, e.actualCheckoutTime]));
    const overtimeMap = new Map(overtimeExceptions.map((o) => [o.workerId, o.actualCheckoutTime]));

    const now = new Date();
    const managerObjectId = new mongoose.Types.ObjectId(userId);
    const attendanceUpdates: any[] = [];

    let normalCheckoutCount = 0;
    let earlyDepartureCount = 0;
    let overtimeCount = 0;
    let absentCount = 0;

    for (const entry of assignmentEntries) {
      const wId = entry.workerId;
      const att = attendanceMap.get(wId);
      const req = requirementMap.get(entry.requirementId);
      const repTimeStr = att?.reportingTimeSnapshot || entry.reportingTime || '08:00';
      const repTimeVal = isValidTimeString(repTimeStr);
      const normRepTime = repTimeVal.valid && repTimeVal.normalized24h ? repTimeVal.normalized24h : '08:00';
      const repDate = this.constructDateTime(event.date, normRepTime);

      // Resolve applicable normal finish time and date for this worker:
      // Priority 1: Requirement override
      // Priority 2: Category finish time
      // Priority 3: Event default finish time
      const catEntry = categoryFinishMap.get(entry.workerType.trim().toLowerCase());
      let applicableFinishTimeStr: string;
      let applicableFinishDate: Date;

      if (requirementOverrideMap.has(entry.requirementId)) {
        applicableFinishTimeStr = requirementOverrideMap.get(entry.requirementId)!;
        applicableFinishDate = this.constructDateTime(event.date, applicableFinishTimeStr);
        if (applicableFinishDate.getTime() <= repDate.getTime()) {
          applicableFinishDate = new Date(applicableFinishDate.getTime() + 24 * 60 * 60 * 1000);
        }
      } else if (catEntry) {
        applicableFinishTimeStr = catEntry.finishTime24h;
        applicableFinishDate = catEntry.finishDate;
      } else if (defaultFinishTime24h) {
        applicableFinishTimeStr = defaultFinishTime24h;
        applicableFinishDate = eventDefaultFinishDate;
      } else {
        throw ApiError.badRequest(`Missing normal finishing time for worker category '${entry.workerType}'`);
      }

      if (att && (att.status === 'absent' || att.arrivalStatus === 'absent')) {
        absentCount++;
        attendanceUpdates.push({
          eventId: new mongoose.Types.ObjectId(eventId),
          workerId: new mongoose.Types.ObjectId(wId),
          requirementId: new mongoose.Types.ObjectId(entry.requirementId),
          workerType: entry.workerType,
          reportingTimeSnapshot: repTimeStr,
          applicableNormalFinishTimeSnapshot: applicableFinishTimeStr,
          applicableNormalFinishDate: applicableFinishDate,
          checkIn: null,
          checkInSource: 'not_recorded',
          arrivalStatus: 'absent',
          delayMinutes: 0,
          checkOut: null,
          checkOutSource: 'not_recorded',
          departureStatus: 'not_recorded',
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          durationMinutes: 0,
          status: 'absent',
          verificationStatus: 'pending_review',
        });
        continue;
      }

      // Default to on_time if worker has no prior exception
      const checkInDate = att?.checkIn || repDate;
      const checkInSource = att?.checkInSource || 'system_default';
      const arrivalStatus = att?.arrivalStatus && att.arrivalStatus !== 'unrecorded' ? att.arrivalStatus : 'on_time';
      const delayMinutes = att?.delayMinutes ?? 0;

      if (earlyWorkerIds.has(wId)) {
        earlyDepartureCount++;
        const rawCheckoutTime = earlyMap.get(wId)!;
        const checkoutVal = isValidTimeString(rawCheckoutTime);
        if (!checkoutVal.valid || !checkoutVal.normalized24h) {
          throw ApiError.badRequest(`Invalid checkout time '${rawCheckoutTime}' for worker '${wId}'`);
        }
        let checkoutDate = this.constructDateTime(event.date, checkoutVal.normalized24h);
        if (applicableFinishDate.getTime() > repDate.getTime()) {
          if (checkoutDate.getTime() <= repDate.getTime()) {
            checkoutDate = new Date(checkoutDate.getTime() + 24 * 60 * 60 * 1000);
          }
        }

        if (checkoutDate.getTime() >= applicableFinishDate.getTime()) {
          throw ApiError.badRequest(
            `Worker '${wId}' early departure checkout time '${rawCheckoutTime}' must be earlier than the applicable normal finish time '${applicableFinishTimeStr}'`
          );
        }
        if (checkoutDate.getTime() <= checkInDate.getTime()) {
          throw ApiError.badRequest(
            `Worker '${wId}' checkout time '${rawCheckoutTime}' must be later than their check-in time`
          );
        }

        const earlyDepartureMinutes = Math.round((applicableFinishDate.getTime() - checkoutDate.getTime()) / 60000);
        const durationMinutes = Math.round((checkoutDate.getTime() - checkInDate.getTime()) / 60000);

        attendanceUpdates.push({
          eventId: new mongoose.Types.ObjectId(eventId),
          workerId: new mongoose.Types.ObjectId(wId),
          requirementId: new mongoose.Types.ObjectId(entry.requirementId),
          workerType: entry.workerType,
          reportingTimeSnapshot: repTimeStr,
          applicableNormalFinishTimeSnapshot: applicableFinishTimeStr,
          applicableNormalFinishDate: applicableFinishDate,
          checkIn: checkInDate,
          checkInSource,
          arrivalStatus,
          delayMinutes,
          checkOut: checkoutDate,
          checkOutSource: 'manager_actual',
          departureStatus: 'early_departure',
          checkOutRecordedBy: managerObjectId,
          checkOutRecordedAt: now,
          earlyDepartureMinutes,
          overtimeMinutes: 0,
          durationMinutes,
          status: 'checked_out',
          verificationStatus: 'pending_review',
        });
      } else if (overtimeWorkerIds.has(wId)) {
        overtimeCount++;
        const rawCheckoutTime = overtimeMap.get(wId)!;
        const checkoutVal = isValidTimeString(rawCheckoutTime);
        if (!checkoutVal.valid || !checkoutVal.normalized24h) {
          throw ApiError.badRequest(`Invalid checkout time '${rawCheckoutTime}' for worker '${wId}'`);
        }
        let checkoutDate = this.constructDateTime(event.date, checkoutVal.normalized24h);
        if (checkoutDate.getTime() <= repDate.getTime()) {
          checkoutDate = new Date(checkoutDate.getTime() + 24 * 60 * 60 * 1000);
        }

        if (checkoutDate.getTime() <= applicableFinishDate.getTime()) {
          throw ApiError.badRequest(
            `Worker '${wId}' overtime checkout time '${rawCheckoutTime}' must be later than the applicable normal finish time '${applicableFinishTimeStr}'`
          );
        }
        if (checkoutDate.getTime() <= checkInDate.getTime()) {
          throw ApiError.badRequest(
            `Worker '${wId}' checkout time '${rawCheckoutTime}' must be later than their check-in time`
          );
        }

        const overtimeMinutes = Math.round((checkoutDate.getTime() - applicableFinishDate.getTime()) / 60000);
        const durationMinutes = Math.round((checkoutDate.getTime() - checkInDate.getTime()) / 60000);

        attendanceUpdates.push({
          eventId: new mongoose.Types.ObjectId(eventId),
          workerId: new mongoose.Types.ObjectId(wId),
          requirementId: new mongoose.Types.ObjectId(entry.requirementId),
          workerType: entry.workerType,
          reportingTimeSnapshot: repTimeStr,
          applicableNormalFinishTimeSnapshot: applicableFinishTimeStr,
          applicableNormalFinishDate: applicableFinishDate,
          checkIn: checkInDate,
          checkInSource,
          arrivalStatus,
          delayMinutes,
          checkOut: checkoutDate,
          checkOutSource: 'manager_actual',
          departureStatus: 'overtime',
          checkOutRecordedBy: managerObjectId,
          checkOutRecordedAt: now,
          earlyDepartureMinutes: 0,
          overtimeMinutes,
          durationMinutes,
          status: 'checked_out',
          verificationStatus: 'pending_review',
        });
      } else {
        // Normal default checkout
        normalCheckoutCount++;
        const durationMinutes = Math.round((applicableFinishDate.getTime() - checkInDate.getTime()) / 60000);

        attendanceUpdates.push({
          eventId: new mongoose.Types.ObjectId(eventId),
          workerId: new mongoose.Types.ObjectId(wId),
          requirementId: new mongoose.Types.ObjectId(entry.requirementId),
          workerType: entry.workerType,
          reportingTimeSnapshot: repTimeStr,
          applicableNormalFinishTimeSnapshot: applicableFinishTimeStr,
          applicableNormalFinishDate: applicableFinishDate,
          checkIn: checkInDate,
          checkInSource,
          arrivalStatus,
          delayMinutes,
          checkOut: applicableFinishDate,
          checkOutSource: 'system_default',
          departureStatus: 'normal',
          checkOutRecordedBy: managerObjectId,
          checkOutRecordedAt: now,
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          durationMinutes,
          status: 'checked_out',
          verificationStatus: 'pending_review',
        });
      }
    }

    const totalProcessed = assignmentEntries.length;
    const committedSummary: FinalizeCheckOutSummary = {
      eventId,
      totalProcessed,
      normalCheckoutCount,
      earlyDepartureCount,
      overtimeCount,
      absentCount,
      checkOutFinalized: true,
      checkOutFinalizedAt: now.toISOString(),
    };

    const idempotencyRecord: IFinalizationIdempotency = {
      idempotencyKey: cleanIdempotencyKey,
      payloadHash,
      finalizedAt: now,
      finalizedBy: managerObjectId,
      committedSummary: committedSummary as unknown as Record<string, unknown>,
    };

    // 15. Transactional Persistence Execution
    await runInTransaction(async (dbSession) => {
      // Re-read session inside transaction to ensure atomic precondition check
      const currentSession = await this.sessionRepo.findByEventId(eventId, dbSession);
      if (!currentSession) {
        throw ApiError.notFound('Attendance session not found for this event');
      }
      const curCatConfs = currentSession.categoryCheckInConfirmations || [];
      const curAllConfirmed =
        assignedCategories.length > 0 &&
        assignedCategories.every((cat) => {
          const conf = curCatConfs.find((c) => c.workerType.trim().toLowerCase() === cat);
          return conf && conf.checkInFinalized && !conf.checkInChangesPending;
        });

      if (!currentSession.checkInFinalized && !curAllConfirmed) {
        throw ApiError.badRequest('Check-in must be finalized before checkout can be finalized');
      }
      if (
        currentSession.checkInChangesPending ||
        assignedCategories.some((cat) => {
          const conf = curCatConfs.find((c) => c.workerType.trim().toLowerCase() === cat);
          return conf && conf.checkInChangesPending;
        })
      ) {
        throw ApiError.badRequest(
          'Cannot finalize checkout while check-in has pending changes. Re-finalize check-in before proceeding with checkout finalization.'
        );
      }
      if (currentSession.checkOutFinalized) {
        throw ApiError.conflict('Checkout has already been finalized for this event');
      }

      // Persist all attendance documents atomically
      await this.attRepo.bulkUpsertAttendances(attendanceUpdates, dbSession);

      // Lock session finalization flag and idempotency metadata
      const finalizedSession = await this.sessionRepo.atomicFinalizeCheckOut(
        eventId,
        {
          actualNormalFinishTime: defaultFinishTime24h,
          actualNormalFinishDate: eventDefaultFinishDate,
          categoryFinishTimes: categoryFinishTimesToPersist,
          requirementFinishOverrides: overridesToPersist,
        },
        idempotencyRecord,
        dbSession
      );

      if (!finalizedSession) {
        throw ApiError.conflict('Checkout finalization state conflict or already finalized');
      }
    });

    return committedSummary;
  }

  /**
   * 5. PATCH /api/attendance/records/:attendanceId/correct
   * Executes attendance correction, absence reversal, and automatic metric recalculation.
   */
  async correctAttendance(
    userId: string,
    userRole: string,
    attendanceId: string,
    payload: CorrectAttendancePayload
  ): Promise<AttendanceRosterItem> {
    if (!attendanceId || !mongoose.Types.ObjectId.isValid(attendanceId)) {
      throw ApiError.badRequest('Invalid attendance record ID format');
    }

    if (!payload.reason || typeof payload.reason !== 'string' || payload.reason.trim().length < 5) {
      throw ApiError.badRequest('Correction reason is mandatory and must be at least 5 characters');
    }

    const record = await this.attRepo.findById(attendanceId);
    if (!record) {
      throw ApiError.notFound('Attendance record not found');
    }

    if (record.isStatusLocked) {
      throw ApiError.forbidden('Attendance record is permanently locked and cannot be modified');
    }

    const event = await this.validateEventAndOwnership(record.eventId.toString(), userId, userRole);
    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance operations cannot be performed on cancelled events');
    }

    // Enforce 24-hour normal correction window (§2 & §7)
    const windowInfo = calculateEventCorrectionWindow(event);
    if (windowInfo.isAfterDeadline) {
      throw ApiError.forbidden(
        `Normal attendance correction period has expired (deadline was ${windowInfo.correctionDeadlineAt.toISOString()})`
      );
    }

    const sessionDoc = await this.sessionRepo.findByEventId(record.eventId.toString());
    if (!sessionDoc) {
      throw ApiError.notFound('Attendance session not found for this event');
    }
    if (sessionDoc.lifecycleStatus === 'cancelled') {
      throw ApiError.badRequest('Attendance session is cancelled');
    }

    // Resolve worker user info for return DTO
    const workerUser = await User.findById(record.workerId).select('name email phone businessId');

    // Parse reporting time snapshot
    const repTimeVal = isValidTimeString(record.reportingTimeSnapshot);
    if (!repTimeVal.valid || !repTimeVal.normalized24h) {
      throw ApiError.badRequest(`Invalid reporting time snapshot '${record.reportingTimeSnapshot}'`);
    }
    const repDate = this.constructDateTime(event.date, repTimeVal.normalized24h);
    const [repH, repM] = repTimeVal.normalized24h.split(':').map(Number);
    const repMins = repH * 60 + repM;

    // Fields to update on record
    const updatedFields: Partial<IAttendance> = {};
    let prevValStr = '';
    let newValStr = '';
    let fieldName = 'status';

    const wasAbsent = record.status === 'absent' || record.arrivalStatus === 'absent';
    const isArrivalCorrection =
      wasAbsent ||
      payload.status === 'absent' ||
      payload.arrivalStatus === 'absent' ||
      payload.actualArrivalTime !== undefined ||
      payload.arrivalStatus !== undefined;

    if (isArrivalCorrection) {
      const now = new Date();
      const currentOperationalDate = getOperationalDateString(now, 'Asia/Kolkata');
      const eventOperationalDate = getOperationalDateString(event.date, 'Asia/Kolkata');

      if (currentOperationalDate < eventOperationalDate) {
        throw ApiError.badRequest('Check-in corrections cannot be recorded before the scheduled event day');
      }
      if (currentOperationalDate > eventOperationalDate) {
        throw ApiError.forbidden(
          'Check-in editing is closed because the scheduled event day has ended. Arrival status and check-in time can only be edited on the event day.'
        );
      }
    }

    // -------------------------------------------------------------------------
    // Case 1: Absence Reversal
    // -------------------------------------------------------------------------
    if (wasAbsent) {
      if (payload.status === 'absent') {
        throw ApiError.badRequest('Worker is already marked absent. Cannot correct absent to absent.');
      }

      let arrivalDate: Date;
      let normalizedArrivalStr: string;

      if (payload.actualArrivalTime && typeof payload.actualArrivalTime === 'string') {
        const arrVal = isValidTimeString(payload.actualArrivalTime);
        if (!arrVal.valid || !arrVal.normalized24h) {
          throw ApiError.badRequest(`Invalid arrival time '${payload.actualArrivalTime}'`);
        }
        arrivalDate = this.constructDateTime(event.date, arrVal.normalized24h);
        normalizedArrivalStr = arrVal.normalized24h;
      } else if (payload.arrivalStatus === 'on_time') {
        arrivalDate = repDate;
        normalizedArrivalStr = record.reportingTimeSnapshot;
      } else {
        throw ApiError.badRequest(
          'Actual arrival time is required when reversing an absence to late or uncommitted arrival'
        );
      }

      let newArrivalStatus: ArrivalStatus = 'on_time';
      let delayMinutes = 0;

      if (arrivalDate.getTime() > repDate.getTime()) {
        newArrivalStatus = 'late';
        delayMinutes = Math.round((arrivalDate.getTime() - repDate.getTime()) / 60000);
      } else {
        newArrivalStatus = 'on_time';
        delayMinutes = 0;
      }

      // Enforce arrivalStatus consistency if provided
      if (payload.arrivalStatus === 'on_time' && arrivalDate.getTime() > repDate.getTime()) {
        throw ApiError.badRequest(
          `Actual arrival time '${payload.actualArrivalTime}' is later than reporting time '${record.reportingTimeSnapshot}'. Worker must be marked Late.`
        );
      }
      if (payload.arrivalStatus === 'late' && arrivalDate.getTime() <= repDate.getTime()) {
        throw ApiError.badRequest(
          `Actual arrival time '${payload.actualArrivalTime}' is not later than reporting time '${record.reportingTimeSnapshot}'. Worker is On Time.`
        );
      }

      updatedFields.checkIn = arrivalDate;
      updatedFields.checkInSource = 'manager_actual';
      updatedFields.checkInRecordedBy = new mongoose.Types.ObjectId(userId);
      updatedFields.checkInRecordedAt = new Date();
      updatedFields.arrivalStatus = newArrivalStatus;
      updatedFields.delayMinutes = delayMinutes;

      // Subcase 1A: Checkout is not yet finalized
      if (!sessionDoc.checkOutFinalized) {
        updatedFields.status = 'checked_in';
        updatedFields.checkOut = undefined;
        updatedFields.checkOutSource = 'not_recorded';
        updatedFields.departureStatus = 'not_recorded';
        updatedFields.earlyDepartureMinutes = 0;
        updatedFields.overtimeMinutes = 0;
        updatedFields.durationMinutes = 0;
        fieldName = 'status';
        prevValStr = 'absent';
        newValStr = `checked_in (${newArrivalStatus} at ${normalizedArrivalStr})`;
      } else {
        // Subcase 1B: Checkout is finalized -> requires actualCheckoutTime or applyDefaultCheckout
        const useDefaultCheckout = Boolean(payload.applyDefaultCheckout);

        if (!payload.actualCheckoutTime && !useDefaultCheckout) {
          throw ApiError.badRequest(
            "When reversing absence after checkout finalization, you must either provide 'actualCheckoutTime' or set 'applyDefaultCheckout: true'"
          );
        }

        // Resolve applicable normal finishing time
        const catFinish = (sessionDoc.categoryFinishTimes || []).find(
          (c) => c.workerType === record.workerType
        );
        const reqOverride = (sessionDoc.requirementFinishOverrides || []).find(
          (o) => o.requirementId.toString() === record.requirementId.toString()
        );
        const applicableFinishTimeStr =
          record.applicableNormalFinishTimeSnapshot ||
          reqOverride?.normalFinishTime ||
          catFinish?.normalFinishTime ||
          sessionDoc.actualNormalFinishTime;

        if (!applicableFinishTimeStr) {
          throw ApiError.badRequest(
            'Session finishing-time configuration is missing. Please provide actual checkout time.'
          );
        }

        const finishVal = isValidTimeString(applicableFinishTimeStr);
        if (!finishVal.valid || !finishVal.normalized24h) {
          throw ApiError.badRequest(`Invalid applicable finish time '${applicableFinishTimeStr}'`);
        }

        let applicableFinishDate = this.constructDateTime(event.date, finishVal.normalized24h);
        const [finH, finM] = finishVal.normalized24h.split(':').map(Number);
        const finMins = finH * 60 + finM;

        if (finMins <= repMins) {
          applicableFinishDate = new Date(applicableFinishDate.getTime() + 24 * 60 * 60 * 1000);
        }

        updatedFields.applicableNormalFinishTimeSnapshot = applicableFinishTimeStr;
        updatedFields.applicableNormalFinishDate = applicableFinishDate;

        if (useDefaultCheckout) {
          // Use system-default checkout
          updatedFields.checkOut = applicableFinishDate;
          updatedFields.checkOutSource = 'system_default';
          updatedFields.checkOutRecordedBy = new mongoose.Types.ObjectId(userId);
          updatedFields.checkOutRecordedAt = new Date();
          updatedFields.departureStatus = 'normal';
          updatedFields.earlyDepartureMinutes = 0;
          updatedFields.overtimeMinutes = 0;
          updatedFields.durationMinutes = Math.round(
            (applicableFinishDate.getTime() - arrivalDate.getTime()) / 60000
          );
          updatedFields.status = 'checked_out';
          fieldName = 'status';
          prevValStr = 'absent';
          newValStr = `checked_out (default ${finishVal.normalized24h})`;
        } else {
          // Manager provided actual checkout time
          const outVal = isValidTimeString(payload.actualCheckoutTime);
          if (!outVal.valid || !outVal.normalized24h) {
            throw ApiError.badRequest(`Invalid checkout time '${payload.actualCheckoutTime}'`);
          }

          const departureDateBase = payload.actualDepartureDate || event.date;
          let checkoutDate = this.constructDateTime(departureDateBase, outVal.normalized24h);
          const [outH, outM] = outVal.normalized24h.split(':').map(Number);
          const outMins = outH * 60 + outM;

          if (!payload.actualDepartureDate && finMins <= repMins) {
            if (outMins <= repMins) {
              checkoutDate = new Date(checkoutDate.getTime() + 24 * 60 * 60 * 1000);
            }
          }

          if (checkoutDate.getTime() <= arrivalDate.getTime()) {
            throw ApiError.badRequest('Checkout time must be later than check-in arrival time');
          }

          let depStatus: DepartureStatus = 'normal';
          let earlyMins = 0;
          let overtimeMins = 0;

          if (checkoutDate.getTime() < applicableFinishDate.getTime()) {
            depStatus = 'early_departure';
            earlyMins = Math.round((applicableFinishDate.getTime() - checkoutDate.getTime()) / 60000);
          } else if (checkoutDate.getTime() > applicableFinishDate.getTime()) {
            depStatus = 'overtime';
            overtimeMins = Math.round((checkoutDate.getTime() - applicableFinishDate.getTime()) / 60000);
          }

          updatedFields.checkOut = checkoutDate;
          updatedFields.checkOutSource = 'manager_actual';
          updatedFields.checkOutRecordedBy = new mongoose.Types.ObjectId(userId);
          updatedFields.checkOutRecordedAt = new Date();
          updatedFields.departureStatus = depStatus;
          updatedFields.earlyDepartureMinutes = earlyMins;
          updatedFields.overtimeMinutes = overtimeMins;
          updatedFields.durationMinutes = Math.round((checkoutDate.getTime() - arrivalDate.getTime()) / 60000);
          updatedFields.status = 'checked_out';
          fieldName = 'status';
          prevValStr = 'absent';
          newValStr = `checked_out (${depStatus} at ${outVal.normalized24h})`;
        }
      }
    } else if (payload.status === 'absent' || payload.arrivalStatus === 'absent') {
      // Transition from Present/Late to Absent
      updatedFields.status = 'absent';
      updatedFields.arrivalStatus = 'absent';
      updatedFields.checkIn = null as any;
      updatedFields.checkInSource = 'not_recorded';
      updatedFields.delayMinutes = 0;
      updatedFields.checkOut = null as any;
      updatedFields.checkOutSource = 'not_recorded';
      updatedFields.departureStatus = 'not_recorded';
      updatedFields.earlyDepartureMinutes = 0;
      updatedFields.overtimeMinutes = 0;
      updatedFields.durationMinutes = 0;

      fieldName = 'status';
      prevValStr = record.status;
      newValStr = 'absent';
    } else {
      // -------------------------------------------------------------------------
      // Case 2: Non-Absent Worker Corrections
      // -------------------------------------------------------------------------

      // A. Check-in Timestamp Correction
      if (payload.actualArrivalTime !== undefined && payload.actualArrivalTime !== null) {
        const arrVal = isValidTimeString(payload.actualArrivalTime);
        if (!arrVal.valid || !arrVal.normalized24h) {
          throw ApiError.badRequest(`Invalid arrival time '${payload.actualArrivalTime}'`);
        }

        const arrivalDate = this.constructDateTime(event.date, arrVal.normalized24h);
        if (record.checkOut && record.checkOut.getTime() <= arrivalDate.getTime()) {
          throw ApiError.badRequest('New arrival time must be earlier than the recorded checkout time');
        }

        let newArrivalStatus: ArrivalStatus = 'on_time';
        let delayMinutes = 0;

        if (payload.arrivalStatus === 'on_time') {
          newArrivalStatus = 'on_time';
          delayMinutes = 0;
        } else if (arrivalDate.getTime() > repDate.getTime()) {
          newArrivalStatus = 'late';
          delayMinutes = Math.round((arrivalDate.getTime() - repDate.getTime()) / 60000);
        }

        updatedFields.checkIn = arrivalDate;
        updatedFields.checkInSource = 'manager_actual';
        updatedFields.checkInRecordedBy = new mongoose.Types.ObjectId(userId);
        updatedFields.checkInRecordedAt = new Date();
        updatedFields.arrivalStatus = newArrivalStatus;
        updatedFields.delayMinutes = delayMinutes;

        if (record.checkOut) {
          updatedFields.durationMinutes = Math.round(
            (record.checkOut.getTime() - arrivalDate.getTime()) / 60000
          );
        }

        fieldName = 'checkIn';
        prevValStr = record.checkIn ? record.checkIn.toISOString() : '';
        newValStr = arrivalDate.toISOString();
      }

      // B. Checkout Timestamp Correction
      if (payload.actualCheckoutTime !== undefined && payload.actualCheckoutTime !== null) {
        const checkInDate = updatedFields.checkIn || record.checkIn;
        if (!checkInDate) {
          throw ApiError.badRequest('Cannot record checkout time for a worker without a check-in record');
        }

        const outVal = isValidTimeString(payload.actualCheckoutTime);
        if (!outVal.valid || !outVal.normalized24h) {
          throw ApiError.badRequest(`Invalid checkout time '${payload.actualCheckoutTime}'`);
        }

        // Resolve worker's applicable normal finish time
        const catFinish = (sessionDoc.categoryFinishTimes || []).find(
          (c) => c.workerType === record.workerType
        );
        const reqOverride = (sessionDoc.requirementFinishOverrides || []).find(
          (o) => o.requirementId.toString() === record.requirementId.toString()
        );
        const applicableFinishTimeStr =
          record.applicableNormalFinishTimeSnapshot ||
          reqOverride?.normalFinishTime ||
          catFinish?.normalFinishTime ||
          sessionDoc.actualNormalFinishTime;

        if (!applicableFinishTimeStr) {
          throw ApiError.badRequest(
            'Applicable normal finish time configuration is missing for this worker'
          );
        }

        const finishVal = isValidTimeString(applicableFinishTimeStr);
        let applicableFinishDate = this.constructDateTime(event.date, finishVal.normalized24h!);
        const [finH, finM] = finishVal.normalized24h!.split(':').map(Number);
        const finMins = finH * 60 + finM;

        if (finMins <= repMins) {
          applicableFinishDate = new Date(applicableFinishDate.getTime() + 24 * 60 * 60 * 1000);
        }

        const departureDateBase = payload.actualDepartureDate || event.date;
        let checkoutDate = this.constructDateTime(departureDateBase, outVal.normalized24h);
        const [outH, outM] = outVal.normalized24h.split(':').map(Number);
        const outMins = outH * 60 + outM;

        if (!payload.actualDepartureDate && finMins <= repMins) {
          if (outMins <= repMins) {
            checkoutDate = new Date(checkoutDate.getTime() + 24 * 60 * 60 * 1000);
          }
        }

        if (checkoutDate.getTime() <= checkInDate.getTime()) {
          throw ApiError.badRequest('Checkout time must be later than check-in arrival time');
        }

        let depStatus: DepartureStatus = 'normal';
        let earlyMins = 0;
        let overtimeMins = 0;

        if (checkoutDate.getTime() < applicableFinishDate.getTime()) {
          depStatus = 'early_departure';
          earlyMins = Math.round((applicableFinishDate.getTime() - checkoutDate.getTime()) / 60000);
        } else if (checkoutDate.getTime() > applicableFinishDate.getTime()) {
          depStatus = 'overtime';
          overtimeMins = Math.round((checkoutDate.getTime() - applicableFinishDate.getTime()) / 60000);
        }

        updatedFields.checkOut = checkoutDate;
        updatedFields.checkOutSource = 'manager_actual';
        updatedFields.checkOutRecordedBy = new mongoose.Types.ObjectId(userId);
        updatedFields.checkOutRecordedAt = new Date();
        updatedFields.departureStatus = depStatus;
        updatedFields.earlyDepartureMinutes = earlyMins;
        updatedFields.overtimeMinutes = overtimeMins;
        updatedFields.durationMinutes = Math.round(
          (checkoutDate.getTime() - checkInDate.getTime()) / 60000
        );
        updatedFields.status = 'checked_out';

        fieldName = 'checkOut';
        prevValStr = record.checkOut ? record.checkOut.toISOString() : '';
        newValStr = checkoutDate.toISOString();
      }

      // C. Classification Correction (arrivalStatus or departureStatus)
      if (payload.arrivalStatus && !payload.actualArrivalTime) {
        if (payload.arrivalStatus === 'on_time') {
          updatedFields.arrivalStatus = 'on_time';
          updatedFields.checkIn = repDate;
          updatedFields.checkInSource = 'system_default';
          updatedFields.delayMinutes = 0;
          if (record.checkOut) {
            updatedFields.durationMinutes = Math.round(
              (record.checkOut.getTime() - repDate.getTime()) / 60000
            );
          }
          fieldName = 'arrivalStatus';
          prevValStr = record.arrivalStatus;
          newValStr = 'on_time';
        } else if (payload.arrivalStatus === 'late') {
          throw ApiError.badRequest(
            "Changing arrival status to 'late' requires supplying 'actualArrivalTime' to calculate delay"
          );
        }
      }

      if (payload.departureStatus && !payload.actualCheckoutTime) {
        if (payload.departureStatus === 'normal') {
          updatedFields.departureStatus = 'normal';
          updatedFields.earlyDepartureMinutes = 0;
          updatedFields.overtimeMinutes = 0;
          fieldName = 'departureStatus';
          prevValStr = record.departureStatus;
          newValStr = 'normal';
        }
      }

      if (payload.status && ['checked_in', 'checked_out', 'absent'].includes(payload.status)) {
        updatedFields.status = payload.status as any;
      }
    }

    // -------------------------------------------------------------------------
    // Audit History Entry
    // -------------------------------------------------------------------------
    const correction: any = {
      modifiedBy: new mongoose.Types.ObjectId(userId),
      modifiedAt: new Date(),
      field: fieldName,
      previousValue: prevValStr,
      previousSource: record.checkInSource,
      previousStatus: record.status,
      previousArrivalStatus: record.arrivalStatus,
      previousDepartureStatus: record.departureStatus,
      newValue: newValStr,
      newSource: updatedFields.checkInSource || updatedFields.checkOutSource || record.checkInSource,
      newStatus: updatedFields.status || record.status,
      newArrivalStatus: updatedFields.arrivalStatus || record.arrivalStatus,
      newDepartureStatus: updatedFields.departureStatus || record.departureStatus,
      reason: payload.reason.trim(),
    };

    // Reset approval status on this record and event-wide
    updatedFields.verificationStatus = 'pending_review';
    updatedFields.verifiedBy = undefined;
    updatedFields.verifiedAt = undefined;
    updatedFields.rejectionReason = undefined;

    // -------------------------------------------------------------------------
    // Transactional Execution
    // -------------------------------------------------------------------------
    let updatedRecord: IAttendance | null = null;
    const dbSession = await mongoose.startSession();

    try {
      await dbSession.withTransaction(async () => {
        updatedRecord = await this.attRepo.addCorrection(
          record._id.toString(),
          correction,
          updatedFields,
          dbSession
        );

        if (isArrivalCorrection) {
          if (sessionDoc.checkInFinalized) {
            await this.sessionRepo.markCheckInChangesPending(event._id.toString(), dbSession);
          }
          await this.sessionRepo.markCategoryCheckInChangesPending(event._id.toString(), record.workerType, dbSession);
        }

        // Reset session-level verification status
        await this.sessionRepo.resetVerificationStatus(event._id.toString(), dbSession);

        // Invalidate event-wide approval so all records reflect 'pending_review'
        await this.attRepo.resetVerificationStatusByEvent(event._id.toString(), dbSession);
      });
    } finally {
      await dbSession.endSession();
    }

    if (!updatedRecord) {
      throw ApiError.internal('Failed to persist attendance correction');
    }

    const rec = updatedRecord as IAttendance;

    return {
      workerId: record.workerId.toString(),
      workerName: workerUser?.name || 'Assigned Worker',
      workerEmail: workerUser?.email || '',
      workerPhone: workerUser?.phone || '',
      businessId: workerUser?.businessId || '',
      workerType: rec.workerType,
      requirementId: rec.requirementId.toString(),
      reportingTime: rec.reportingTimeSnapshot,
      reportingTimeSnapshot: rec.reportingTimeSnapshot,
      applicableNormalFinishTimeSnapshot: rec.applicableNormalFinishTimeSnapshot,
      applicableNormalFinishDate: rec.applicableNormalFinishDate || null,
      attendanceId: rec._id.toString(),
      status: rec.status,
      arrivalStatus: rec.arrivalStatus,
      checkIn: rec.checkIn || null,
      checkInSource: rec.checkInSource,
      delayMinutes: rec.delayMinutes,
      checkOut: rec.checkOut || null,
      checkOutSource: rec.checkOutSource,
      departureStatus: rec.departureStatus,
      earlyDepartureMinutes: rec.earlyDepartureMinutes,
      overtimeMinutes: rec.overtimeMinutes,
      durationMinutes: rec.durationMinutes,
      verificationStatus: rec.verificationStatus,
      verifiedBy: rec.verifiedBy?.toString(),
      verifiedAt: rec.verifiedAt,
      rejectionReason: rec.rejectionReason,
      corrections: rec.corrections,
      isAssigned: true,
    };
  }

  /**
   * 6. POST /api/attendance/events/:eventId/verify
   * Approves or rejects the complete event attendance roster with mandatory audit trail.
   */
  async verifyAttendance(
    userId: string,
    userRole: string,
    eventId: string,
    payload: VerifyAttendancePayload
  ): Promise<AttendanceVerificationSummary> {
    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      throw ApiError.badRequest('Invalid event ID format');
    }

    if (!payload.action || !['approve', 'reject'].includes(payload.action)) {
      throw ApiError.badRequest("Action must be either 'approve' or 'reject'");
    }

    if (payload.action === 'reject') {
      if (!payload.rejectionReason || typeof payload.rejectionReason !== 'string' || payload.rejectionReason.trim().length < 5) {
        throw ApiError.badRequest('Rejection reason is mandatory and must be at least 5 characters');
      }
    }

    const event = await this.validateEventAndOwnership(eventId, userId, userRole);
    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Attendance verification cannot be performed on cancelled events');
    }

    const sessionDoc = await this.sessionRepo.findByEventId(eventId);
    if (!sessionDoc) {
      throw ApiError.notFound('Attendance session not found for this event');
    }
    if (sessionDoc.lifecycleStatus === 'cancelled') {
      throw ApiError.badRequest('Attendance session is cancelled');
    }

    // Precondition: Checkout must be finalized before attendance can be verified
    if (!sessionDoc.checkOutFinalized) {
      throw ApiError.badRequest('Checkout must be finalized before attendance can be verified');
    }

    // Precondition: Open concerns must be resolved (§13)
    const openConcernsCount = await attendanceConcernRepository.countOpenByEventId(eventId);
    if (openConcernsCount > 0) {
      throw ApiError.badRequest(
        `Cannot verify attendance session while ${openConcernsCount} attendance concern(s) remain open. Please resolve all open concerns first.`
      );
    }

    const records = await this.attRepo.findByEventId(eventId);
    if (records.length === 0) {
      throw ApiError.badRequest('No attendance records found for this event');
    }

    // Incomplete attendance check: Every non-absent worker must have a valid checkout
    const incompleteWorkers: string[] = [];
    for (const r of records) {
      if (r.status !== 'absent') {
        if (!r.checkIn || !r.checkOut || r.status !== 'checked_out') {
          incompleteWorkers.push(r.workerId?.toString() || 'unknown');
        }
      }
    }

    if (incompleteWorkers.length > 0) {
      throw ApiError.badRequest(
        `Cannot verify attendance: ${incompleteWorkers.length} worker(s) have incomplete attendance records (missing checkout)`
      );
    }

    const targetStatus = payload.action === 'approve' ? 'approved' : 'rejected';
    const rejectionReason = payload.action === 'reject' ? payload.rejectionReason!.trim() : null;
    const verifiedByObjId = new mongoose.Types.ObjectId(userId);

    const dbSession = await mongoose.startSession();
    try {
      await dbSession.withTransaction(async () => {
        await this.attRepo.updateVerificationStatusByEvent(
          eventId,
          targetStatus,
          verifiedByObjId,
          rejectionReason,
          dbSession
        );

        await this.sessionRepo.updateVerificationStatus(
          eventId,
          targetStatus,
          verifiedByObjId,
          rejectionReason,
          dbSession
        );
      });
    } finally {
      await dbSession.endSession();
    }

    return {
      eventId,
      verificationStatus: targetStatus,
      verifiedBy: userId,
      verifiedAt: new Date().toISOString(),
      totalRecords: records.length,
      rejectionReason: rejectionReason || undefined,
    };
  }
}

export const attendanceService = new AttendanceService();

