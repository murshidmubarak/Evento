import mongoose, { Schema, Document, Types } from 'mongoose';

export type WorkRequirementStatus = 'draft' | 'open' | 'selection_in_progress' | 'filled' | 'closed' | 'cancelled';

export interface IAssignedWorker {
  workerId: Types.ObjectId;
  assignedAt: Date;
  distanceKm?: number;
  distanceScore?: number;
  selectionRound?: number;
}

export interface IExtensionHistory {
  previousDeadline: Date;
  newDeadline: Date;
  extendedBy: Types.ObjectId;
  extendedAt: Date;
  remainingCount: number;
}

export interface IWorkRequirement extends Document {
  eventId: Types.ObjectId;
  workerType: string;
  requiredCount: number;
  reportingTime: string;
  description?: string;
  maxDistanceKm?: number;
  interestDeadlineAt?: Date;
  interestPublishedAt?: Date;
  selectionRound: number;
  assignedWorkers: IAssignedWorker[];
  extensionHistory: IExtensionHistory[];
  status: WorkRequirementStatus;
  createdAt: Date;
  updatedAt: Date;
}

const assignedWorkerSchema = new Schema<IAssignedWorker>(
  {
    workerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    assignedAt: { type: Date, default: Date.now },
    distanceKm: { type: Number },
    distanceScore: { type: Number },
    selectionRound: { type: Number, default: 1 },
  },
  { _id: false }
);

const extensionHistorySchema = new Schema<IExtensionHistory>(
  {
    previousDeadline: { type: Date, required: true },
    newDeadline: { type: Date, required: true },
    extendedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    extendedAt: { type: Date, default: Date.now },
    remainingCount: { type: Number, required: true },
  },
  { _id: false }
);

const workRequirementSchema = new Schema<IWorkRequirement>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true, index: true },
    workerType: {
      type: String,
      enum: {
        values: [
          'Catering Boy',
          'Catering Supervisor',
          'Chef',
          'Cameraman / Photographer',
          'Videographer',
          'Decoration Worker',
          'Juice Worker',
          'Host'
        ],
        message: 'Invalid worker type',
      },
      required: true,
    },
    requiredCount: {
      type: Number,
      required: true,
      min: [1, 'Required count must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value'
      }
    },
    reportingTime: {
      type: String,
      required: [true, 'Reporting time is required'],
      trim: true,
      validate: {
        validator: function(v: string) {
          if (!v || v.trim().length === 0) return false;
          const timeRegex = /^([0-1]?\d|2[0-3]):[0-5]\d(\s?[APap][Mm])?$/;
          const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?Z?$/;
          return timeRegex.test(v.trim()) || isoRegex.test(v.trim());
        },
        message: "Reporting time must be a valid time format (e.g. '07:30' or '07:30 AM')"
      }
    },
    description: { type: String, trim: true },
    maxDistanceKm: {
      type: Number,
      min: [0.001, 'Maximum distance must be a positive number'],
    },
    interestDeadlineAt: {
      type: Date,
      index: true,
    },
    interestPublishedAt: {
      type: Date,
      index: true,
    },
    selectionRound: {
      type: Number,
      default: 1,
    },
    assignedWorkers: {
      type: [assignedWorkerSchema],
      default: [],
    },
    extensionHistory: {
      type: [extensionHistorySchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'open', 'selection_in_progress', 'filled', 'closed', 'cancelled'],
      default: 'draft',
      index: true,
    },
  },
  { timestamps: true }
);

export const WorkRequirement = mongoose.model<IWorkRequirement>('WorkRequirement', workRequirementSchema);
