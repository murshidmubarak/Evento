import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { AuthState, User, AuthResponse, ApiErrorResponse } from '../../types/auth';
import { apiClient } from '../../services/apiClient';
import { getStoredToken, setStoredToken, removeStoredToken } from '../../utils/localStorage';
import { AxiosError } from 'axios';

const initialState: AuthState = {
  user: null,
  token: getStoredToken(),
  isAuthenticated: !!getStoredToken(),
  isLoading: false, // Start false so ProtectedRoute can dispatch fetchCurrentUser
  error: null,
};

// Async Thunks
export const login = createAsyncThunk<AuthResponse['data'], any, { rejectValue: string }>(
  'auth/login',
  async (credentials, { rejectWithValue }) => {
    try {
      const response = await apiClient.post<AuthResponse>('/auth/login', credentials);
      return response.data.data;
    } catch (err) {
      const error = err as AxiosError<ApiErrorResponse>;
      return rejectWithValue(error.response?.data?.message || 'Login failed');
    }
  }
);

export const fetchCurrentUser = createAsyncThunk<User, void, { rejectValue: string }>(
  'auth/fetchCurrentUser',
  async (_, { rejectWithValue }) => {
    try {
      const response = await apiClient.get<AuthResponse>('/auth/me');
      return response.data.data.user;
    } catch (err) {
      const error = err as AxiosError<ApiErrorResponse>;
      return rejectWithValue(error.response?.data?.message || 'Session expired');
    }
  }
);

export const logout = createAsyncThunk<void, void, { rejectValue: string }>(
  'auth/logout',
  async (_) => {
    try {
      await apiClient.post('/auth/logout');
    } catch (err) {
      console.error('Logout API failed, continuing local logout', err);
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null;
    },
    // Useful for forcing immediate local logout on 401s
    forceLogout: (state) => {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      state.isLoading = false;
      state.error = null;
      removeStoredToken();
    }
  },
  extraReducers: (builder) => {
    builder
      // Login
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload.user;
        if (action.payload.token) {
          state.token = action.payload.token;
          setStoredToken(action.payload.token);
        }
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.error = action.payload || 'Login failed';
      })
      
      // Fetch Current User
      .addCase(fetchCurrentUser.pending, (state) => {
        state.isLoading = true;
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
      })
      .addCase(fetchCurrentUser.rejected, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = false;
        state.user = null;
        state.token = null;
        removeStoredToken();
        if (action.payload) {
            state.error = action.payload;
        }
      })

      // Logout
      .addCase(logout.fulfilled, (state) => {
        state.user = null;
        state.token = null;
        state.isAuthenticated = false;
        state.isLoading = false;
        removeStoredToken();
      });
  },
});

export const { clearError, forceLogout } = authSlice.actions;
export default authSlice.reducer;
