export interface PaymentAllocation {
  installmentIndex: number;
  installmentId?: string;
  installmentTitle: string;
  allocatedAmount: number;
}

export interface ResultingInstallmentBalance {
  installmentIndex: number;
  title: string;
  scheduledAmount: number;
  previousPaid: number;
  allocatedAmount: number;
  resultingPaid: number;
  resultingOutstanding: number;
  resultingStatus: string;
}

export interface PaymentAllocationPreview {
  eventId: string;
  quotationId: string;
  quotationNumber: string;
  quotationRevision: number;
  totalQuotationAmount: number;
  totalVerifiedPaid: number;
  totalOutstanding: number;
  targetAmount: number;
  isFullPayment: boolean;
  willConfirmEvent: boolean;
  allocations: PaymentAllocation[];
  resultingBalances: ResultingInstallmentBalance[];
}

export interface VerifiedPaymentRecord {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'created' | 'pending' | 'failed';
  paymentType?: 'advance' | 'installment';
  installmentIndex?: number;
  razorpayPaymentId?: string;
  receiptReference: string;
  allocations?: PaymentAllocation[];
  isFullPayment?: boolean;
  createdAt: string;
}

export interface PaymentLinkRecord {
  id: string;
  linkId: string;
  shortUrl: string;
  amount: number;
  status: 'active' | 'expired' | 'paid' | 'replaced' | 'cancelled';
  expiresAt: string;
  createdAt: string;
  renewedAt?: string;
  renewedBy?: string;
}

export interface InstallmentPaymentSummary {
  installmentId?: string;
  installmentIndex: number;
  title: string;
  scheduledAmount: number;
  percentage?: number;
  verifiedPaidAmount: number;
  outstandingAmount: number;
  dueDate?: string;
  dueDateDescription?: string;
  expiryDate?: string;
  status: string; // 'Paid' | 'Partially Paid' | 'Overdue' | 'Expired' | 'Pending'
  baseStatus: 'Paid' | 'Partially Paid' | 'Pending';
  isOverdue: boolean;
  isExpired: boolean;
  isEligibleForPayment: boolean;
  isEligibleForRenewal: boolean;
  currentPaymentLink?: {
    linkId?: string;
    shortUrl: string;
    amount: number;
    status: string;
    expiresAt: string;
    createdAt?: string;
  } | null;
  linkHistory: PaymentLinkRecord[];
  payments: VerifiedPaymentRecord[];
}

export interface PaymentScheduleSummary {
  eventId: string;
  eventTitle: string;
  eventStatus: string;
  hasAcceptedQuotation: boolean;
  quotationId?: string;
  quotationNumber?: string;
  quotationRevision?: number;
  quotationStatus?: string;
  finalAmount?: number;
  totalQuotationAmount: number;
  totalPaidAmount: number;
  totalOutstandingAmount: number;
  requiredAdvance: number;
  advancePaidAmount: number;
  outstandingAdvance: number;
  isAdvanceFullyPaid: boolean;
  isAdvanceSettled?: boolean;
  isQuotationFullyPaid: boolean;
  canPayFullBalance: boolean;
  isScheduleConsistent?: boolean;
  scheduleMismatchMessage?: string;
  installments: InstallmentPaymentSummary[];
  payments: VerifiedPaymentRecord[];
}

export interface AdvancePaymentSummary extends PaymentScheduleSummary {
  isFullyPaid: boolean;
  isEligibleForPayment: boolean;
  advanceInstallment?: InstallmentPaymentSummary | null;
}

export interface CreateOrderResponse {
  paymentId: string;
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  installmentIndex?: number;
  installmentTitle?: string;
  requiredAdvance?: number;
  advancePaidAmount?: number;
  outstandingAdvance?: number;
  scheduledAmount?: number;
  verifiedPaidAmount?: number;
  outstandingAmount?: number;
  totalOutstanding?: number;
  allocations?: PaymentAllocation[];
  isFullPayment?: boolean;
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
  paymentType?: 'advance' | 'installment';
  installmentIndex?: number;
  installmentStatus?: string;
  totalPaidForInstallment?: number;
  scheduledAmount?: number;
  totalAdvancePaid?: number;
  requiredAdvance?: number;
  outstandingAdvance?: number;
  outstandingAmount?: number;
  isFullyPaid: boolean;
  eventStatus: string;
  quotationStatus: string;
  allocations?: PaymentAllocation[];
  isFullPayment?: boolean;
  totalQuotationAmount?: number;
  totalPaidAmount?: number;
  totalOutstandingAmount?: number;
  isQuotationFullyPaid?: boolean;
  quotationNumber?: string;
  quotationRevision?: number;
}

export interface RenewPaymentLinkRequest {
  eventId: string;
  installmentIndex: number;
  newExpiryDate?: string;
}

export interface RenewPaymentLinkResponse {
  success: boolean;
  paymentId: string;
  razorpayPaymentLinkId: string;
  paymentLinkUrl: string;
  installmentIndex: number;
  installmentTitle: string;
  scheduledAmount: number;
  verifiedPaidAmount: number;
  outstandingAmount: number;
  newExpiryDate: string;
  dueDate?: string;
  previousLinkId?: string;
  message?: string;
}
