import { apiClient } from '../../services/apiClient';
import { WORKER_TYPES, type WorkerType } from '../workers/workersApi';

export { WORKER_TYPES, type WorkerType };

export type WorkRequirementStatus =
  | 'draft'
  | 'open'
  | 'selection_in_progress'
  | 'filled'
  | 'closed'
  | 'cancelled';

export interface WorkRequirement {
  _id: string;
  eventId: string;
  workerType: WorkerType;
  requiredCount: number;
  reportingTime: string;
  description?: string;
  status: WorkRequirementStatus;
  filled?: number;
  pending?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateWorkRequirementPayload {
  workerType: WorkerType;
  requiredCount: number;
  reportingTime: string;
  description?: string;
}

export interface UpdateWorkRequirementPayload {
  workerType?: WorkerType;
  requiredCount?: number;
  reportingTime?: string;
  description?: string;
  status?: WorkRequirementStatus;
}

export const workRequirementsApi = {
  /**
   * Fetch all work requirements for a specific assigned event
   */
  async getRequirementsByEvent(eventId: string): Promise<WorkRequirement[]> {
    const response = await apiClient.get<{
      success: boolean;
      data: { requirements: WorkRequirement[] };
    }>(`/manager/events/${eventId}/work-requirements`);
    return response.data.data.requirements;
  },

  /**
   * Fetch a single work requirement by ID
   */
  async getRequirementById(reqId: string): Promise<WorkRequirement> {
    const response = await apiClient.get<{
      success: boolean;
      data: { requirement: WorkRequirement };
    }>(`/manager/work-requirements/${reqId}`);
    return response.data.data.requirement;
  },

  /**
   * Create a new work requirement for an assigned confirmed event
   */
  async createRequirement(
    eventId: string,
    payload: CreateWorkRequirementPayload
  ): Promise<WorkRequirement> {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: { requirement: WorkRequirement };
    }>(`/manager/events/${eventId}/work-requirements`, payload);
    return response.data.data.requirement;
  },

  /**
   * Update fields of a draft work requirement or transition status to cancelled
   */
  async updateRequirement(
    reqId: string,
    payload: UpdateWorkRequirementPayload
  ): Promise<WorkRequirement> {
    const response = await apiClient.patch<{
      success: boolean;
      message: string;
      data: { requirement: WorkRequirement };
    }>(`/manager/work-requirements/${reqId}`, payload);
    return response.data.data.requirement;
  },

  /**
   * Cancel a work requirement
   */
  async cancelRequirement(reqId: string): Promise<WorkRequirement> {
    return this.updateRequirement(reqId, { status: 'cancelled' });
  },
};
