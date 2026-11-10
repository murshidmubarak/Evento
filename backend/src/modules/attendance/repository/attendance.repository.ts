import mongoose, { type ClientSession, type UpdateQuery } from 'mongoose';
import {
  Attendance,
  type IAttendance,
  type IAttendanceCorrection,
} from '../model/attendance.model.js';

export interface AttendanceEventSummary {
  total: number;
  notStarted: number;
  checkedIn: number;
  checkedOut: number;
  absent: number;
  onTime: number;
  late: number;
  earlyDeparture: number;
  overtime: number;
  pendingReview: number;
  approved: number;
  rejected: number;
  totalDurationMinutes: number;
  totalOvertimeMinutes: number;
}

export class AttendanceRepository {
  /**
   * Create a single attendance document.
   */
  async create(data: Partial<IAttendance>, session?: ClientSession): Promise<IAttendance> {
    const doc = new Attendance(data);
    return doc.save({ session });
  }

  /**
   * Find an attendance record by ID.
   */
  async findById(id: string, session?: ClientSession): Promise<IAttendance | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const query = Attendance.findById(id);
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find an attendance record by event and worker.
   */
  async findByEventAndWorker(
    eventId: string,
    workerId: string,
    session?: ClientSession
  ): Promise<IAttendance | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(workerId)) {
      return null;
    }
    const query = Attendance.findOne({
      eventId: new mongoose.Types.ObjectId(eventId),
      workerId: new mongoose.Types.ObjectId(workerId),
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find an attendance record by event, requirement, and worker.
   */
  async findByEventRequirementAndWorker(
    eventId: string,
    requirementId: string,
    workerId: string,
    session?: ClientSession
  ): Promise<IAttendance | null> {
    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(requirementId) ||
      !mongoose.Types.ObjectId.isValid(workerId)
    ) {
      return null;
    }
    const query = Attendance.findOne({
      eventId: new mongoose.Types.ObjectId(eventId),
      requirementId: new mongoose.Types.ObjectId(requirementId),
      workerId: new mongoose.Types.ObjectId(workerId),
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find all attendance records for an event, sorted by workerType and createdAt.
   */
  async findByEventId(eventId: string, session?: ClientSession): Promise<IAttendance[]> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return [];
    const query = Attendance.find({ eventId: new mongoose.Types.ObjectId(eventId) })
      .populate('workerId', 'name email phone businessId')
      .sort({ workerType: 1, createdAt: 1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find all attendance records for a specific Work Requirement.
   */
  async findByRequirementId(requirementId: string, session?: ClientSession): Promise<IAttendance[]> {
    if (!mongoose.Types.ObjectId.isValid(requirementId)) return [];
    const query = Attendance.find({ requirementId: new mongoose.Types.ObjectId(requirementId) })
      .populate('workerId', 'name email phone businessId')
      .sort({ createdAt: 1 });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find attendance records for a worker with optional pagination.
   */
  async findByWorkerId(
    workerId: string,
    options: { limit?: number; skip?: number } = {},
    session?: ClientSession
  ): Promise<IAttendance[]> {
    if (!mongoose.Types.ObjectId.isValid(workerId)) return [];
    const query = Attendance.find({ workerId: new mongoose.Types.ObjectId(workerId) })
      .populate('eventId', 'title eventType date startTime endTime status location')
      .sort({ createdAt: -1 });

    if (options.skip) query.skip(options.skip);
    if (options.limit) query.limit(options.limit);
    if (session) query.session(session);

    return query.exec();
  }

  /**
   * Count total attendance records for a worker.
   */
  async countByWorkerId(workerId: string, session?: ClientSession): Promise<number> {
    if (!mongoose.Types.ObjectId.isValid(workerId)) return 0;
    const query = Attendance.countDocuments({ workerId: new mongoose.Types.ObjectId(workerId) });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Bulk upserts attendance records matching the { eventId, workerId } unique key.
   * Leverages MongoDB bulkWrite with updateOne(upsert: true).
   */
  async bulkUpsertAttendances(
    records: Array<{
      eventId: mongoose.Types.ObjectId | string;
      workerId: mongoose.Types.ObjectId | string;
      [key: string]: any;
    }>,
    session?: ClientSession
  ): Promise<any> {
    if (!records || records.length === 0) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };

    const operations = records.map((record) => {
      const { eventId, workerId, ...rest } = record;
      const filter = {
        eventId: new mongoose.Types.ObjectId(eventId),
        workerId: new mongoose.Types.ObjectId(workerId),
      };

      return {
        updateOne: {
          filter,
          update: {
            $set: rest,
            $setOnInsert: {
              eventId: filter.eventId,
              workerId: filter.workerId,
            },
          },
          upsert: true,
        },
      };
    });

    const options: Record<string, unknown> = { ordered: false };
    if (session) options.session = session;

    return Attendance.bulkWrite(operations as any, options);
  }

  /**
   * Update attendance record by ID.
   */
  async updateById(
    id: string,
    updateData: UpdateQuery<IAttendance>,
    session?: ClientSession
  ): Promise<IAttendance | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const query = Attendance.findByIdAndUpdate(id, updateData, { new: true });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Update attendance record by eventId and workerId.
   */
  async updateByEventAndWorker(
    eventId: string,
    workerId: string,
    updateData: UpdateQuery<IAttendance>,
    session?: ClientSession
  ): Promise<IAttendance | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(workerId)) {
      return null;
    }
    const query = Attendance.findOneAndUpdate(
      {
        eventId: new mongoose.Types.ObjectId(eventId),
        workerId: new mongoose.Types.ObjectId(workerId),
      },
      updateData,
      { new: true }
    );
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Atomically upserts an individual worker attendance record by { eventId, workerId }.
   */
  async upsertIndividualCheckIn(
    eventId: string,
    workerId: string,
    updateData: Partial<IAttendance>,
    correction?: IAttendanceCorrection,
    session?: ClientSession
  ): Promise<IAttendance | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId) || !mongoose.Types.ObjectId.isValid(workerId)) {
      return null;
    }

    const filter = {
      eventId: new mongoose.Types.ObjectId(eventId),
      workerId: new mongoose.Types.ObjectId(workerId),
    };

    const { eventId: _eId, workerId: _wId, ...cleanUpdateData } = updateData as any;

    const updateOps: any = {
      $set: cleanUpdateData,
      $setOnInsert: {
        eventId: filter.eventId,
        workerId: filter.workerId,
      },
    };

    if (correction) {
      updateOps.$push = { corrections: correction };
    }

    const query = Attendance.findOneAndUpdate(
      filter,
      updateOps,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (session) query.session(session);

    return query.exec();
  }

  /**
   * Appends an immutable correction record and applies updated field values.
   */
  async addCorrection(
    id: string,
    correction: IAttendanceCorrection,
    updateFields: Partial<IAttendance> = {},
    session?: ClientSession
  ): Promise<IAttendance | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;

    const updateDoc: UpdateQuery<IAttendance> = {
      $push: { corrections: correction },
      $set: updateFields,
    };

    const query = Attendance.findByIdAndUpdate(id, updateDoc, { new: true });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Bulk updates the verification status for all attendance records of an event.
   */
  async updateVerificationStatusByEvent(
    eventId: string,
    verificationStatus: 'pending_review' | 'approved' | 'rejected',
    verifiedBy?: mongoose.Types.ObjectId | null,
    rejectionReason?: string | null,
    session?: ClientSession
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return { matchedCount: 0, modifiedCount: 0 };

    const updateDoc: any = {
      $set: {
        verificationStatus,
        verifiedBy: verifiedBy || null,
        verifiedAt: verifiedBy ? new Date() : null,
        rejectionReason: rejectionReason || null,
      },
    };

    const options: Record<string, unknown> = {};
    if (session) options.session = session;

    return Attendance.updateMany(
      { eventId: new mongoose.Types.ObjectId(eventId) },
      updateDoc,
      options
    );
  }

  /**
   * Resets verification status for all attendance records of an event to 'pending_review'.
   * Used when any record correction invalidates an event-level approval.
   */
  async resetVerificationStatusByEvent(
    eventId: string,
    session?: ClientSession
  ): Promise<any> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return { matchedCount: 0, modifiedCount: 0 };

    const updateDoc: any = {
      $set: {
        verificationStatus: 'pending_review',
        verifiedBy: null,
        verifiedAt: null,
        rejectionReason: null,
      },
    };

    const options: Record<string, unknown> = {};
    if (session) options.session = session;

    return Attendance.updateMany(
      { eventId: new mongoose.Types.ObjectId(eventId) },
      updateDoc,
      options
    );
  }

  /**
   * Calculates comprehensive operational attendance summary metrics for an event.
   */
  async getEventAttendanceSummary(eventId: string, session?: ClientSession): Promise<AttendanceEventSummary> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return {
        total: 0,
        notStarted: 0,
        checkedIn: 0,
        checkedOut: 0,
        absent: 0,
        onTime: 0,
        late: 0,
        earlyDeparture: 0,
        overtime: 0,
        pendingReview: 0,
        approved: 0,
        rejected: 0,
        totalDurationMinutes: 0,
        totalOvertimeMinutes: 0,
      };
    }

    const records = await this.findByEventId(eventId, session);

    const summary: AttendanceEventSummary = {
      total: records.length,
      notStarted: 0,
      checkedIn: 0,
      checkedOut: 0,
      absent: 0,
      onTime: 0,
      late: 0,
      earlyDeparture: 0,
      overtime: 0,
      pendingReview: 0,
      approved: 0,
      rejected: 0,
      totalDurationMinutes: 0,
      totalOvertimeMinutes: 0,
    };

    for (const r of records) {
      if (r.status === 'not_started') summary.notStarted++;
      if (r.status === 'checked_in') summary.checkedIn++;
      if (r.status === 'checked_out') summary.checkedOut++;
      if (r.status === 'absent') summary.absent++;

      if (r.arrivalStatus === 'on_time') summary.onTime++;
      if (r.arrivalStatus === 'late') summary.late++;

      if (r.departureStatus === 'early_departure') summary.earlyDeparture++;
      if (r.departureStatus === 'overtime') summary.overtime++;

      if (r.verificationStatus === 'pending_review') summary.pendingReview++;
      if (r.verificationStatus === 'approved') summary.approved++;
      if (r.verificationStatus === 'rejected') summary.rejected++;

      summary.totalDurationMinutes += r.durationMinutes || 0;
      summary.totalOvertimeMinutes += r.overtimeMinutes || 0;
    }

    return summary;
  }

  /**
   * Permanently lock an attendance record's status.
   */
  async lockAttendanceStatus(
    attendanceId: string,
    reason: string,
    lockedBy: string,
    session?: ClientSession
  ): Promise<IAttendance | null> {
    if (!mongoose.Types.ObjectId.isValid(attendanceId)) return null;
    const query = Attendance.findByIdAndUpdate(
      attendanceId,
      {
        $set: {
          isStatusLocked: true,
          statusLockedAt: new Date(),
          statusLockedReason: reason,
          statusLockedBy: new mongoose.Types.ObjectId(lockedBy),
          hasOpenConcern: false,
        },
      },
      { new: true }
    );
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Updates open concern flag and active concern reference on an attendance record.
   */
  async setOpenConcern(
    attendanceId: string,
    concernId: string | null,
    hasOpen: boolean,
    session?: ClientSession
  ): Promise<IAttendance | null> {
    if (!mongoose.Types.ObjectId.isValid(attendanceId)) return null;
    const update: any = {
      $set: {
        hasOpenConcern: hasOpen,
        activeConcernId: concernId ? new mongoose.Types.ObjectId(concernId) : null,
      },
    };
    const query = Attendance.findByIdAndUpdate(attendanceId, update, { new: true });
    if (session) query.session(session);
    return query.exec();
  }
}

export const attendanceRepository = new AttendanceRepository();

