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
  date: string;
  startTime: string;
  endTime: string;
  location: {
    address: string;
    latitude?: number;
    longitude?: number;
  };
  guestCount?: number;
  status: string;
  budget?: number;
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
};
