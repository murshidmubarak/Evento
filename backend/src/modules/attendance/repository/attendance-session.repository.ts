import mongoose, { type ClientSession, type UpdateQuery } from 'mongoose';
import {
  AttendanceSession,
  type IAttendanceSession,
  type AttendanceLifecycleStatus,
  type IFinalizationIdempotency,
  type IRequirementFinishOverride,
} from '../model/attendance-session.model.js';

export class AttendanceSessionRepository {
  /**
   * Find an attendance session by event ID.
   */
  async findByEventId(eventId: string, session?: ClientSession): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;
    const query = AttendanceSession.findOne({ eventId: new mongoose.Types.ObjectId(eventId) });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Atomic get-or-create session using unique eventId index upsert.
   * Eliminates race conditions during concurrent manager loads or page refreshes.
   */
  async getOrCreateSession(eventId: string, session?: ClientSession): Promise<IAttendanceSession> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      throw new Error(`Invalid event ID format: ${eventId}`);
    }

    const options: Record<string, unknown> = {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    };
    if (session) options.session = session;

    try {
      const result = await AttendanceSession.findOneAndUpdate(
        { eventId: new mongoose.Types.ObjectId(eventId) },
        {
          $setOnInsert: {
            eventId: new mongoose.Types.ObjectId(eventId),
            checkInFinalized: false,
            checkOutFinalized: false,
            lifecycleStatus: 'checkin_in_progress',
            requirementFinishOverrides: [],
          },
        },
        options
      );

      if (result) return result as IAttendanceSession;
    } catch (err: any) {
      // In high-concurrency scenarios, competing upserts can trigger an E11000 duplicate key error
      // on the unique eventId index. Safely recover by returning the winner's committed document.
      if (err?.code === 11000 || (err?.name === 'MongoServerError' && err?.code === 11000)) {
        const existing = await this.findByEventId(eventId, session);
        if (existing) return existing;
      }
      throw err;
    }

    const fallback = await this.findByEventId(eventId, session);
    if (!fallback) {
      throw new Error(`Failed to retrieve or create attendance session for event ${eventId}`);
    }
    return fallback;
  }

  /**
   * Create an attendance session document directly.
   */
  async create(data: Partial<IAttendanceSession>, session?: ClientSession): Promise<IAttendanceSession> {
    const doc = new AttendanceSession(data);
    return doc.save({ session });
  }

  /**
   * Update an attendance session by event ID.
   */
  async updateByEventId(
    eventId: string,
    updateData: UpdateQuery<IAttendanceSession>,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;
    const query = AttendanceSession.findOneAndUpdate(
      { eventId: new mongoose.Types.ObjectId(eventId) },
      updateData,
      { new: true }
    );
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Atomic check-in finalization locking.
   * Asserts checkInFinalized was false; transitions state atomically to checkin_finalized.
   */
  async atomicFinalizeCheckIn(
    eventId: string,
    checkInRecord: IFinalizationIdempotency,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const query = AttendanceSession.findOneAndUpdate(
      {
        eventId: new mongoose.Types.ObjectId(eventId),
        checkInFinalized: false,
      },
      {
        $set: {
          checkInFinalized: true,
          checkInFinalizedAt: checkInRecord.finalizedAt || new Date(),
          checkInFinalizedBy: checkInRecord.finalizedBy,
          checkInIdempotency: checkInRecord,
          lifecycleStatus: 'checkin_finalized',
        },
      },
      { new: true }
    );

    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Atomic checkout finalization locking.
   * Asserts checkInFinalized is true and checkOutFinalized was false.
   */
  async atomicFinalizeCheckOut(
    eventId: string,
    finishTimeData: {
      actualNormalFinishTime: string;
      actualNormalFinishDate: Date;
      requirementFinishOverrides?: IRequirementFinishOverride[];
    },
    checkOutRecord: IFinalizationIdempotency,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const query = AttendanceSession.findOneAndUpdate(
      {
        eventId: new mongoose.Types.ObjectId(eventId),
        checkInFinalized: true,
        checkOutFinalized: false,
      },
      {
        $set: {
          actualNormalFinishTime: finishTimeData.actualNormalFinishTime,
          actualNormalFinishDate: finishTimeData.actualNormalFinishDate,
          requirementFinishOverrides: finishTimeData.requirementFinishOverrides || [],
          checkOutFinalized: true,
          checkOutFinalizedAt: checkOutRecord.finalizedAt || new Date(),
          checkOutFinalizedBy: checkOutRecord.finalizedBy,
          checkOutIdempotency: checkOutRecord,
          lifecycleStatus: 'checkout_finalized',
        },
      },
      { new: true }
    );

    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Updates lifecycle status (e.g. 'cancelled').
   */
  async setLifecycleStatus(
    eventId: string,
    status: AttendanceLifecycleStatus,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;
    const query = AttendanceSession.findOneAndUpdate(
      { eventId: new mongoose.Types.ObjectId(eventId) },
      { $set: { lifecycleStatus: status } },
      { new: true }
    );
    if (session) query.session(session);
    return query.exec();
  }
}

export const attendanceSessionRepository = new AttendanceSessionRepository();

