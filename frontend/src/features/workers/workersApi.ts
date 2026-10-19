import { apiClient } from '../../services/apiClient';
import type { User } from '../../types/auth';

export const WORKER_TYPES = [
  'Catering Boy',
  'Catering Supervisor',
  'Chef',
  'Cameraman / Photographer',
  'Videographer',
  'Decoration Worker',
  'Juice Worker',
  'Host',
] as const;

export type WorkerType = (typeof WORKER_TYPES)[number];

export interface CreateWorkerPayload {
  name: string;
  email: string;
  workerType: WorkerType;
  phone?: string;
}

export interface WorkerListResponse {
  success: boolean;
  message: string;
  data: {
    workers: User[];
    total: number;
    page: number;
    limit: number;
  };
}

export interface CreateWorkerResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
  };
}

export const workersApi = {
  /**
   * Create a new Worker account (initiates invitation flow and sends invitation email)
   */
  async createWorker(payload: CreateWorkerPayload): Promise<User> {
    const response = await apiClient.post<CreateWorkerResponse>('/users/workers', payload);
    return response.data.data.user;
  },

  /**
   * Retrieve list of workers.
   * If caller is Event Manager, backend scopes workers to those created by this manager.
   * If caller is Admin, all workers are returned.
   */
  async getWorkers(params?: { workerType?: string; page?: number; limit?: number }): Promise<{
    workers: User[];
    total: number;
    page: number;
    limit: number;
  }> {
    const response = await apiClient.get<WorkerListResponse>('/users/workers', {
      params,
    });
    return response.data.data;
  },

  /**
   * Resend invitation email to a pending worker
   */
  async resendInvitation(workerId: string): Promise<{ message: string }> {
    const response = await apiClient.post<{ success: boolean; message: string }>(
      `/users/workers/${workerId}/resend-invitation`
    );
    return { message: response.data.message };
  },
};
