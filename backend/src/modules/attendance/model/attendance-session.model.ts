import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type AttendanceLifecycleStatus =
  | 'checkin_in_progress'
  | 'checkin_finalized'
  | 'checkout_finalized'
  | 'cancelled';

export interface IFinalizationIdempotency {
  idempotencyKey?: string;
  payloadHash?: string;
  finalizedAt: Date;
  finalizedBy: Types.ObjectId;
  committedSummary?: Record<string, unknown>;
}

export interface IRequirementFinishOverride {
  requirementId: Types.ObjectId;
  normalFinishTime: string; // e.g. "21:00" or "09:00 PM"
  normalFinishDate: Date;   // Full UTC timestamp on the event calendar day (or next day)
}

export interface IAttendanceSession extends Document {
  eventId: Types.ObjectId;

  // Check-in stage
  checkInFinalized: boolean;
  checkInFinalizedAt?: Date;
  checkInFinalizedBy?: Types.ObjectId;
  checkInIdempotency?: IFinalizationIdempotency;

  // Normal work finishing-time configuration
  actualNormalFinishTime?: string; // Event default (e.g. "19:00")
  actualNormalFinishDate?: Date;   // Full UTC timestamp
  requirementFinishOverrides: IRequirementFinishOverride[];

  // Checkout stage
  checkOutFinalized: boolean;
  checkOutFinalizedAt?: Date;
  checkOutFinalizedBy?: Types.ObjectId;
  checkOutIdempotency?: IFinalizationIdempotency;

  // Overall lifecycle
  lifecycleStatus: AttendanceLifecycleStatus;

  createdAt: Date;
  updatedAt: Date;
}

const finalizationIdempotencySchema = new Schema<IFinalizationIdempotency>(
  {
    idempotencyKey: { type: String, trim: true },
    payloadHash: { type: String, trim: true },
    finalizedAt: { type: Date, default: Date.now },
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    committedSummary: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const requirementFinishOverrideSchema = new Schema<IRequirementFinishOverride>(
  {
    requirementId: { type: Schema.Types.ObjectId, ref: 'WorkRequirement', required: true },
    normalFinishTime: { type: String, required: true, trim: true },
    normalFinishDate: { type: Date, required: true },
  },
  { _id: false }
);

const attendanceSessionSchema = new Schema<IAttendanceSession>(
  {
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      unique: true,
      index: true,
    },
    checkInFinalized: { type: Boolean, default: false },
    checkInFinalizedAt: { type: Date },
    checkInFinalizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    checkInIdempotency: { type: finalizationIdempotencySchema },

    actualNormalFinishTime: { type: String, trim: true },
    actualNormalFinishDate: { type: Date },
    requirementFinishOverrides: {
      type: [requirementFinishOverrideSchema],
      default: [],
    },

    checkOutFinalized: { type: Boolean, default: false },
    checkOutFinalizedAt: { type: Date },
    checkOutFinalizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    checkOutIdempotency: { type: finalizationIdempotencySchema },

    lifecycleStatus: {
      type: String,
      enum: ['checkin_in_progress', 'checkin_finalized', 'checkout_finalized', 'cancelled'],
      default: 'checkin_in_progress',
      index: true,
    },
  },
  { timestamps: true }
);

export const AttendanceSession = mongoose.model<IAttendanceSession>(
  'AttendanceSession',
  attendanceSessionSchema
);

