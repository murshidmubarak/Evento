import mongoose, { type ClientSession } from 'mongoose';
import {
  AttendanceConcern,
  type IAttendanceConcern,
  type IConcernMessage,
  type ConcernStatus,
  type ConcernResolutionOutcome,
} from '../model/attendance-concern.model.js';

export interface ConcernFilterOptions {
  eventId?: string;
  workerId?: string;
  managerId?: string;
  status?: ConcernStatus;
}

export class AttendanceConcernRepository {
  /**
   * Create a single attendance concern thread.
   */
  async create(
    data: Partial<IAttendanceConcern>,
    session?: ClientSession
  ): Promise<IAttendanceConcern> {
    const doc = new AttendanceConcern(data);
    return doc.save({ session });
  }

  /**
   * Find a concern by ID with populated references.
   */
  async findById(id: string, session?: ClientSession): Promise<IAttendanceConcern | null> {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    const query = AttendanceConcern.findById(id)
      .populate('workerId', 'name email phone businessId workerType')
      .populate('managerId', 'name email phone')
      .populate('eventId', 'title eventType date startTime endTime status location')
      .populate('attendanceId')
      .populate('messages.senderId', 'name email role');
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Find a concern by attendance ID.
   */
  async findByAttendanceId(
    attendanceId: string,
    session?: ClientSession
  ): Promise<IAttendanceConcern | null> {
    if (!mongoose.Types.ObjectId.isValid(attendanceId)) return null;
    const query = AttendanceConcern.findOne({
      attendanceId: new mongoose.Types.ObjectId(attendanceId),
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Query concerns with filter options and standard population.
   */
  async findConcerns(
    filter: ConcernFilterOptions,
    session?: ClientSession
  ): Promise<IAttendanceConcern[]> {
    const mongoQuery: Record<string, any> = {};

    if (filter.eventId && mongoose.Types.ObjectId.isValid(filter.eventId)) {
      mongoQuery.eventId = new mongoose.Types.ObjectId(filter.eventId);
    }
    if (filter.workerId && mongoose.Types.ObjectId.isValid(filter.workerId)) {
      mongoQuery.workerId = new mongoose.Types.ObjectId(filter.workerId);
    }
    if (filter.managerId && mongoose.Types.ObjectId.isValid(filter.managerId)) {
      mongoQuery.managerId = new mongoose.Types.ObjectId(filter.managerId);
    }
    if (filter.status) {
      mongoQuery.status = filter.status;
    }

    const query = AttendanceConcern.find(mongoQuery)
      .populate('workerId', 'name email phone businessId workerType')
      .populate('managerId', 'name email phone')
      .populate('eventId', 'title eventType date startTime endTime status location')
      .populate('attendanceId')
      .sort({ createdAt: -1 });

    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Count open concerns for a specific event.
   */
  async countOpenByEventId(eventId: string, session?: ClientSession): Promise<number> {
    if (!mongoose.Types.ObjectId.isValid(eventId)) return 0;
    const query = AttendanceConcern.countDocuments({
      eventId: new mongoose.Types.ObjectId(eventId),
      status: 'open',
    });
    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Append a reply message to an existing concern thread.
   */
  async addMessage(
    concernId: string,
    message: IConcernMessage,
    session?: ClientSession
  ): Promise<IAttendanceConcern | null> {
    if (!mongoose.Types.ObjectId.isValid(concernId)) return null;
    const query = AttendanceConcern.findByIdAndUpdate(
      concernId,
      { $push: { messages: message } },
      { new: true }
    )
      .populate('workerId', 'name email phone businessId workerType')
      .populate('managerId', 'name email phone')
      .populate('eventId', 'title eventType date startTime endTime status location')
      .populate('attendanceId')
      .populate('messages.senderId', 'name email role');

    if (session) query.session(session);
    return query.exec();
  }

  /**
   * Atomically resolve and close a concern.
   */
  async closeConcern(
    concernId: string,
    data: {
      resolutionOutcome: ConcernResolutionOutcome;
      resolutionExplanation: string;
      resultingArrivalStatus?: 'on_time' | 'late' | 'absent';
      resultingActualArrivalTime?: string;
      closedBy: string;
    },
    session?: ClientSession
  ): Promise<IAttendanceConcern | null> {
    if (!mongoose.Types.ObjectId.isValid(concernId)) return null;
    const update: any = {
      $set: {
        status: 'closed',
        resolutionOutcome: data.resolutionOutcome,
        resolutionExplanation: data.resolutionExplanation,
        resultingArrivalStatus: data.resultingArrivalStatus,
        resultingActualArrivalTime: data.resultingActualArrivalTime,
        closedBy: new mongoose.Types.ObjectId(data.closedBy),
        closedAt: new Date(),
      },
    };

    const query = AttendanceConcern.findByIdAndUpdate(concernId, update, { new: true })
      .populate('workerId', 'name email phone businessId workerType')
      .populate('managerId', 'name email phone')
      .populate('eventId', 'title eventType date startTime endTime status location')
      .populate('attendanceId')
      .populate('messages.senderId', 'name email role');

    if (session) query.session(session);
    return query.exec();
  }
}

export const attendanceConcernRepository = new AttendanceConcernRepository();

