export type UserRole = 'admin' | 'client' | 'event_manager' | 'worker';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  profileImage?: string;
  role: UserRole;
  workerType?: string;
  businessId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: User;
    token?: string;
  };
}

export interface ApiErrorResponse {
  success: boolean;
  message: string;
  error?: any;
}
