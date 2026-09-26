import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaymentType = 'advance';
export type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed';

export interface IPayment extends Document {
  eventId: Types.ObjectId;
  quotationId: Types.ObjectId;
  clientId: Types.ObjectId;
  paymentType: PaymentType;
  amount: number;
  currency: string;
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  receiptReference: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paymentType: { type: String, enum: ['advance'], required: true },
    amount: { type: Number, required: true }, // Amount in standard unit (e.g. INR), or you can store paise. Standard unit is usually easier if handled properly, but paise prevents floating point issues. We'll store standard unit to match quotation and convert to paise on order creation.
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['created', 'pending', 'paid', 'failed'], default: 'created' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    receiptReference: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

// Indexes
PaymentSchema.index({ eventId: 1 });
PaymentSchema.index({ clientId: 1 });
PaymentSchema.index({ quotationId: 1 });
PaymentSchema.index({ receiptReference: 1 }, { unique: true });
PaymentSchema.index({ razorpayOrderId: 1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
