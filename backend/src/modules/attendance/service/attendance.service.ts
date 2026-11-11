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
  type EventCorrectionWindow,
} from '../utils/attendance-window.util.js';

export { getOperationalDateString, calculateEventCorrectionWindow, type EventCorrectionWindow };

export interface FinalizeCheckInPayload {
  lateExceptions?: Array<{
    workerId: string;
    actualArrivalTime: string;
  }>;
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
  session: {
    checkInFinalized: boolean;
    checkInFinalizedAt?: Date;
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
  };
  latestReportingTime: string;
  latestReportingTimestamp: Date | null;
  canFinalizeCheckIn: boolean;
  totalAssigned: number;
  scheduledEventEndAt?: Date;
  correctionDeadlineAt?: Date;
  canNormalCorrect?: boolean;
  isAfterCorrectionDeadline?: boolean;
  openConcernsCount?: number;
  requirements: AttendanceRosterRequirementItem[];
  roster: AttendanceRosterItem[];
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
  ) {}

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
   * Helper: Combines event calendar date and a normalized 24-hour time string into a Date in Asia/Kolkata timezone.
   */
  private constructDateTime(eventDate: Date, timeStr24h: string): Date {
    const eventOperationalDate = getOperationalDateString(eventDate, 'Asia/Kolkata');
    const [yearStr, monthStr, dayStr] = eventOperationalDate.split('-');
    const [hStr, mStr] = timeStr24h.split(':');
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    const pad = (n: number) => n.toString().padStart(2, '0');

    return new Date(`${yearStr}-${monthStr}-${dayStr}T${pad(hours)}:${pad(minutes)}:00.000+05:30`);
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
      openConcernsCount,
      session: {
        checkInFinalized: session.checkInFinalized,
        checkInFinalizedAt: session.checkInFinalizedAt,
        actualNormalFinishTime: session.actualNormalFinishTime,
        actualNormalFinishDate: session.actualNormalFinishDate,
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
    if (session.checkInFinalized || session.checkOutFinalized) {
      throw ApiError.badRequest('Cannot record check-in: check-in has already been finalized for this event');
    }

    // 4. Check event-day restrictions
    const now = new Date();
    const currentOperationalDate = getOperationalDateString(now, 'Asia/Kolkata');
    const eventOperationalDate = getOperationalDateString(event.date, 'Asia/Kolkata');

    const isInitialMark = !existingRecord || existingRecord.arrivalStatus === 'unrecorded';

    if (isInitialMark) {
      if (currentOperationalDate < eventOperationalDate) {
        throw ApiError.badRequest(
          'Initial attendance marks can only be recorded on the scheduled event day (cannot mark before event day)'
        );
      }
      if (currentOperationalDate > eventOperationalDate) {
        throw ApiError.badRequest(
          'Initial attendance marks can only be recorded on the scheduled event day (event day has passed)'
        );
      }
    } else {
      if (currentOperationalDate < eventOperationalDate) {
        throw ApiError.badRequest('Attendance marks cannot be recorded before the scheduled event day');
      }
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

    // 4. Compute stable payload hash
    const payloadHash = this.computePayloadHash(payload);

    // 5. Idempotency Evaluation
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
      // Different key on already-finalized check-in -> 409 Conflict
      throw ApiError.conflict('Check-in has already been finalized for this event');
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

    const now = new Date();
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

      if (lateWorkerIds.has(wId)) {
        // Late worker from payload exception
        const lateInfo = lateDataMap.get(wId)!;
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
          durationMinutes: 0,
        });
      } else if (absentWorkerIds.has(wId)) {
        // Absent worker from payload exception
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
          durationMinutes: 0,
        });
      } else {
        const existing = existingAttMap.get(wId);
        if (existing && existing.status !== 'not_started' && existing.arrivalStatus !== 'unrecorded') {
          // Worker was already recorded and confirmed via individual check-in
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
            durationMinutes: 0,
          });
        } else {
          // Default Present / On-Time worker
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
            durationMinutes: 0,
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

    const committedSummary: FinalizeCheckInSummary = {
      eventId,
      totalProcessed,
      onTimeCount,
      lateCount,
      absentCount,
      checkInFinalized: true,
      checkInFinalizedAt: now.toISOString(),
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
      if (currentSession?.checkInFinalized) {
        throw ApiError.conflict('Check-in has already been finalized for this event');
      }

      // Persist all attendance documents atomically
      await this.attRepo.bulkUpsertAttendances(attendanceRecordsToUpsert, dbSession);

      // Lock session finalization flag and idempotency metadata
      const finalizedSession = await this.sessionRepo.atomicFinalizeCheckIn(
        eventId,
        idempotencyRecord,
        dbSession
      );

      if (!finalizedSession) {
        throw ApiError.conflict('Check-in finalization state conflict or already finalized');
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

    // 6. Idempotency Evaluation
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
        if (
          applicableFinishDate.getTime() > repDate.getTime() + 12 * 60 * 60 * 1000 ||
          applicableFinishDate.getUTCDate() !== repDate.getUTCDate()
        ) {
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
      if (currentSession.checkOutFinalized) {
        throw ApiError.conflict('Checkout has already been finalized for this event');
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

          let checkoutDate = this.constructDateTime(event.date, outVal.normalized24h);
          const [outH, outM] = outVal.normalized24h.split(':').map(Number);
          const outMins = outH * 60 + outM;

          if (finMins <= repMins) {
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

        let checkoutDate = this.constructDateTime(event.date, outVal.normalized24h);
        const [outH, outM] = outVal.normalized24h.split(':').map(Number);
        const outMins = outH * 60 + outM;

        if (finMins <= repMins) {
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

