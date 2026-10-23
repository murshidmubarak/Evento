import mongoose, { Schema, Document, Types } from 'mongoose';

export type WorkerResponseStatus = 'interested' | 'not_interested' | 'selected' | 'not_selected';

export interface IWorkResponse extends Document {
  requirementId: Types.ObjectId;
  workerId: Types.ObjectId;
  eventId: Types.ObjectId;
  responseStatus: WorkerResponseStatus;
  respondedAt: Date;
  selectedAt?: Date;
  distanceKm?: number;
  distanceScore?: number;
  selectionRound?: number;
  locationSnapshot?: {
    address?: string;
    lat?: number;
    lng?: number;
    confirmedAt?: Date;
    versionId?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const workResponseSchema = new Schema<IWorkResponse>(
  {
    requirementId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkRequirement',
      required: true,
      index: true,
    },
    workerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: 'Event',
      required: true,
      index: true,
    },
    responseStatus: {
      type: String,
      enum: ['interested', 'not_interested', 'selected', 'not_selected'],
      default: 'interested',
      required: true,
      index: true,
    },
    respondedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    selectedAt: {
      type: Date,
    },
    distanceKm: {
      type: Number,
    },
    distanceScore: {
      type: Number,
    },
    selectionRound: {
      type: Number,
      default: 1,
    },
    locationSnapshot: {
      address: { type: String, trim: true },
      lat: { type: Number },
      lng: { type: Number },
      confirmedAt: { type: Date },
      versionId: { type: String, trim: true },
    },
  },
  { timestamps: true }
);

// Compound unique index ensuring that a Worker can only express interest ONCE per requirement.
// Duplicate submissions are strictly prevented at the database level.
workResponseSchema.index({ requirementId: 1, workerId: 1 }, { unique: true });
workResponseSchema.index({ workerId: 1, eventId: 1 });
workResponseSchema.index({ workerId: 1, responseStatus: 1 });

export const WorkResponse = mongoose.model<IWorkResponse>('WorkResponse', workResponseSchema);
