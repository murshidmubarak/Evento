import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { Event, type IEvent } from '../../events/model/event.model.js';
import { User } from '../../auth/model/user.model.js';
import {
  Attendance,
  type IAttendance,
  type ArrivalStatus,
  type DepartureStatus,
} from '../model/attendance.model.js';
import {
  AttendanceConcern,
  type IAttendanceConcern,
  type ConcernStatus,
  type ConcernCategory,
  type ConcernResolutionOutcome,
} from '../model/attendance-concern.model.js';
import {
  attendanceConcernRepository,
  type AttendanceConcernRepository,
} from '../repository/attendance-concern.repository.js';
import {
  attendanceRepository,
  type AttendanceRepository,
} from '../repository/attendance.repository.js';
import {
  attendanceSessionRepository,
  type AttendanceSessionRepository,
} from '../repository/attendance-session.repository.js';
import { calculateEventCorrectionWindow } from '../utils/attendance-window.util.js';
import { isValidTimeString } from '../validation/attendance.validation.js';
import { notificationService } from '../../notifications/service/notification.service.js';

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

export class AttendanceConcernService {
  constructor(
    private readonly concernRepo: AttendanceConcernRepository = attendanceConcernRepository,
    private readonly attRepo: AttendanceRepository = attendanceRepository,
    private readonly sessionRepo: AttendanceSessionRepository = attendanceSessionRepository
  ) {}

  /**
   * Helper to construct a full Date from an eventDate and a 24h time string in UTC.
   */
  private constructDateTime(eventDate: Date, timeStr24h: string): Date {
    const d = new Date(eventDate);
    const [hStr, mStr] = timeStr24h.split(':');
    const hours = parseInt(hStr, 10);
    const minutes = parseInt(mStr, 10);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hours, minutes, 0, 0));
  }

  /**
   * Submits a new attendance concern raised by the authenticated worker.
   */
  async submitConcern(
    workerId: string,
    payload: SubmitConcernPayload
  ): Promise<IAttendanceConcern> {
    if (!payload.attendanceId || !mongoose.Types.ObjectId.isValid(payload.attendanceId)) {
      throw ApiError.badRequest('Invalid attendance ID format');
    }

    if (!payload.explanation || typeof payload.explanation !== 'string' || payload.explanation.trim().length < 5) {
      throw ApiError.badRequest('A meaningful explanation is required (minimum 5 characters)');
    }

    const validCategories: ConcernCategory[] = [
      'late_dispute',
      'absent_dispute',
      'time_recording_error',
      'technical_issue',
      'other',
    ];
    if (!payload.concernCategory || !validCategories.includes(payload.concernCategory)) {
      throw ApiError.badRequest('Valid concern category is required');
    }

    // 1. Fetch attendance record
    const attendance = await this.attRepo.findById(payload.attendanceId);
    if (!attendance) {
      throw ApiError.notFound('Attendance record not found');
    }

    // Authorization: Must belong to authenticated worker
    if (attendance.workerId.toString() !== workerId) {
      throw ApiError.forbidden('You can only raise concerns for your own attendance records');
    }

    // Condition: Cannot raise concern if record is permanently locked
    if (attendance.isStatusLocked) {
      throw ApiError.badRequest('This attendance record is permanently locked. No concerns can be raised.');
    }

    // Condition: Must be Late or Absent (cannot raise concern on On Time / Present)
    const isLateOrAbsent =
      attendance.arrivalStatus === 'late' ||
      attendance.arrivalStatus === 'absent' ||
      attendance.status === 'absent';

    if (!isLateOrAbsent) {
      throw ApiError.badRequest(
        'Concerns can only be raised for Late or Absent attendance records'
      );
    }

    // Condition: Only ONE concern per attendance record
    const existingConcern = await this.concernRepo.findByAttendanceId(payload.attendanceId);
    if (existingConcern) {
      throw ApiError.conflict(
        'A concern thread already exists for this attendance record. Duplicate concerns are not permitted.'
      );
    }

    // 2. Fetch Event and check timing window
    const event = await Event.findById(attendance.eventId);
    if (!event) {
      throw ApiError.notFound('Associated event not found');
    }
    if (event.status === 'cancelled') {
      throw ApiError.badRequest('Concerns cannot be raised for cancelled events');
    }

    const windowInfo = calculateEventCorrectionWindow(event);

    // Rule: Must be after scheduled event end
    if (windowInfo.isBeforeEventEnd) {
      throw ApiError.badRequest('Concerns can only be raised after the scheduled event has ended');
    }

    // Rule: Must be within 24 hours of event end
    if (windowInfo.isAfterDeadline) {
      throw ApiError.badRequest(
        `The 24-hour concern submission window has expired (deadline was ${windowInfo.correctionDeadlineAt.toISOString()})`
      );
    }

    const managerId = event.eventManagerId;
    if (!managerId) {
      throw ApiError.badRequest('This event does not have an assigned Event Manager');
    }

    const workerUser = await User.findById(workerId).select('name email phone');
    if (!workerUser) {
      throw ApiError.notFound('Worker user not found');
    }

    // 3. Create concern and flag attendance atomically
    const initialMessage = {
      senderId: new mongoose.Types.ObjectId(workerId),
      senderRole: 'worker' as const,
      message: payload.explanation.trim(),
      sentAt: new Date(),
    };

    let createdConcern: IAttendanceConcern | null = null;
    const dbSession = await mongoose.startSession();

    try {
      await dbSession.withTransaction(async () => {
        createdConcern = await this.concernRepo.create(
          {
            attendanceId: attendance._id as any,
            eventId: event._id as any,
            workerId: new mongoose.Types.ObjectId(workerId),
            managerId: managerId as any,
            concernCategory: payload.concernCategory,
            explanation: payload.explanation.trim(),
            additionalDetails: payload.additionalDetails?.trim(),
            status: 'open',
            messages: [initialMessage],
          },
          dbSession
        );

        await this.attRepo.setOpenConcern(
          attendance._id.toString(),
          createdConcern._id.toString(),
          true,
          dbSession
        );
      });
    } finally {
      await dbSession.endSession();
    }

    if (!createdConcern) {
      throw ApiError.internal('Failed to persist worker concern');
    }

    const concernDoc = createdConcern as IAttendanceConcern;

    // 4. Notify assigned manager
    try {
      await notificationService.createNotification({
        recipientId: managerId.toString(),
        type: 'attendance_concern_raised' as any,
        title: 'New Worker Attendance Concern',
        message: `${workerUser.name} submitted an attendance concern for "${event.title}" (${attendance.arrivalStatus.toUpperCase()})`,
        destinationRoute: '/manager/concerns',
        metadata: {
          eventId: event._id.toString(),
          attendanceId: attendance._id.toString(),
          concernId: concernDoc._id.toString(),
          workerId,
          workerName: workerUser.name,
          eventTitle: event.title,
          concernCategory: payload.concernCategory,
        },
        deduplicationKey: `concern_raised_${concernDoc._id.toString()}`,
      });
    } catch (notifErr) {
      console.error('[AttendanceConcernService] Notification to manager failed:', notifErr);
    }

    const populated = await this.concernRepo.findById(concernDoc._id.toString());
    return populated || concernDoc;
  }

  /**
   * Retrieves concern threads with role-based filtering.
   */
  async getConcerns(
    userId: string,
    userRole: string,
    filter: { eventId?: string; status?: ConcernStatus }
  ): Promise<IAttendanceConcern[]> {
    const queryFilter: any = { ...filter };

    if (userRole === 'worker') {
      queryFilter.workerId = userId;
    } else if (userRole === 'event_manager') {
      queryFilter.managerId = userId;
    } else if (userRole !== 'admin') {
      throw ApiError.forbidden('Unauthorized to view attendance concerns');
    }

    return this.concernRepo.findConcerns(queryFilter);
  }

  /**
   * Retrieves a single concern by ID with authorization verification.
   */
  async getConcernById(
    userId: string,
    userRole: string,
    concernId: string
  ): Promise<IAttendanceConcern> {
    if (!concernId || !mongoose.Types.ObjectId.isValid(concernId)) {
      throw ApiError.badRequest('Invalid concern ID format');
    }

    const concern = await this.concernRepo.findById(concernId);
    if (!concern) {
      throw ApiError.notFound('Attendance concern not found');
    }

    if (userRole === 'worker' && concern.workerId._id.toString() !== userId && concern.workerId.toString() !== userId) {
      throw ApiError.forbidden('You can only view your own attendance concerns');
    }

    if (userRole === 'event_manager') {
      const managerIdStr = (concern.managerId as any)?._id?.toString() || concern.managerId.toString();
      if (managerIdStr !== userId) {
        throw ApiError.forbidden('You are not authorized to view concerns for this event');
      }
    }

    return concern;
  }

  /**
   * Appends a reply message to an open concern conversation thread.
   */
  async addMessage(
    userId: string,
    userRole: string,
    concernId: string,
    message: string
  ): Promise<IAttendanceConcern> {
    if (!concernId || !mongoose.Types.ObjectId.isValid(concernId)) {
      throw ApiError.badRequest('Invalid concern ID format');
    }
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      throw ApiError.badRequest('Message content cannot be empty');
    }

    const concern = await this.getConcernById(userId, userRole, concernId);

    // Cannot add messages after concern is closed
    if (concern.status === 'closed') {
      throw ApiError.badRequest('Cannot add messages to a closed concern thread');
    }

    const messageRole: 'worker' | 'event_manager' | 'admin' =
      userRole === 'admin' ? 'admin' : userRole === 'worker' ? 'worker' : 'event_manager';

    const newMsg = {
      senderId: new mongoose.Types.ObjectId(userId),
      senderRole: messageRole,
      message: message.trim(),
      sentAt: new Date(),
    };

    const updated = await this.concernRepo.addMessage(concernId, newMsg);
    if (!updated) {
      throw ApiError.internal('Failed to append message to concern');
    }

    // Determine recipient for notification
    const isWorkerSender = userRole === 'worker';
    const recipientId = isWorkerSender
      ? (concern.managerId as any)?._id?.toString() || concern.managerId.toString()
      : (concern.workerId as any)?._id?.toString() || concern.workerId.toString();

    const senderUser = await User.findById(userId).select('name');
    const senderName = senderUser?.name || (isWorkerSender ? 'Worker' : 'Manager');

    try {
      await notificationService.createNotification({
        recipientId,
        type: 'attendance_concern_message' as any,
        title: 'New Message on Attendance Concern',
        message: `${senderName}: "${message.trim().slice(0, 80)}"`,
        destinationRoute: isWorkerSender ? '/manager/concerns' : '/worker/concerns',
        metadata: {
          concernId,
          eventId: (concern.eventId as any)?._id?.toString() || concern.eventId.toString(),
          senderId: userId,
          senderRole: userRole,
        },
        deduplicationKey: `concern_msg_${concernId}_${Date.now()}`,
      });
    } catch (err) {
      console.error('[AttendanceConcernService] Failed to dispatch message notification:', err);
    }

    return updated;
  }

  /**
   * Resolves a concern by accepting (with status update) or rejecting it.
   * In both cases, the attendance record is permanently locked.
   */
  async resolveConcern(
    userId: string,
    userRole: string,
    concernId: string,
    payload: ResolveConcernPayload
  ): Promise<IAttendanceConcern> {
    if (!['event_manager', 'admin'].includes(userRole)) {
      throw ApiError.forbidden('Only event managers and administrators can resolve attendance concerns');
    }

    if (!concernId || !mongoose.Types.ObjectId.isValid(concernId)) {
      throw ApiError.badRequest('Invalid concern ID format');
    }

    if (!payload.action || !['accept', 'reject'].includes(payload.action)) {
      throw ApiError.badRequest("Action must be either 'accept' or 'reject'");
    }

    if (
      !payload.resolutionExplanation ||
      typeof payload.resolutionExplanation !== 'string' ||
      payload.resolutionExplanation.trim().length < 5
    ) {
      throw ApiError.badRequest('Resolution explanation is mandatory (minimum 5 characters)');
    }

    const concern = await this.getConcernById(userId, userRole, concernId);
    if (concern.status === 'closed') {
      throw ApiError.badRequest('This concern has already been resolved and closed');
    }

    const attendance = await this.attRepo.findById(
      (concern.attendanceId as any)?._id?.toString() || concern.attendanceId.toString()
    );
    if (!attendance) {
      throw ApiError.notFound('Associated attendance record not found');
    }

    if (attendance.isStatusLocked) {
      throw ApiError.badRequest('Attendance record is already permanently locked');
    }

    const event = await Event.findById(attendance.eventId);
    if (!event) {
      throw ApiError.notFound('Associated event not found');
    }

    const sessionDoc = await this.sessionRepo.findByEventId(event._id.toString());

    // -------------------------------------------------------------------------
    // Execution inside MongoDB Multi-Document Transaction
    // -------------------------------------------------------------------------
    let resolvedConcern: IAttendanceConcern | null = null;
    const dbSession = await mongoose.startSession();

    try {
      await dbSession.withTransaction(async () => {
        if (payload.action === 'accept') {
          // Validate resulting status
          const validStatuses: Array<'on_time' | 'late' | 'absent'> = ['on_time', 'late', 'absent'];
          const targetArrival = payload.resultingArrivalStatus;
          if (!targetArrival || !validStatuses.includes(targetArrival)) {
            throw ApiError.badRequest(
              "When accepting a concern, a valid 'resultingArrivalStatus' ('on_time', 'late', 'absent') is required"
            );
          }

          const repTimeVal = isValidTimeString(attendance.reportingTimeSnapshot);
          const repDate = this.constructDateTime(
            event.date,
            repTimeVal.valid && repTimeVal.normalized24h ? repTimeVal.normalized24h : '09:00'
          );

          const updatedFields: Partial<IAttendance> = {
            isStatusLocked: true,
            statusLockedAt: new Date(),
            statusLockedReason: 'concern_accepted',
            statusLockedBy: new mongoose.Types.ObjectId(userId),
            hasOpenConcern: false,
            activeConcernId: null as any,
          };

          let fieldName = 'arrivalStatus';
          let prevValStr: string = attendance.arrivalStatus;
          let newValStr: string = targetArrival;

          if (targetArrival === 'absent') {
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
          } else if (targetArrival === 'on_time') {
            updatedFields.arrivalStatus = 'on_time';
            updatedFields.checkIn = repDate;
            updatedFields.checkInSource = 'manager_actual';
            updatedFields.checkInRecordedBy = new mongoose.Types.ObjectId(userId);
            updatedFields.checkInRecordedAt = new Date();
            updatedFields.delayMinutes = 0;

            if (sessionDoc?.checkOutFinalized) {
              updatedFields.status = 'checked_out';
              if (attendance.checkOut) {
                updatedFields.durationMinutes = Math.round(
                  (attendance.checkOut.getTime() - repDate.getTime()) / 60000
                );
              }
            } else {
              updatedFields.status = 'checked_in';
            }
          } else if (targetArrival === 'late') {
            if (!payload.resultingActualArrivalTime) {
              throw ApiError.badRequest(
                "When accepting as 'late', 'resultingActualArrivalTime' is mandatory"
              );
            }
            const arrVal = isValidTimeString(payload.resultingActualArrivalTime);
            if (!arrVal.valid || !arrVal.normalized24h) {
              throw ApiError.badRequest(`Invalid arrival time '${payload.resultingActualArrivalTime}'`);
            }

            const arrivalDate = this.constructDateTime(event.date, arrVal.normalized24h);
            const delayMinutes = Math.max(
              0,
              Math.round((arrivalDate.getTime() - repDate.getTime()) / 60000)
            );

            updatedFields.arrivalStatus = 'late';
            updatedFields.checkIn = arrivalDate;
            updatedFields.checkInSource = 'manager_actual';
            updatedFields.checkInRecordedBy = new mongoose.Types.ObjectId(userId);
            updatedFields.checkInRecordedAt = new Date();
            updatedFields.delayMinutes = delayMinutes;

            if (sessionDoc?.checkOutFinalized) {
              updatedFields.status = 'checked_out';
              if (attendance.checkOut) {
                updatedFields.durationMinutes = Math.round(
                  (attendance.checkOut.getTime() - arrivalDate.getTime()) / 60000
                );
              }
            } else {
              updatedFields.status = 'checked_in';
            }
            newValStr = `late at ${arrVal.normalized24h}`;
          }

          // Build audit correction record
          const correction: any = {
            modifiedBy: new mongoose.Types.ObjectId(userId),
            modifiedAt: new Date(),
            field: fieldName,
            previousValue: prevValStr,
            previousSource: attendance.checkInSource,
            previousStatus: attendance.status,
            previousArrivalStatus: attendance.arrivalStatus,
            previousDepartureStatus: attendance.departureStatus,
            newValue: newValStr,
            newSource: 'manager_actual',
            newStatus: updatedFields.status || attendance.status,
            newArrivalStatus: updatedFields.arrivalStatus || attendance.arrivalStatus,
            newDepartureStatus: updatedFields.departureStatus || attendance.departureStatus,
            reason: `Concern Accepted: ${payload.resolutionExplanation.trim()}`,
          };

          // Reset verification if needed
          updatedFields.verificationStatus = 'pending_review';

          await this.attRepo.addCorrection(
            attendance._id.toString(),
            correction,
            updatedFields,
            dbSession
          );

          if (sessionDoc) {
            await this.sessionRepo.resetVerificationStatus(event._id.toString(), dbSession);
          }

          resolvedConcern = await this.concernRepo.closeConcern(
            concernId,
            {
              resolutionOutcome: 'accepted',
              resolutionExplanation: payload.resolutionExplanation.trim(),
              resultingArrivalStatus: targetArrival,
              resultingActualArrivalTime: payload.resultingActualArrivalTime,
              closedBy: userId,
            },
            dbSession
          );
        } else {
          // REJECT: Lock attendance status, do not create correction audit record, keep current status
          await this.attRepo.lockAttendanceStatus(
            attendance._id.toString(),
            'concern_rejected',
            userId,
            dbSession
          );

          resolvedConcern = await this.concernRepo.closeConcern(
            concernId,
            {
              resolutionOutcome: 'rejected',
              resolutionExplanation: payload.resolutionExplanation.trim(),
              closedBy: userId,
            },
            dbSession
          );
        }
      });
    } finally {
      await dbSession.endSession();
    }

    if (!resolvedConcern) {
      throw ApiError.internal('Failed to complete concern resolution');
    }

    const doc = resolvedConcern as IAttendanceConcern;

    // Notify worker of resolution
    try {
      const outcomeText = payload.action === 'accept' ? 'ACCEPTED' : 'REJECTED';
      const workerIdStr = (doc.workerId as any)?._id?.toString() || doc.workerId.toString();

      await notificationService.createNotification({
        recipientId: workerIdStr,
        type: 'attendance_concern_resolved' as any,
        title: `Attendance Concern ${outcomeText}`,
        message: `Your attendance concern for "${event.title}" was ${outcomeText}. Note: ${payload.resolutionExplanation.trim()}`,
        destinationRoute: '/worker/concerns',
        metadata: {
          concernId: doc._id.toString(),
          eventId: event._id.toString(),
          eventTitle: event.title,
          outcome: doc.resolutionOutcome,
          resultingArrivalStatus: doc.resultingArrivalStatus,
        },
        deduplicationKey: `concern_resolved_${doc._id.toString()}`,
      });
    } catch (notifErr) {
      console.error('[AttendanceConcernService] Notification to worker failed:', notifErr);
    }

    return doc;
  }

  /**
   * Retrieves all attendance records for the authenticated worker, decorated with
   * concern eligibility, deadline timestamps, and active/closed concern metadata.
   */
  async getWorkerAttendanceRecords(workerId: string): Promise<any[]> {
    if (!workerId || !mongoose.Types.ObjectId.isValid(workerId)) {
      throw ApiError.badRequest('Invalid worker ID format');
    }

    const records = await this.attRepo.findByWorkerId(workerId);
    const results: any[] = [];

    for (const r of records) {
      const event: any = r.eventId;
      if (!event) continue;

      const windowInfo = calculateEventCorrectionWindow(event);

      // Check existing concern
      const existingConcern = await this.concernRepo.findByAttendanceId(r._id.toString());

      const isLateOrAbsent =
        r.arrivalStatus === 'late' || r.arrivalStatus === 'absent' || r.status === 'absent';

      let canRaiseConcern = false;
      let eligibilityReason = 'eligible';

      if (r.isStatusLocked) {
        canRaiseConcern = false;
        eligibilityReason = 'permanently_locked';
      } else if (existingConcern) {
        canRaiseConcern = false;
        eligibilityReason = existingConcern.status === 'open' ? 'already_open' : 'already_closed';
      } else if (!isLateOrAbsent) {
        canRaiseConcern = false;
        eligibilityReason = 'status_on_time';
      } else if (windowInfo.isBeforeEventEnd) {
        canRaiseConcern = false;
        eligibilityReason = 'event_not_ended';
      } else if (windowInfo.isAfterDeadline) {
        canRaiseConcern = false;
        eligibilityReason = 'deadline_expired';
      } else {
        canRaiseConcern = true;
        eligibilityReason = 'eligible';
      }

      results.push({
        attendanceId: r._id.toString(),
        eventId: event._id.toString(),
        eventTitle: event.title,
        eventType: event.eventType,
        eventDate: event.date,
        eventStartTime: event.startTime,
        eventEndTime: event.endTime,
        eventLocation: event.location,
        eventStatus: event.status,
        workerType: r.workerType,
        reportingTime: r.reportingTimeSnapshot,
        arrivalStatus: r.arrivalStatus,
        departureStatus: r.departureStatus,
        status: r.status,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        delayMinutes: r.delayMinutes,
        isStatusLocked: Boolean(r.isStatusLocked),
        hasOpenConcern: Boolean(r.hasOpenConcern),
        scheduledEventEndAt: windowInfo.scheduledEventEndAt,
        correctionDeadlineAt: windowInfo.correctionDeadlineAt,
        isBeforeEventEnd: windowInfo.isBeforeEventEnd,
        isAfterDeadline: windowInfo.isAfterDeadline,
        canRaiseConcern,
        eligibilityReason,
        concern: existingConcern
          ? {
              concernId: existingConcern._id.toString(),
              status: existingConcern.status,
              concernCategory: existingConcern.concernCategory,
              explanation: existingConcern.explanation,
              resolutionOutcome: existingConcern.resolutionOutcome,
              resolutionExplanation: existingConcern.resolutionExplanation,
              resultingArrivalStatus: existingConcern.resultingArrivalStatus,
              createdAt: existingConcern.createdAt,
              closedAt: existingConcern.closedAt,
            }
          : null,
      });
    }

    return results;
  }
}

export const attendanceConcernService = new AttendanceConcernService();
