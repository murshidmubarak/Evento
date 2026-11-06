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
} from '../model/attendance-session.model.js';
import {
  Attendance,
  type IAttendance,
} from '../model/attendance.model.js';
import {
  AttendanceSessionRepository,
  attendanceSessionRepository,
} from '../repository/attendance-session.repository.js';
import {
  AttendanceRepository,
  attendanceRepository,
} from '../repository/attendance.repository.js';
import { isValidTimeString } from '../validation/attendance.validation.js';

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
  attendanceId: string | null;
  status: string;
  arrivalStatus: string;
  checkIn: Date | null;
  checkInSource: string;
  delayMinutes: number;
  isAssigned: boolean;
}

export interface AttendanceRosterResponse {
  eventId: string;
  eventTitle: string;
  eventDate: Date;
  session: {
    checkInFinalized: boolean;
    checkInFinalizedAt?: Date;
    lifecycleStatus: string;
  };
  latestReportingTime: string;
  latestReportingTimestamp: Date | null;
  canFinalizeCheckIn: boolean;
  totalAssigned: number;
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
   * Helper: Combines event calendar date and a normalized 24-hour time string into a UTC Date.
   */
  private constructDateTime(eventDate: Date, timeStr24h: string): Date {
    const d = new Date(eventDate);
    const [hStr, mStr] = timeStr24h.split(':');
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);

    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hours, minutes, 0, 0));
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
    const canFinalizeCheckIn =
      !session.checkInFinalized &&
      latestReportingTimestamp !== null &&
      now.getTime() >= latestReportingTimestamp.getTime() &&
      event.status !== 'completed';

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
        attendanceId: att?._id?.toString() || null,
        status: att?.status || 'not_started',
        arrivalStatus: att?.arrivalStatus || 'unrecorded',
        checkIn: att?.checkIn || null,
        checkInSource: att?.checkInSource || 'not_recorded',
        delayMinutes: att?.delayMinutes ?? 0,
        isAssigned: true,
      };
    });

    return {
      eventId,
      eventTitle: event.title,
      eventDate: event.date,
      session: {
        checkInFinalized: session.checkInFinalized,
        checkInFinalizedAt: session.checkInFinalizedAt,
        lifecycleStatus: session.lifecycleStatus,
      },
      latestReportingTime: latestReportingTimeStr,
      latestReportingTimestamp,
      canFinalizeCheckIn,
      totalAssigned: roster.length,
      roster,
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
    payload: FinalizeCheckInPayload
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
    if (latestReportingTimestamp && now.getTime() < latestReportingTimestamp.getTime()) {
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
    const attendanceRecordsToUpsert: any[] = [];
    const managerObjectId = new mongoose.Types.ObjectId(userId);

    for (const [wId, workerInfo] of assignedWorkerMap.entries()) {
      const repDate = workerReportingDateMap.get(wId)!;

      if (lateWorkerIds.has(wId)) {
        // Late worker
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
        // Absent worker
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

    const totalProcessed = assignedWorkerMap.size;
    const lateCount = lateWorkerIds.size;
    const absentCount = absentWorkerIds.size;
    const onTimeCount = totalProcessed - lateCount - absentCount;

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
}

export const attendanceService = new AttendanceService();

