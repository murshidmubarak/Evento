export type QuotationStatus = 'draft' | 'sent' | 'awaiting_approval' | 'changes_requested' | 'accepted' | 'rejected' | 'expired';

export type TaxType = 'none' | 'gst' | 'vat' | 'custom';
export type GstTreatment = 'intra_state' | 'inter_state' | 'exempt' | 'none';

export interface IEventSnapshot {
  title?: string;
  eventType?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  location?: any;
  guestCount?: number;
  clientName?: string;
}

export interface IQuotationItemContent {
  sectionName: string;
  items: string[];
}

export interface IQuotationItem {
  serviceId: string;
  name: string;
  description: string;
  pricingType: string;
  requirements?: string;
  scope?: string;
  detailedContent?: IQuotationItemContent[];
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface IPaymentInstallment {
  title: string;
  percentage?: number;
  amount: number;
  dueDateDescription: string;
  purpose: string[];
  status?: string;
}

export interface IQuotationSchedule {
  title: string;
  time: string;
}

export interface IStructuredTerm {
  title: string;
  content: string;
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

export interface Quotation {
  _id: string;
  quotationNumber: string;
  revision: number;
  eventId: string;
  clientId: string;
  eventSnapshot?: IEventSnapshot;
  items: IQuotationItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  tax: ITaxDetails;
  finalAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  validUntil?: string;
  notes?: string;
  terms?: string;
  structuredTerms?: IStructuredTerm[];
  schedules?: IQuotationSchedule[];
  paymentPlan?: IPaymentInstallment[];
  conciergeNotes?: string;
  clientNotes?: string;
  rejectionReason?: string;
  status: QuotationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuotationRequest {
  eventId: string;
  items: {
    serviceId: string;
    quantity: number;
    unitPrice: number;
    requirements?: string;
    scope?: string;
    detailedContent?: { sectionName: string; items: string[] }[];
    pricingType?: string;
  }[];
  discount?: number;
  advanceAmount?: number;
  tax?: {
    taxType?: TaxType;
    taxRate?: number;
    gstTreatment?: GstTreatment;
    placeOfSupply?: string;
    customerGstin?: string;
  };
  validUntil?: string;
  notes?: string;
  terms?: string;
  structuredTerms?: IStructuredTerm[];
  schedules?: IQuotationSchedule[];
  paymentPlan?: IPaymentInstallment[];
  conciergeNotes?: string;
}
