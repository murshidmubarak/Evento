import mongoose, { Schema, Document, Types } from 'mongoose';

export type ReminderType = 'due_date' | 'link_expiry';
export type ReminderStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface IPaymentReminderLog extends Document {
  dedupKey: string;
  eventId: Types.ObjectId;
  quotationId: Types.ObjectId;
  quotationRevision: number;
  installmentIndex: number;
  installmentId?: string;
  installmentTitle: string;
  reminderType: ReminderType;
  reminderWindow: string; // e.g., '2_days_before', '1_day_before'
  paymentLinkId?: string;
  recipientEmail: string;
  recipientName?: string;
  scheduledAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  dueDate?: Date;
  linkExpiryDate?: Date;
  paymentLinkUrl?: string;
  status: ReminderStatus;
  sentAt?: Date;
  failureReason?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentReminderLogSchema = new Schema<IPaymentReminderLog>(
  {
    dedupKey: { type: String, required: true, unique: true },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true },
    quotationRevision: { type: Number, required: true },
    installmentIndex: { type: Number, required: true },
    installmentId: { type: String },
    installmentTitle: { type: String, required: true },
    reminderType: { type: String, enum: ['due_date', 'link_expiry'], required: true },
    reminderWindow: { type: String, required: true },
    paymentLinkId: { type: String },
    recipientEmail: { type: String, required: true },
    recipientName: { type: String },
    scheduledAmount: { type: Number, required: true },
    paidAmount: { type: Number, required: true },
    outstandingAmount: { type: Number, required: true },
    dueDate: { type: Date },
    linkExpiryDate: { type: Date },
    paymentLinkUrl: { type: String },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending',
    },
    sentAt: { type: Date },
    failureReason: { type: String },
    retryCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Indexes
PaymentReminderLogSchema.index({ eventId: 1, installmentIndex: 1 });
PaymentReminderLogSchema.index({ quotationId: 1 });
PaymentReminderLogSchema.index({ reminderType: 1, status: 1 });
PaymentReminderLogSchema.index({ createdAt: -1 });

export const PaymentReminderLog = mongoose.model<IPaymentReminderLog>(
  'PaymentReminderLog',
  PaymentReminderLogSchema
);
