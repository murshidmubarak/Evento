import { apiClient as api } from '../../services/apiClient';

export interface NotificationItem {
  _id: string;
  recipientId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  readAt?: string;
  resourceType?: string;
  resourceId?: string;
  destinationRoute?: string;
  deduplicationKey?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
}

export interface NotificationsResponse {
  notifications: NotificationItem[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const notificationsApi = {
  async getNotifications(params?: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<NotificationsResponse> {
    const res = await api.get<{ success: boolean; data: NotificationsResponse }>('/notifications', {
      params,
    });
    return res.data.data;
  },

  async markAsRead(id: string): Promise<NotificationItem> {
    const res = await api.patch<{ success: boolean; data: NotificationItem }>(
      `/notifications/${id}/read`
    );
    return res.data.data;
  },

  async markAllAsRead(): Promise<{ modifiedCount: number }> {
    const res = await api.patch<{ success: boolean; data: { modifiedCount: number } }>(
      '/notifications/read-all'
    );
    return res.data.data;
  },
};
