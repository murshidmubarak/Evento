import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWorkerLocationHistory extends Document {
  workerId: Types.ObjectId;
  address?: string;
  lat: number;
  lng: number;
  effectiveFrom: Date;
  versionId: string;
  createdAt: Date;
}

const workerLocationHistorySchema = new Schema<IWorkerLocationHistory>(
  {
    workerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    address: {
      type: String,
      trim: true,
    },
    lat: {
      type: Number,
      required: true,
    },
    lng: {
      type: Number,
      required: true,
    },
    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    versionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable: no updatedAt
  }
);

// Compound index for querying the latest location version valid as of a cutoff timestamp
workerLocationHistorySchema.index({ workerId: 1, effectiveFrom: -1 });

export const WorkerLocationHistory = mongoose.model<IWorkerLocationHistory>(
  'WorkerLocationHistory',
  workerLocationHistorySchema
);
