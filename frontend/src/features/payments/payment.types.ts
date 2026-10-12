export interface VerifiedPaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'created' | 'pending' | 'failed';
  razorpayPaymentId?: string;
  receiptReference: string;
  createdAt: string;
}

export interface AdvancePaymentSummary {
  eventId: string;
  eventTitle: string;
  eventStatus: string;
  hasAcceptedQuotation: boolean;
  isEligibleForPayment: boolean;
  quotationId?: string;
  quotationNumber?: string;
  quotationRevision?: number;
  quotationStatus?: string;
  totalQuotationAmount: number;
  requiredAdvance: number;
  advancePaidAmount: number;
  outstandingAdvance: number;
  isFullyPaid: boolean;
  advanceInstallment?: {
    title: string;
    amount: number;
    dueDateDescription?: string;
    dueDate?: string;
    expiryDate?: string;
    status?: string;
    purpose?: string[];
  } | null;
  payments: VerifiedPaymentRecord[];
}

export interface CreateOrderResponse {
  paymentId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  requiredAdvance: number;
  advancePaidAmount: number;
  outstandingAdvance: number;
}

export interface VerifyPaymentPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface VerifyPaymentResponse {
  paymentId: string;
  status: string;
  amountPaid: number;
  totalAdvancePaid: number;
  requiredAdvance: number;
  outstandingAdvance: number;
  isFullyPaid: boolean;
  eventStatus: string;
  quotationStatus: string;
}
