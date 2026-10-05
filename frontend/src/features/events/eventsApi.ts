import { apiClient } from '../../services/apiClient';
import type { ClientEvent, CreateEventRequest } from './event.types';

export const getMyEvents = async (): Promise<ClientEvent[]> => {
  const response = await apiClient.get<{ data: { events: ClientEvent[] } }>('/events');
  return response.data.data.events;
};

export const getAllEvents = async (params?: Record<string, string>): Promise<ClientEvent[]> => {
  const query = params ? `?${new URLSearchParams(params).toString()}` : '';
  const response = await apiClient.get<{ data: { events: ClientEvent[] } }>(`/events/all${query}`);
  return response.data.data.events;
};

export const getEventById = async (eventId: string): Promise<ClientEvent> => {
  const response = await apiClient.get<{ data: { event: ClientEvent } }>(`/events/${eventId}`);
  return response.data.data.event;
};

export const createEvent = async (request: CreateEventRequest): Promise<ClientEvent> => {
  const response = await apiClient.post<{ data: { event: ClientEvent } }>('/events', request);
  return response.data.data.event;
};

export const uploadServiceReferenceImages = async (eventId: string, serviceId: string, files: File[]): Promise<any> => {
  const formData = new FormData();
  formData.append('serviceId', serviceId);
  files.forEach(file => {
    formData.append('images', file);
  });

  const response = await apiClient.post(`/events/${eventId}/service-reference-images`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};
