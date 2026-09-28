import axios from 'axios';
import { getStoredToken } from '../utils/localStorage';

// Use standard vite env vars
const baseURL = import.meta.env.VITE_API_URL;

if (!baseURL) {
  throw new Error("VITE_API_URL environment variable is missing.");
}

export const apiClient = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to inject the token
apiClient.interceptors.request.use(
  (config) => {
    const token = getStoredToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to handle global errors like 401 Unauthorized
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Optionally trigger a global logout action here if 401,
    // but typically we let Redux handle the rejection or app-level listeners.
    return Promise.reject(error);
  }
);
