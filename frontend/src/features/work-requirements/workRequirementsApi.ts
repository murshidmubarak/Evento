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

export interface AssignedWorkerRecord {
  workerId: {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    workerType?: string;
    businessId?: string;
    location?: {
      address?: string;
    };
  } | string;
  assignedAt: string;
  distanceKm?: number;
  distanceScore?: number;
  selectionRound?: number;
}

export interface ExtensionHistoryRecord {
  previousDeadline: string;
  newDeadline: string;
  extendedBy: {
    name?: string;
    email?: string;
  } | string;
  extendedAt: string;
  remainingCount: number;
}

export interface WorkRequirement {
  _id: string;
  eventId: string;
  workerType: WorkerType;
  requiredCount: number;
  reportingTime: string;
  description?: string;
  maxDistanceKm?: number;
  interestDeadlineAt?: string;
  interestPublishedAt?: string;
  selectionRound?: number;
  assignedWorkers?: AssignedWorkerRecord[];
  extensionHistory?: ExtensionHistoryRecord[];
  status: WorkRequirementStatus;
  filled?: number;
  pending?: number;
  interestCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateWorkRequirementPayload {
  workerType: WorkerType;
  requiredCount: number;
  reportingTime: string;
  description?: string;
  maxDistanceKm?: number;
  interestDeadlineAt?: string;
}

export interface UpdateWorkRequirementPayload {
  workerType?: WorkerType;
  requiredCount?: number;
  reportingTime?: string;
  description?: string;
  maxDistanceKm?: number;
  interestDeadlineAt?: string;
  status?: WorkRequirementStatus;
}

export interface SelectionResultsData {
  requirement: WorkRequirement;
  assignedWorkers: AssignedWorkerRecord[];
  candidates: Array<{
    _id: string;
    workerId: {
      _id: string;
      name: string;
      email?: string;
      phone?: string;
      workerType?: string;
      businessId?: string;
      location?: { address?: string };
    };
    responseStatus: 'interested' | 'not_interested' | 'selected' | 'not_selected';
    respondedAt: string;
    distanceKm?: number;
    distanceScore?: number;
    selectionRound?: number;
  }>;
  extensionHistory: ExtensionHistoryRecord[];
}

export interface WorkerOpportunity {
  id: string;
  eventId: string;
  eventTitle: string;
  eventType: string;
  eventDate: string;
  eventLocation: {
    address: string;
  };
  workerType: WorkerType;
  requiredCount: number;
  reportingTime: string;
  description?: string;
  maxDistanceKm?: number;
  interestDeadlineAt?: string;
  interestPublishedAt?: string;
  distanceKm?: number | null;
  withinDistance?: boolean;
  isAssigned?: boolean;
  hasCalendarConflict?: boolean;
  hasExpressedInterest: boolean;
  myResponseStatus: 'not_responded' | 'interested' | 'selected' | 'not_selected';
  status?: string;
  selectionRound?: number;
}

export interface WorkerAssignment {
  requirementId: string;
  eventId: string;
  eventTitle: string;
  eventType: string;
  eventDate: string;
  eventLocation: {
    address: string;
  };
  workerType: WorkerType;
  reportingTime: string;
  description?: string;
  assignedAt: string;
  distanceKm?: number;
}

export interface WorkerLocationPayload {
  lat: number;
  lng: number;
  address?: string;
}

export interface WorkerLocationResponse {
  address?: string;
  lat: number;
  lng: number;
  confirmedAt?: string;
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
   * Update fields of a draft work requirement or transition status to open/cancelled
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

  /**
   * Extend the interest deadline for an unfilled work requirement
   */
  async extendDeadline(
    reqId: string,
    interestDeadlineAt: string
  ): Promise<WorkRequirement> {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: { requirement: WorkRequirement };
    }>(`/manager/work-requirements/${reqId}/extend-deadline`, { interestDeadlineAt });
    return response.data.data.requirement;
  },

  /**
   * Retrieve deterministic selection results and evaluated candidates
   */
  async getSelectionResults(reqId: string): Promise<SelectionResultsData> {
    const response = await apiClient.get<{
      success: boolean;
      data: SelectionResultsData;
    }>(`/manager/work-requirements/${reqId}/selection-results`);
    return response.data.data;
  },

  /**
   * Manually trigger worker selection for an expired window
   */
  async triggerSelection(reqId: string): Promise<any> {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: any;
    }>(`/manager/work-requirements/${reqId}/trigger-selection`);
    return response.data.data;
  },

  // ─── Worker Portal API Methods ──────────────────────────────────────────

  /**
   * Retrieve open opportunities matching the authenticated worker's category
   */
  async getWorkerOpportunities(): Promise<WorkerOpportunity[]> {
    const response = await apiClient.get<{
      success: boolean;
      data: { opportunities: WorkerOpportunity[] };
    }>('/worker/opportunities');
    return response.data.data.opportunities;
  },

  /**
   * Submit interest in a specific open work requirement
   */
  async expressInterest(requirementId: string): Promise<any> {
    const response = await apiClient.post<{
      success: boolean;
      message: string;
      data: any;
    }>(`/worker/opportunities/${requirementId}/interest`);
    return response.data.data;
  },

  /**
   * Retrieve confirmed work shifts and assignments for authenticated worker
   */
  async getWorkerAssignments(): Promise<WorkerAssignment[]> {
    const response = await apiClient.get<{
      success: boolean;
      data: { assignments: WorkerAssignment[] };
    }>('/worker/assignments');
    return response.data.data.assignments;
  },

  /**
   * Retrieve authenticated worker's current confirmed location
   */
  async getWorkerLocation(): Promise<WorkerLocationResponse | null> {
    const response = await apiClient.get<{
      success: boolean;
      data: { location: WorkerLocationResponse | null };
    }>('/worker/location');
    return response.data.data.location;
  },

  /**
   * Save or update authenticated worker's declared location
   */
  async updateWorkerLocation(
    payload: WorkerLocationPayload
  ): Promise<WorkerLocationResponse> {
    const response = await apiClient.patch<{
      success: boolean;
      message: string;
      data: { location: WorkerLocationResponse };
    }>('/worker/location', payload);
    return response.data.data.location;
  },
};
