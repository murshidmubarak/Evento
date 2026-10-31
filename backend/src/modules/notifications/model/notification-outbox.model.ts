import mongoose, { Schema, Document, Model } from 'mongoose';

export type OutboxEventType =
  | 'requirement_cancelled'
  | 'requirement_updated'
  | 'deadline_extended';

export type OutboxEventStatus =
  | 'pending'
  | 'dispatching'
  | 'queued'
  | 'processed'
  | 'dead_letter';

export interface INotificationOutbox extends Document {
  _id: mongoose.Types.ObjectId;
  eventId: string;
  eventType: OutboxEventType;
  aggregateType: string;
  aggregateId: string;
  schemaVersion: number;
  occurredAt: Date;
  payload: Record<string, any>;
  status: OutboxEventStatus;
  dispatchGeneration: number;
  leaseToken?: string | null;
  leaseExpiresAt?: Date | null;
  attempts: number;
  nextAttemptAt: Date;
  enqueuedAt?: Date | null;
  processedAt?: Date | null;
  lastError?: string | null;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const notificationOutboxSchema = new Schema<INotificationOutbox>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: ['requirement_cancelled', 'requirement_updated', 'deadline_extended'],
      index: true,
    },
    aggregateType: {
      type: String,
      required: true,
      default: 'work_requirement',
    },
    aggregateId: {
      type: String,
      required: true,
      index: true,
    },
    schemaVersion: {
      type: Number,
      required: true,
      default: 1,
    },
    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'dispatching', 'queued', 'processed', 'dead_letter'],
      default: 'pending',
      index: true,
    },
    dispatchGeneration: {
      type: Number,
      required: true,
      default: 1,
    },
    leaseToken: {
      type: String,
      default: null,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
    },
    attempts: {
      type: Number,
      required: true,
      default: 0,
    },
    nextAttemptAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    enqueuedAt: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index for polling due pending events efficiently
notificationOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

// Compound index for recovering expired dispatch leases
notificationOutboxSchema.index({ status: 1, leaseExpiresAt: 1 });

// Compound index for aggregate lookups
notificationOutboxSchema.index({ aggregateId: 1, eventType: 1 });

export const NotificationOutbox: Model<INotificationOutbox> =
  mongoose.models.NotificationOutbox ||
  mongoose.model<INotificationOutbox>('NotificationOutbox', notificationOutboxSchema);

