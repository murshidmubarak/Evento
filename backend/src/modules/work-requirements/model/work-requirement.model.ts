import mongoose, { Schema, Document, Types } from 'mongoose';

export type WorkRequirementStatus = 'draft' | 'open' | 'selection_in_progress' | 'filled' | 'closed' | 'cancelled';

export interface IWorkRequirement extends Document {
  eventId: Types.ObjectId;
  workerType: string;
  requiredCount: number;
  reportingTime: string;
  description?: string;
  status: WorkRequirementStatus;
  createdAt: Date;
  updatedAt: Date;
}

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
    status: {
      type: String,
      enum: ['draft', 'open', 'selection_in_progress', 'filled', 'closed', 'cancelled'],
      default: 'draft',
    },
  },
  { timestamps: true }
);

export const WorkRequirement = mongoose.model<IWorkRequirement>('WorkRequirement', workRequirementSchema);
