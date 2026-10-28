import mongoose, { Schema, Document } from 'mongoose';

export type NotificationType =
  | 'work_opportunity'
  | 'assignment_confirmed'
  | 'selection_summary'
  | 'payment_received'
  | 'event_updated'
  | 'general';

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  recipientId: mongoose.Types.ObjectId;
  type: NotificationType | string;
  title: string;
  message: string;
  isRead: boolean;
  readAt?: Date;
  resourceType?: string;
  resourceId?: string;
  destinationRoute?: string;
  deduplicationKey?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    resourceType: {
      type: String,
      trim: true,
      default: null,
    },
    resourceId: {
      type: String,
      trim: true,
      default: null,
    },
    destinationRoute: {
      type: String,
      trim: true,
      default: null,
    },
    deduplicationKey: {
      type: String,
      trim: true,
      sparse: true,
      unique: true,
      index: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for optimal querying
NotificationSchema.index({ recipientId: 1, createdAt: -1 });
NotificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });

export const Notification = mongoose.model<INotification>('Notification', NotificationSchema);
