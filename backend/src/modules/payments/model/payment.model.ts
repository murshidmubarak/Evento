import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaymentType = 'advance' | 'installment';
export type PaymentStatus = 'created' | 'pending' | 'paid' | 'failed';
export type PaymentLinkStatus = 'active' | 'expired' | 'paid' | 'replaced' | 'cancelled';

export interface IPaymentAllocation {
  installmentIndex: number;
  installmentId?: string;
  installmentTitle: string;
  allocatedAmount: number;
}

export interface IPayment extends Document {
  eventId: Types.ObjectId;
  quotationId: Types.ObjectId;
  clientId: Types.ObjectId;
  paymentType: PaymentType;
  installmentId?: string;
  installmentIndex?: number;
  installmentTitle?: string;
  allocations?: IPaymentAllocation[];
  isFullPayment?: boolean;
  amount: number;
  currency: string;
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayPaymentLinkId?: string;
  paymentLinkUrl?: string;
  linkExpiresAt?: Date;
  linkStatus?: PaymentLinkStatus;
  previousPaymentId?: Types.ObjectId;
  renewedAt?: Date;
  renewedBy?: Types.ObjectId;
  receiptReference: string;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    quotationId: { type: Schema.Types.ObjectId, ref: 'Quotation', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    paymentType: { type: String, enum: ['advance', 'installment'], required: true },
    installmentId: { type: String },
    installmentIndex: { type: Number },
    installmentTitle: { type: String },
    allocations: [
      {
        installmentIndex: { type: Number, required: true },
        installmentId: { type: String },
        installmentTitle: { type: String, required: true },
        allocatedAmount: { type: Number, required: true },
      },
    ],
    isFullPayment: { type: Boolean, default: false },
    amount: { type: Number, required: true }, // Amount in standard unit (e.g. INR), converted to paise on order/link creation.
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['created', 'pending', 'paid', 'failed'], default: 'created' },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpayPaymentLinkId: { type: String },
    paymentLinkUrl: { type: String },
    linkExpiresAt: { type: Date },
    linkStatus: { type: String, enum: ['active', 'expired', 'paid', 'replaced', 'cancelled'] },
    previousPaymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    renewedAt: { type: Date },
    renewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    receiptReference: { type: String, required: true, unique: true },
  },
  { timestamps: true }
);

// Indexes
PaymentSchema.index({ eventId: 1 });
PaymentSchema.index({ clientId: 1 });
PaymentSchema.index({ quotationId: 1 });
PaymentSchema.index({ razorpayOrderId: 1 });
PaymentSchema.index({ eventId: 1, installmentIndex: 1 });
PaymentSchema.index({ razorpayPaymentLinkId: 1 });

export const Payment = mongoose.model<IPayment>('Payment', PaymentSchema);
