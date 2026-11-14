import mongoose, { type ClientSession, type UpdateQuery } from 'mongoose';
import {
  AttendanceSession,
  type IAttendanceSession,
  type AttendanceLifecycleStatus,
  type IFinalizationIdempotency,
  type ICheckInRevision,
  type IRequirementFinishOverride,
  type ICategoryFinishTime,
  type ICategoryCheckInConfirmation,
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
            checkInChangesPending: false,
            checkInRevision: 0,
            checkInRevisions: [],
            checkOutFinalized: false,
            lifecycleStatus: 'checkin_in_progress',
            categoryFinishTimes: [],
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

    const finalizedAt = checkInRecord.finalizedAt || new Date();

    const query = AttendanceSession.findOneAndUpdate(
      {
        eventId: new mongoose.Types.ObjectId(eventId),
        checkInFinalized: false,
      },
      {
        $set: {
          checkInFinalized: true,
          checkInChangesPending: false,
          checkInRevision: 1,
          checkInFinalizedAt: finalizedAt,
          checkInFinalizedBy: checkInRecord.finalizedBy,
          checkInIdempotency: checkInRecord,
          lifecycleStatus: 'checkin_finalized',
        },
        $push: {
          checkInRevisions: {
            revision: 1,
            finalizedAt,
            finalizedBy: checkInRecord.finalizedBy,
            committedSummary: checkInRecord.committedSummary,
            changeReason: 'Initial check-in finalization',
          },
        },
      },
      { new: true }
    );

    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Atomic check-in re-finalization locking.
   * Asserts checkInFinalized was true and checkInChangesPending was true.
   * Atomically clears checkInChangesPending, increments checkInRevision, and records audit history.
   */
  async atomicReFinalizeCheckIn(
    eventId: string,
    reFinalizeRecord: IFinalizationIdempotency,
    expectedRevision?: number,
    changeReason?: string,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const filter: Record<string, unknown> = {
      eventId: new mongoose.Types.ObjectId(eventId),
      checkInFinalized: true,
      checkInChangesPending: true,
    };
    if (typeof expectedRevision === 'number' && expectedRevision > 0) {
      filter.checkInRevision = expectedRevision;
    }

    const finalizedAt = reFinalizeRecord.finalizedAt || new Date();
    const nextRevision = (expectedRevision || 1) + 1;

    const query = AttendanceSession.findOneAndUpdate(
      filter,
      {
        $set: {
          checkInChangesPending: false,
          checkInFinalizedAt: finalizedAt,
          checkInFinalizedBy: reFinalizeRecord.finalizedBy,
          checkInIdempotency: reFinalizeRecord,
          lifecycleStatus: 'checkin_finalized',
        },
        $inc: { checkInRevision: 1 },
        $push: {
          checkInRevisions: {
            revision: nextRevision,
            finalizedAt,
            finalizedBy: reFinalizeRecord.finalizedBy,
            committedSummary: reFinalizeRecord.committedSummary,
            changeReason: changeReason || 'Re-finalized after attendance changes',
          },
        },
      },
      { new: true }
    );

    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Marks check-in changes pending for an already-finalized attendance session.
   * Triggered whenever an arrival status or check-in time is corrected after initial finalization.
   */
  async markCheckInChangesPending(
    eventId: string,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const query = AttendanceSession.findOneAndUpdate(
      {
        eventId: new mongoose.Types.ObjectId(eventId),
        checkInFinalized: true,
      },
      {
        $set: {
          checkInChangesPending: true,
        },
      },
      { new: true }
    );

    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Saves or updates check-in confirmation for a specific worker category.
   * Tracks per-category revision history, idempotency, and clears category checkInChangesPending.
   */
  async atomicConfirmCategoryCheckIn(
    eventId: string,
    workerType: string,
    confirmationData: {
      finalizedBy: mongoose.Types.ObjectId;
      finalizedAt?: Date;
      idempotencyRecord: IFinalizationIdempotency;
      committedSummary?: Record<string, unknown>;
      changeReason?: string;
      isReFinalize?: boolean;
    },
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const sessionDoc = await this.getOrCreateSession(eventId, session);
    const confirmations = sessionDoc.categoryCheckInConfirmations || [];
    const normalizedType = workerType.trim().toLowerCase();

    const existingIdx = confirmations.findIndex(
      (c) => c.workerType.trim().toLowerCase() === normalizedType
    );

    const finalizedAt =
      confirmationData.finalizedAt ||
      confirmationData.idempotencyRecord.finalizedAt ||
      new Date();
    const finalizedBy = confirmationData.finalizedBy;

    if (existingIdx >= 0) {
      const existing = confirmations[existingIdx];
      const nextRevision = (existing.checkInRevision || 0) + 1;
      const revisions = existing.checkInRevisions || [];

      revisions.push({
        revision: nextRevision,
        finalizedAt,
        finalizedBy,
        committedSummary:
          confirmationData.committedSummary ||
          confirmationData.idempotencyRecord.committedSummary,
        changeReason:
          confirmationData.changeReason ||
          (existing.checkInFinalized
            ? 'Re-finalized check-in after attendance changes'
            : 'Initial check-in confirmation'),
      });

      confirmations[existingIdx] = {
        workerType: existing.workerType,
        checkInFinalized: true,
        checkInFinalizedAt: finalizedAt,
        checkInFinalizedBy: finalizedBy,
        checkInChangesPending: false,
        checkInRevision: nextRevision,
        checkInRevisions: revisions,
        checkInIdempotency: confirmationData.idempotencyRecord,
      };
    } else {
      confirmations.push({
        workerType,
        checkInFinalized: true,
        checkInFinalizedAt: finalizedAt,
        checkInFinalizedBy: finalizedBy,
        checkInChangesPending: false,
        checkInRevision: 1,
        checkInRevisions: [
          {
            revision: 1,
            finalizedAt,
            finalizedBy,
            committedSummary:
              confirmationData.committedSummary ||
              confirmationData.idempotencyRecord.committedSummary,
            changeReason:
              confirmationData.changeReason || 'Initial check-in confirmation',
          },
        ],
        checkInIdempotency: confirmationData.idempotencyRecord,
      });
    }

    sessionDoc.categoryCheckInConfirmations = confirmations;

    // Check if any category has changes pending across all confirmations
    const anyChangesPending = confirmations.some((c) => c.checkInChangesPending);
    const anyConfirmed = confirmations.some((c) => c.checkInFinalized);

    // Sync global session fields
    if (anyConfirmed && !sessionDoc.checkInFinalized) {
      sessionDoc.checkInFinalized = true;
      sessionDoc.checkInFinalizedAt = finalizedAt;
      sessionDoc.checkInFinalizedBy = finalizedBy;
      sessionDoc.lifecycleStatus = 'checkin_finalized';
    }
    sessionDoc.checkInChangesPending = anyChangesPending;

    return sessionDoc.save({ session });
  }

  /**
   * Marks check-in changes pending strictly for a specific category in an attendance session.
   * Triggered whenever an arrival status or check-in time is corrected after initial confirmation.
   */
  async markCategoryCheckInChangesPending(
    eventId: string,
    workerType: string,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const sessionDoc = await this.findByEventId(eventId, session);
    if (!sessionDoc) return null;

    const confirmations = sessionDoc.categoryCheckInConfirmations || [];
    const normalizedType = workerType.trim().toLowerCase();

    const existingIdx = confirmations.findIndex(
      (c) => c.workerType.trim().toLowerCase() === normalizedType
    );

    if (existingIdx >= 0) {
      if (confirmations[existingIdx].checkInFinalized) {
        confirmations[existingIdx].checkInChangesPending = true;
      }
    }

    sessionDoc.categoryCheckInConfirmations = confirmations;
    sessionDoc.checkInChangesPending = confirmations.some((c) => c.checkInChangesPending);

    return sessionDoc.save({ session });
  }

  /**
   * Atomic checkout finalization locking.
   * Asserts checkInFinalized is true and checkOutFinalized was false.
   */
  async atomicFinalizeCheckOut(
    eventId: string,
    finishTimeData: {
      actualNormalFinishTime?: string;
      actualNormalFinishDate?: Date;
      categoryFinishTimes?: ICategoryFinishTime[];
      requirementFinishOverrides?: IRequirementFinishOverride[];
    },
    checkOutRecord: IFinalizationIdempotency,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const query = AttendanceSession.findOneAndUpdate(
      {
        eventId: new mongoose.Types.ObjectId(eventId),
        checkOutFinalized: false,
      },
      {
        $set: {
          actualNormalFinishTime: finishTimeData.actualNormalFinishTime,
          actualNormalFinishDate: finishTimeData.actualNormalFinishDate,
          categoryFinishTimes: finishTimeData.categoryFinishTimes || [],
          requirementFinishOverrides: finishTimeData.requirementFinishOverrides || [],
          checkInFinalized: true,
          checkInFinalizedAt: checkOutRecord.finalizedAt || new Date(),
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

  /**
   * Updates verification status for an attendance session.
   */
  async updateVerificationStatus(
    eventId: string,
    verificationStatus: 'pending_review' | 'approved' | 'rejected',
    verifiedBy?: mongoose.Types.ObjectId | null,
    rejectionReason?: string | null,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const query = AttendanceSession.findOneAndUpdate(
      { eventId: new mongoose.Types.ObjectId(eventId) },
      {
        $set: {
          verificationStatus,
          verifiedBy: verifiedBy || null,
          verifiedAt: verifiedBy ? new Date() : null,
          rejectionReason: rejectionReason || null,
        },
      },
      { new: true }
    );
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Saves or updates a category actual departure time for an event, tracking revision history.
   */
  async saveCategoryActualDeparture(
    eventId: string,
    departureData: {
      workerType: string;
      actualDepartureTime: string;
      actualDepartureDate: Date;
      recordedBy: mongoose.Types.ObjectId;
      reason?: string;
    },
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const sessionDoc = await this.getOrCreateSession(eventId, session);
    const departures = sessionDoc.categoryActualDepartures || [];
    const normalizedType = departureData.workerType.trim().toLowerCase();

    const existingIdx = departures.findIndex(
      (d) => d.workerType.trim().toLowerCase() === normalizedType
    );

    const now = new Date();
    if (existingIdx >= 0) {
      const existing = departures[existingIdx];
      const revisionHistory = existing.revisionHistory || [];
      revisionHistory.push({
        actualDepartureTime: existing.actualDepartureTime,
        actualDepartureDate: existing.actualDepartureDate,
        modifiedBy: departureData.recordedBy,
        modifiedAt: now,
        reason: departureData.reason,
      });

      departures[existingIdx] = {
        workerType: departureData.workerType,
        actualDepartureTime: departureData.actualDepartureTime,
        actualDepartureDate: departureData.actualDepartureDate,
        recordedBy: departureData.recordedBy,
        recordedAt: now,
        revisionHistory,
      };
    } else {
      departures.push({
        workerType: departureData.workerType,
        actualDepartureTime: departureData.actualDepartureTime,
        actualDepartureDate: departureData.actualDepartureDate,
        recordedBy: departureData.recordedBy,
        recordedAt: now,
        revisionHistory: [],
      });
    }

    // Keep categoryFinishTimes in sync for backward compatibility
    const catFinish = sessionDoc.categoryFinishTimes || [];
    const finishIdx = catFinish.findIndex(
      (c) => c.workerType.trim().toLowerCase() === normalizedType
    );
    if (finishIdx >= 0) {
      catFinish[finishIdx] = {
        workerType: departureData.workerType,
        normalFinishTime: departureData.actualDepartureTime,
        normalFinishDate: departureData.actualDepartureDate,
      };
    } else {
      catFinish.push({
        workerType: departureData.workerType,
        normalFinishTime: departureData.actualDepartureTime,
        normalFinishDate: departureData.actualDepartureDate,
      });
    }

    sessionDoc.categoryActualDepartures = departures;
    sessionDoc.categoryFinishTimes = catFinish;
    return sessionDoc.save({ session });
  }

  /**
   * Resets verification status for an attendance session to 'pending_review'.
   */
  async resetVerificationStatus(
    eventId: string,
    session?: ClientSession
  ): Promise<IAttendanceSession | null> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return null;

    const query = AttendanceSession.findOneAndUpdate(
      { eventId: new mongoose.Types.ObjectId(eventId) },
      {
        $set: {
          verificationStatus: 'pending_review',
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
        },
      },
      { new: true }
    );
    if (session) query.session(session);
    return query.exec();
  }
}

export const attendanceSessionRepository = new AttendanceSessionRepository();

