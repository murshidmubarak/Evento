import { apiClient } from '../../services/apiClient';
import type {
  AdvancePaymentSummary,
  CreateOrderResponse,
  VerifyPaymentPayload,
  VerifyPaymentResponse,
} from './payment.types';

export const getAdvanceSummary = async (eventId: string): Promise<AdvancePaymentSummary> => {
  const response = await apiClient.get<{ data: AdvancePaymentSummary }>(`/payments/advance-summary/${eventId}`);
  return response.data.data;
};

export const createPaymentOrder = async (
  eventId: string,
  partialAmount?: number
): Promise<CreateOrderResponse> => {
  const body: { eventId: string; partialAmount?: number } = { eventId };
  if (partialAmount !== undefined && partialAmount > 0) {
    body.partialAmount = partialAmount;
  }
  const response = await apiClient.post<{ data: CreateOrderResponse }>('/payments/create-order', body);
  return response.data.data;
};

export const verifyPayment = async (payload: VerifyPaymentPayload): Promise<VerifyPaymentResponse> => {
  const response = await apiClient.post<{ data: VerifyPaymentResponse }>('/payments/verify', payload);
  return response.data.data;
};

export const getAdminPayments = async (eventId?: string): Promise<any[]> => {
  const url = eventId ? `/payments/admin?eventId=${eventId}` : '/payments/admin';
  const response = await apiClient.get<{ data: any[] }>(url);
  return response.data.data;
};
