import { apiClient } from '../../services/apiClient';
import type { Quotation, CreateQuotationRequest } from './quotation.types';

export const getQuotations = async (eventId?: string): Promise<Quotation[]> => {
  const url = eventId ? `/quotations?eventId=${eventId}` : '/quotations';
  const response = await apiClient.get<{ data: Quotation[] }>(url);
  // Based on the ApiResponse format: data usually contains the exact response, or data.data
  // We'll trust apiClient interceptors or standard format.
  // Actually, wait, let's check the backend controller structure again...
  // In the backend: new ApiResponse(200, 'msg', data).send(res) -> { success: true, message: 'msg', data: ... }
  // Oh, wait, other endpoints return { data: { events: ... } }. Quotation returns data: quotations
  return response.data.data as unknown as Quotation[];
};

export const getQuotationById = async (id: string): Promise<Quotation> => {
  const response = await apiClient.get<{ data: Quotation }>(`/quotations/${id}`);
  return response.data.data as unknown as Quotation;
};

export const createQuotation = async (request: CreateQuotationRequest): Promise<Quotation> => {
  const response = await apiClient.post<{ data: Quotation }>('/quotations', request);
  return response.data.data as unknown as Quotation;
};

export const sendQuotation = async (id: string): Promise<Quotation> => {
  const response = await apiClient.post<{ data: Quotation }>(`/quotations/${id}/send`);
  return response.data.data as unknown as Quotation;
};
