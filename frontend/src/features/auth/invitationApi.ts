import { apiClient } from '../../services/apiClient';

export interface InvitationDetails {
  name: string;
  email: string;
  role: string;
  workerType?: string;
}

export interface InvitationDetailsResponse {
  success: boolean;
  message: string;
  data: InvitationDetails;
}

export interface AcceptInvitationPayload {
  token: string;
  password: string;
  confirmPassword?: string;
}

export interface AcceptInvitationResponse {
  success: boolean;
  message: string;
}

export const invitationApi = {
  /**
   * Validate token and fetch invitation details (name, email, role)
   */
  async getInvitationDetails(token: string): Promise<InvitationDetails> {
    const response = await apiClient.get<InvitationDetailsResponse>(`/auth/invitation/${token}`);
    return response.data.data;
  },

  /**
   * Submit new password and accept invitation
   */
  async acceptInvitation(payload: AcceptInvitationPayload): Promise<AcceptInvitationResponse> {
    const response = await apiClient.post<AcceptInvitationResponse>('/auth/accept-invitation', payload);
    return response.data;
  },
};
