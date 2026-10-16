import { apiClient } from '../../services/apiClient';
import type { User } from '../../types/auth';

export interface CreateEventManagerPayload {
  name: string;
  email: string;
  password: string;
  phone?: string;
}

export interface UserListResponse {
  success: boolean;
  message: string;
  data: {
    users: User[];
  };
}

export interface CreateUserResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
  };
}

export const usersApi = {
  /**
   * Admin creates a new Event Manager
   */
  async createEventManager(payload: CreateEventManagerPayload): Promise<User> {
    const response = await apiClient.post<CreateUserResponse>('/users/event-managers', payload);
    return response.data.data.user;
  },

  /**
   * Admin retrieves Event Managers list
   */
  async getEventManagers(): Promise<User[]> {
    const response = await apiClient.get<UserListResponse>('/users', {
      params: { role: 'event_manager' },
    });
    return response.data.data.users;
  },
};
