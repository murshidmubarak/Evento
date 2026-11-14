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

export interface ICheckInRevision {
  revision: number;
  finalizedAt: Date;
  finalizedBy: Types.ObjectId;
  committedSummary?: Record<string, unknown>;
  changeReason?: string;
}

export interface IRequirementFinishOverride {
  requirementId: Types.ObjectId;
  normalFinishTime: string; // e.g. "21:00" or "09:00 PM"
  normalFinishDate: Date;   // Full UTC timestamp on the event calendar day (or next day)
}

export interface ICategoryFinishTime {
  workerType: string;
  normalFinishTime: string; // e.g. "21:00" or "09:00 PM"
  normalFinishDate: Date;   // Full UTC timestamp on the event calendar day (or next day)
}

export interface ICategoryActualDepartureRevision {
  actualDepartureTime: string; // e.g. "16:00"
  actualDepartureDate: Date;   // Full UTC timestamp
  modifiedBy: Types.ObjectId;
  modifiedAt: Date;
  reason?: string;
}

export interface ICategoryActualDeparture {
  workerType: string;
  actualDepartureTime: string; // e.g. "16:00"
  actualDepartureDate: Date;   // Full UTC timestamp
  recordedBy?: Types.ObjectId;
  recordedAt?: Date;
  revisionHistory?: ICategoryActualDepartureRevision[];
}

export interface ICategoryCheckInConfirmation {
  workerType: string;
  checkInFinalized: boolean;
  checkInFinalizedAt?: Date;
  checkInFinalizedBy?: Types.ObjectId;
  checkInChangesPending: boolean;
  checkInRevision: number;
  checkInRevisions: ICheckInRevision[];
  checkInIdempotency?: IFinalizationIdempotency;
}

export interface IAttendanceSession extends Document {
  eventId: Types.ObjectId;

  // Check-in stage (global / derived)
  checkInFinalized: boolean;
  checkInFinalizedAt?: Date;
  checkInFinalizedBy?: Types.ObjectId;
  checkInChangesPending: boolean;
  checkInRevision: number;
  checkInRevisions: ICheckInRevision[];
  checkInIdempotency?: IFinalizationIdempotency;

  // Category-wise check-in confirmations
  categoryCheckInConfirmations: ICategoryCheckInConfirmation[];

  // Actual category departure configuration (Exception-based checkout)
  categoryActualDepartures: ICategoryActualDeparture[];

  // Legacy/Compatibility Normal work finishing-time configuration
  actualNormalFinishTime?: string; // Event default (e.g. "19:00")
  actualNormalFinishDate?: Date;   // Full UTC timestamp
  categoryFinishTimes: ICategoryFinishTime[]; // Category-wise finishing times
  requirementFinishOverrides: IRequirementFinishOverride[];

  // Checkout stage
  checkOutFinalized: boolean;
  checkOutFinalizedAt?: Date;
  checkOutFinalizedBy?: Types.ObjectId;
  checkOutIdempotency?: IFinalizationIdempotency;

  // Overall lifecycle
  lifecycleStatus: AttendanceLifecycleStatus;

  // Final Event Manager Verification & Approval stage
  verificationStatus?: 'pending_review' | 'approved' | 'rejected';
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
  rejectionReason?: string;

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

const checkInRevisionSchema = new Schema<ICheckInRevision>(
  {
    revision: { type: Number, required: true },
    finalizedAt: { type: Date, default: Date.now },
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    committedSummary: { type: Schema.Types.Mixed },
    changeReason: { type: String, trim: true },
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

const categoryFinishTimeSchema = new Schema<ICategoryFinishTime>(
  {
    workerType: { type: String, required: true, trim: true },
    normalFinishTime: { type: String, required: true, trim: true },
    normalFinishDate: { type: Date, required: true },
  },
  { _id: false }
);

const categoryActualDepartureRevisionSchema = new Schema<ICategoryActualDepartureRevision>(
  {
    actualDepartureTime: { type: String, required: true, trim: true },
    actualDepartureDate: { type: Date, required: true },
    modifiedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    modifiedAt: { type: Date, default: Date.now },
    reason: { type: String, trim: true },
  },
  { _id: false }
);

const categoryActualDepartureSchema = new Schema<ICategoryActualDeparture>(
  {
    workerType: { type: String, required: true, trim: true },
    actualDepartureTime: { type: String, required: true, trim: true },
    actualDepartureDate: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    recordedAt: { type: Date },
    revisionHistory: { type: [categoryActualDepartureRevisionSchema], default: [] },
  },
  { _id: false }
);

const categoryCheckInConfirmationSchema = new Schema<ICategoryCheckInConfirmation>(
  {
    workerType: { type: String, required: true, trim: true },
    checkInFinalized: { type: Boolean, default: false },
    checkInFinalizedAt: { type: Date },
    checkInFinalizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    checkInChangesPending: { type: Boolean, default: false },
    checkInRevision: { type: Number, default: 0 },
    checkInRevisions: { type: [checkInRevisionSchema], default: [] },
    checkInIdempotency: { type: finalizationIdempotencySchema },
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
    checkInChangesPending: { type: Boolean, default: false },
    checkInRevision: { type: Number, default: 0 },
    checkInRevisions: { type: [checkInRevisionSchema], default: [] },
    checkInIdempotency: { type: finalizationIdempotencySchema },

    categoryCheckInConfirmations: {
      type: [categoryCheckInConfirmationSchema],
      default: [],
    },

    categoryActualDepartures: {
      type: [categoryActualDepartureSchema],
      default: [],
    },

    actualNormalFinishTime: { type: String, trim: true },
    actualNormalFinishDate: { type: Date },
    categoryFinishTimes: {
      type: [categoryFinishTimeSchema],
      default: [],
    },
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

    verificationStatus: {
      type: String,
      enum: ['pending_review', 'approved', 'rejected'],
      default: 'pending_review',
      index: true,
    },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    rejectionReason: { type: String, trim: true },
  },
  { timestamps: true }
);

export const AttendanceSession = mongoose.model<IAttendanceSession>(
  'AttendanceSession',
  attendanceSessionSchema
);

