import { apiClient } from '../../services/apiClient';

export interface ManagerStats {
  totalAssigned: number;
  upcoming: number;
  ongoing: number;
  completed: number;
}

export interface ManagerEvent {
  _id: string;
  title: string;
  eventType: string;
  customEventType?: string;
  date: string;
  startTime: string;
  endTime: string;
  location: {
    address: string;
    latitude?: number;
    longitude?: number;
    lat?: number;
    lng?: number;
  };
  guestCount?: number;
  status: string;
  budget?: number;
  notes?: string;
  clientInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  clientId?: {
    _id?: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  selectedServices?: Array<{
    serviceId: {
      _id: string;
      name: string;
      category?: string;
      description?: string;
    } | string;
    serviceName?: string;
    serviceDescription?: string;
    preferences?: Record<string, any>;
    referenceImages?: Array<{
      url: string;
      publicId: string;
    }>;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export const managerApi = {
  /**
   * Fetch authenticated manager's dashboard metrics
   */
  async getDashboardStats(): Promise<ManagerStats> {
    const response = await apiClient.get<{ success: boolean; data: { stats: ManagerStats } }>('/manager/dashboard');
    return response.data.data.stats;
  },

  /**
   * Fetch events assigned to the authenticated manager
   */
  async getManagerEvents(params?: Record<string, string>): Promise<ManagerEvent[]> {
    const response = await apiClient.get<{ success: boolean; data: { events: ManagerEvent[] } }>('/manager/events', {
      params,
    });
    return response.data.data.events;
  },

  /**
   * Fetch a single assigned event by ID for the manager
   */
  async getManagerEventById(id: string): Promise<ManagerEvent> {
    const response = await apiClient.get<{ success: boolean; data: { event: ManagerEvent } }>(`/manager/events/${id}`);
    return response.data.data.event;
  },
};
