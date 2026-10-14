import mongoose, { Schema, Document } from 'mongoose';

export interface IWebhookReceipt extends Document {
  eventId: string;
  eventType: string;
  paymentLinkId?: string;
  paymentId?: string;
  processedAt: Date;
  summary?: string;
}

const WebhookReceiptSchema = new Schema<IWebhookReceipt>(
  {
    eventId: { type: String, required: true, unique: true },
    eventType: { type: String, required: true },
    paymentLinkId: { type: String },
    paymentId: { type: String },
    processedAt: { type: Date, default: Date.now },
    summary: { type: String },
  },
  { timestamps: true }
);

export const WebhookReceipt = mongoose.model<IWebhookReceipt>('WebhookReceipt', WebhookReceiptSchema);
