import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type ArrivalStatus = 'on_time' | 'late' | 'absent' | 'unrecorded';
export type DepartureStatus = 'normal' | 'early_departure' | 'overtime' | 'not_recorded';
export type OperationalAttendanceStatus = 'not_started' | 'checked_in' | 'checked_out' | 'absent';
export type VerificationStatus = 'pending_review' | 'approved' | 'rejected';
export type TimestampSource = 'manager_actual' | 'system_default' | 'not_recorded';

export interface IAttendanceCorrection {
  modifiedBy: Types.ObjectId;
  modifiedAt: Date;
  field: string;
  previousValue?: string;
  previousSource?: TimestampSource;
  previousStatus?: string;
  previousArrivalStatus?: string;
  previousDepartureStatus?: string;
  newValue?: string;
  newSource?: TimestampSource;
  newStatus?: string;
  newArrivalStatus?: string;
  newDepartureStatus?: string;
  reason: string;
}

export interface IAttendance extends Document {
  eventId: Types.ObjectId;
  requirementId: Types.ObjectId;
  workerId: Types.ObjectId;
  workerType: string;

  // Reporting time snapshot (derived from WorkRequirement.reportingTime)
  reportingTimeSnapshot: string;

  // Normal work finishing-time snapshot (resolved from requirement override or event default)
  applicableNormalFinishTimeSnapshot?: string;
  applicableNormalFinishDate?: Date;

  // Check-in information
  checkIn?: Date;
  checkInSource: TimestampSource;
  arrivalStatus: ArrivalStatus;
  checkInRecordedBy?: Types.ObjectId;
  checkInRecordedAt?: Date;
  delayMinutes: number;

  // Checkout information
  checkOut?: Date;
  checkOutSource: TimestampSource;
  departureStatus: DepartureStatus;
  checkOutRecordedBy?: Types.ObjectId;
  checkOutRecordedAt?: Date;
  earlyDepartureMinutes: number;
  overtimeMinutes: number;

  // Durations (in integer minutes)
  durationMinutes: number;

  // States
  status: OperationalAttendanceStatus;
  verificationStatus: VerificationStatus;

  // Verification details
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
  rejectionReason?: string;

  // Immutable audit trail
  corrections: IAttendanceCorrection[];

  createdAt: Date;
  updatedAt: Date;
}

const attendanceCorrectionSchema = new Schema<IAttendanceCorrection>(
  {
    modifiedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    modifiedAt: { type: Date, default: Date.now },
    field: { type: String, required: true },
    previousValue: { type: String },
    previousSource: { type: String, enum: ['manager_actual', 'system_default', 'not_recorded'] },
    previousStatus: { type: String },
    previousArrivalStatus: { type: String },
    previousDepartureStatus: { type: String },
    newValue: { type: String },
    newSource: { type: String, enum: ['manager_actual', 'system_default', 'not_recorded'] },
    newStatus: { type: String },
    newArrivalStatus: { type: String },
    newDepartureStatus: { type: String },
    reason: { type: String, required: true, minlength: 5, trim: true },
  },
  { _id: false }
);

const attendanceSchema = new Schema<IAttendance>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    requirementId: { type: Schema.Types.ObjectId, ref: 'WorkRequirement', required: true, index: true },
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    workerType: { type: String, required: true, trim: true },

    reportingTimeSnapshot: { type: String, required: true, trim: true },
    applicableNormalFinishTimeSnapshot: { type: String, trim: true },
    applicableNormalFinishDate: { type: Date },

    checkIn: { type: Date },
    checkInSource: {
      type: String,
      enum: ['manager_actual', 'system_default', 'not_recorded'],
      default: 'not_recorded',
    },
    arrivalStatus: {
      type: String,
      enum: ['on_time', 'late', 'absent', 'unrecorded'],
      default: 'unrecorded',
    },
    checkInRecordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    checkInRecordedAt: { type: Date },
    delayMinutes: { type: Number, default: 0 },

    checkOut: { type: Date },
    checkOutSource: {
      type: String,
      enum: ['manager_actual', 'system_default', 'not_recorded'],
      default: 'not_recorded',
    },
    departureStatus: {
      type: String,
      enum: ['normal', 'early_departure', 'overtime', 'not_recorded'],
      default: 'not_recorded',
    },
    checkOutRecordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    checkOutRecordedAt: { type: Date },
    earlyDepartureMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 },

    durationMinutes: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ['not_started', 'checked_in', 'checked_out', 'absent'],
      default: 'not_started',
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

    corrections: { type: [attendanceCorrectionSchema], default: [] },
  },
  { timestamps: true }
);

// STRICT COMPOUND UNIQUE CONSTRAINT:
// Assures each worker can hold at most ONE attendance document per event
attendanceSchema.index({ eventId: 1, workerId: 1 }, { unique: true });

// Supporting query indexes
attendanceSchema.index({ eventId: 1, status: 1 });
attendanceSchema.index({ eventId: 1, requirementId: 1 });
attendanceSchema.index({ workerId: 1, createdAt: -1 });

export const Attendance = mongoose.model<IAttendance>('Attendance', attendanceSchema);

