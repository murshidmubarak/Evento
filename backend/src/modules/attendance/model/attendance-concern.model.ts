import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type ConcernStatus = 'open' | 'closed';
export type ConcernResolutionOutcome = 'accepted' | 'rejected';
export type ConcernCategory =
  | 'late_dispute'
  | 'absent_dispute'
  | 'time_recording_error'
  | 'technical_issue'
  | 'other';

export interface IConcernMessage {
  senderId: Types.ObjectId;
  senderRole: 'worker' | 'event_manager' | 'admin';
  message: string;
  sentAt: Date;
}

export interface IAttendanceConcern extends Document {
  attendanceId: Types.ObjectId;
  eventId: Types.ObjectId;
  workerId: Types.ObjectId;
  managerId: Types.ObjectId;

  concernCategory: ConcernCategory;
  explanation: string;
  additionalDetails?: string;

  status: ConcernStatus;
  resolutionOutcome?: ConcernResolutionOutcome;
  resolutionExplanation?: string;

  resultingArrivalStatus?: 'on_time' | 'late' | 'absent';
  resultingActualArrivalTime?: string;

  closedBy?: Types.ObjectId;
  closedAt?: Date;

  messages: IConcernMessage[];

  createdAt: Date;
  updatedAt: Date;
}

const concernMessageSchema = new Schema<IConcernMessage>(
  {
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    senderRole: {
      type: String,
      enum: ['worker', 'event_manager', 'admin'],
      required: true,
    },
    message: { type: String, required: true, trim: true, minlength: 1 },
    sentAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const attendanceConcernSchema = new Schema<IAttendanceConcern>(
  {
    attendanceId: {
      type: Schema.Types.ObjectId,
      ref: 'Attendance',
      required: true,
      unique: true, // STRICT: Exactly ONE concern thread per attendance record
      index: true,
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    workerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    managerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    concernCategory: {
      type: String,
      enum: ['late_dispute', 'absent_dispute', 'time_recording_error', 'technical_issue', 'other'],
      required: true,
    },
    explanation: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
    },
    additionalDetails: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: ['open', 'closed'],
      default: 'open',
      index: true,
    },
    resolutionOutcome: {
      type: String,
      enum: ['accepted', 'rejected'],
    },
    resolutionExplanation: {
      type: String,
      trim: true,
    },
    resultingArrivalStatus: {
      type: String,
      enum: ['on_time', 'late', 'absent'],
    },
    resultingActualArrivalTime: {
      type: String,
      trim: true,
    },
    closedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    closedAt: {
      type: Date,
    },
    messages: {
      type: [concernMessageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Compound query indexes for efficient manager and worker filtering
attendanceConcernSchema.index({ eventId: 1, status: 1 });
attendanceConcernSchema.index({ workerId: 1, createdAt: -1 });
attendanceConcernSchema.index({ managerId: 1, status: 1 });

export const AttendanceConcern = mongoose.model<IAttendanceConcern>(
  'AttendanceConcern',
  attendanceConcernSchema
);

