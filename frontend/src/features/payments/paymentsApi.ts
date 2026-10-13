import { apiClient } from '../../services/apiClient';
import type {
  AdvancePaymentSummary,
  PaymentScheduleSummary,
  PaymentAllocationPreview,
  CreateOrderResponse,
  VerifyPaymentPayload,
  VerifyPaymentResponse,
  RenewPaymentLinkRequest,
  RenewPaymentLinkResponse,
} from './payment.types';

export const getAdvanceSummary = async (eventId: string): Promise<AdvancePaymentSummary> => {
  const response = await apiClient.get<{ data: AdvancePaymentSummary }>(`/payments/advance-summary/${eventId}`);
  return response.data.data;
};

export const getPaymentSchedule = async (eventId: string): Promise<PaymentScheduleSummary> => {
  const response = await apiClient.get<{ data: PaymentScheduleSummary }>(`/payments/schedule/${eventId}`);
  return response.data.data;
};

export interface CreatePaymentOrderOptions {
  customAmount?: number;
  isFullPayment?: boolean;
  paymentOption?: 'current_installment' | 'custom' | 'full_balance';
  allowExcess?: boolean;
}

export const createPaymentOrder = async (
  eventId: string,
  amount?: number,
  installmentIndex?: number,
  options?: CreatePaymentOrderOptions
): Promise<CreateOrderResponse> => {
  const body: any = { eventId };
  if (amount !== undefined && amount > 0) {
    body.partialAmount = amount;
    body.amount = amount;
  }
  if (options?.customAmount !== undefined && options.customAmount > 0) {
    body.customAmount = options.customAmount;
  }
  if (options?.isFullPayment) {
    body.isFullPayment = true;
  }
  if (options?.paymentOption) {
    body.paymentOption = options.paymentOption;
  }
  if (options?.allowExcess) {
    body.allowExcess = true;
  }
  if (installmentIndex !== undefined && installmentIndex >= 0) {
    body.installmentIndex = installmentIndex;
  }
  const response = await apiClient.post<{ data: CreateOrderResponse }>('/payments/create-order', body);
  return response.data.data;
};

export const previewPaymentAllocation = async (
  eventId: string,
  amount?: number,
  options?: {
    isFullPayment?: boolean;
    paymentOption?: 'current_installment' | 'custom' | 'full_balance';
    installmentIndex?: number;
  }
): Promise<PaymentAllocationPreview> => {
  const body: any = { eventId };
  if (amount !== undefined && amount > 0) {
    body.amount = amount;
  }
  if (options?.isFullPayment) {
    body.isFullPayment = true;
  }
  if (options?.paymentOption) {
    body.paymentOption = options.paymentOption;
  }
  if (options?.installmentIndex !== undefined && options.installmentIndex >= 0) {
    body.installmentIndex = options.installmentIndex;
  }
  const response = await apiClient.post<{ data: PaymentAllocationPreview }>('/payments/preview-allocation', body);
  return response.data.data;
};

export const verifyPayment = async (payload: VerifyPaymentPayload): Promise<VerifyPaymentResponse> => {
  const response = await apiClient.post<{ data: VerifyPaymentResponse }>('/payments/verify', payload);
  return response.data.data;
};

export const renewPaymentLink = async (payload: RenewPaymentLinkRequest): Promise<RenewPaymentLinkResponse> => {
  const response = await apiClient.post<{ data: RenewPaymentLinkResponse }>('/payments/renew-link', payload);
  return response.data.data;
};

export const getAdminPayments = async (eventId?: string): Promise<any[]> => {
  const url = eventId ? `/payments/admin?eventId=${eventId}` : '/payments/admin';
  const response = await apiClient.get<{ data: any[] }>(url);
  return response.data.data;
};
