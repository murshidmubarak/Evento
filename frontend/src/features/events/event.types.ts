export type EventStatus = 'requested' | 'quoted' | 'awaiting_payment' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type EventType = 'Nikah' | 'Wedding' | 'Reception' | 'Engagement' | 'Birthday' | 'Corporate' | 'Other';

export interface EventServicePreference {
  serviceId: any;
  serviceName?: string;
  serviceDescription?: string;
  pricingType?: 'per_guest' | 'per_event' | 'package';
  basePrice?: number;
  preferences?: Record<string, unknown>;
  referenceImages?: {
    url: string;
    publicId?: string;
    fileName?: string;
    mimeType?: string;
  }[];
}

export interface ClientEvent {
  _id: string;
  clientId: string;
  title: string;
  eventType: EventType;
  customEventType?: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  clientInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  location: {
    address: string;
    lat?: number;
    lng?: number;
  };
  guestCount: number;
  budget?: number;
  selectedServices: EventServicePreference[];
  status: EventStatus;
  createdAt: string;
  updatedAt: string;
  eventManagerId?: any; // Manager details if populated
}

export interface CreateEventRequest {
  title: string;
  eventType: EventType;
  customEventType?: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
  clientInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  location: {
    address: string;
    lat?: number;
    lng?: number;
  };
  guestCount: number;
  budget?: number;
  selectedServices: { serviceId: string; preferences?: Record<string, unknown> }[];
}
