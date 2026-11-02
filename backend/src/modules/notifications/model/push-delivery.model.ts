import mongoose, { Schema, Document } from 'mongoose';

export type PushDeliveryStatus =
  | 'pending'
  | 'queued'
  | 'sending'
  | 'sent'
  | 'retry_pending'
  | 'invalid_subscription'
  | 'dead_letter';

export type PushErrorCategory =
  | 'temporary'
  | 'permanent'
  | 'unsubscribed'
  | 'configuration'
  | null;

export interface IPushDelivery extends Document {
  _id: mongoose.Types.ObjectId;
  notificationId: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  endpointHash: string;
  deliveryKey: string;
  status: PushDeliveryStatus;
  dispatchGeneration: number;
  attemptCount: number;
  maxAttempts: number;
  leaseOwner?: string | null;
  leaseExpiresAt?: Date | null;
  nextAttemptAt: Date;
  lastAttemptAt?: Date | null;
  acceptedAt?: Date | null;
  lastErrorCategory?: PushErrorCategory;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const PushDeliverySchema = new Schema<IPushDelivery>(
  {
    notificationId: {
      type: Schema.Types.ObjectId,
      ref: 'Notification',
      required: true,
      index: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: 'PushSubscription',
      required: true,
      index: true,
    },
    endpointHash: {
      type: String,
      required: true,
      trim: true,
    },
    deliveryKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'queued', 'sending', 'sent', 'retry_pending', 'invalid_subscription', 'dead_letter'],
      default: 'pending',
      index: true,
    },
    dispatchGeneration: {
      type: Number,
      default: 1,
    },
    attemptCount: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    leaseOwner: {
      type: String,
      default: null,
    },
    leaseExpiresAt: {
      type: Date,
      default: null,
    },
    nextAttemptAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    lastAttemptAt: {
      type: Date,
      default: null,
    },
    acceptedAt: {
      type: Date,
      default: null,
    },
    lastErrorCategory: {
      type: String,
      enum: ['temporary', 'permanent', 'unsubscribed', 'configuration', null],
      default: null,
    },
    lastError: {
      type: String,
      default: null,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Unique compound index preventing duplicate logical delivery intent for the same notification + device
PushDeliverySchema.index({ notificationId: 1, subscriptionId: 1 }, { unique: true });

// Optimized index for dispatcher claiming and retry polling
PushDeliverySchema.index({ status: 1, nextAttemptAt: 1, leaseExpiresAt: 1 });

// Index for recipient history queries
PushDeliverySchema.index({ recipientId: 1, createdAt: -1 });

export const PushDelivery = mongoose.model<IPushDelivery>('PushDelivery', PushDeliverySchema);

