import mongoose, { Schema, type Document, type Types } from 'mongoose';

export type QuotationStatus = 'draft' | 'sent' | 'awaiting_approval' | 'changes_requested' | 'accepted' | 'rejected' | 'expired';
export type TaxType = 'none' | 'gst' | 'vat' | 'custom';
export type GstTreatment = 'intra_state' | 'inter_state' | 'exempt' | 'none';

export interface IQuotationItem {
  serviceId: Types.ObjectId;
  name: string;
  description: string;
  pricingType: string;
  requirements?: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface ITaxDetails {
  taxType: TaxType;
  taxRate: number;
  gstTreatment?: GstTreatment;
  taxableAmount: number;
  taxAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  placeOfSupply?: string;
  customerGstin?: string;
}

export interface IQuotation extends Document {
  quotationNumber: string;
  revision: number;
  eventId: Types.ObjectId;
  clientId: Types.ObjectId;
  items: IQuotationItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  tax: ITaxDetails;
  finalAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  validUntil?: Date;
  notes?: string;
  terms?: string;
  status: QuotationStatus;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const quotationItemSchema = new Schema<IQuotationItem>(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    pricingType: { type: String, required: true },
    requirements: { type: String },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const taxDetailsSchema = new Schema<ITaxDetails>(
  {
    taxType: {
      type: String,
      enum: ['none', 'gst', 'vat', 'custom'],
      default: 'none',
      required: true,
    },
    taxRate: { type: Number, required: true, min: 0, default: 0 },
    gstTreatment: {
      type: String,
      enum: ['intra_state', 'inter_state', 'exempt', 'none'],
      default: 'none',
    },
    taxableAmount: { type: Number, required: true, min: 0, default: 0 },
    taxAmount: { type: Number, required: true, min: 0, default: 0 },
    cgst: { type: Number, required: true, min: 0, default: 0 },
    sgst: { type: Number, required: true, min: 0, default: 0 },
    igst: { type: Number, required: true, min: 0, default: 0 },
    placeOfSupply: { type: String },
    customerGstin: { type: String },
  },
  { _id: false }
);

const quotationSchema = new Schema<IQuotation>(
  {
    quotationNumber: { type: String, required: true },
    revision: { type: Number, required: true, min: 1 },
    eventId: { type: Schema.Types.ObjectId, ref: 'Event', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    items: {
      type: [quotationItemSchema],
      required: true,
      validate: [(val: any[]) => val.length > 0, 'At least one item is required'],
    },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0 },
    taxableAmount: { type: Number, required: true, min: 0 },
    tax: {
      type: taxDetailsSchema,
      required: true,
      default: () => ({
        taxType: 'none',
        taxRate: 0,
        gstTreatment: 'none',
        taxableAmount: 0,
        taxAmount: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
      }),
    },
    finalAmount: { type: Number, required: true, min: 0 },
    advanceAmount: { type: Number, required: true, min: 0 },
    remainingAmount: { type: Number, required: true, min: 0 },
    validUntil: { type: Date },
    notes: { type: String },
    terms: { type: String },
    status: {
      type: String,
      enum: ['draft', 'sent', 'awaiting_approval', 'changes_requested', 'accepted', 'rejected', 'expired'],
      default: 'draft',
      required: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// Compound index to ensure uniqueness of revision per quotation thread
quotationSchema.index({ quotationNumber: 1, revision: 1 }, { unique: true });

// Index on eventId to quickly find quotations for an event
quotationSchema.index({ eventId: 1 });

export const Quotation = mongoose.model<IQuotation>('Quotation', quotationSchema);
