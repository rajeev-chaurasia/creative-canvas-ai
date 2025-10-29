import axios from 'axios';
import type { AxiosError, AxiosRequestConfig, AxiosRequestHeaders } from 'axios';

// Read API base from env. Vite exposes VITE_* vars automatically
export const API_BASE = import.meta.env.VITE_API_PATH || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE,
});

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
type QueueItem = { resolve: (token: string) => void; reject: (err: unknown) => void };
let failedQueue: QueueItem[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token as string);
    }
  });

  failedQueue = [];
};

// Request interceptor - add token to requests
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      const headers = config.headers as AxiosRequestHeaders | undefined;
      if (headers) headers.Authorization = `Bearer ${token}`;
      else config.headers = { Authorization: `Bearer ${token}` } as unknown as AxiosRequestHeaders;
    }
    // Attach guest-id header automatically for guest endpoints when a guest session exists
    try {
      const raw = localStorage.getItem('guest_session');
      if (raw) {
        const session = JSON.parse(raw);
        const guestId = session?.guest_id;
        if (guestId) {
          const url = (config.url || '').toString();
          // If this request targets a guest route, attach the header
          if (url.startsWith('/guest') || url.includes('/guest/')) {
            const headers = config.headers as AxiosRequestHeaders | undefined;
            if (headers) headers['guest-id'] = guestId as string;
            else config.headers = { 'guest-id': guestId } as unknown as AxiosRequestHeaders;
          }
        }
      }
    } catch (e) {
      // ignore JSON parse errors
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle token expiry
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: unknown) => {
    if (!axios.isAxiosError(error)) return Promise.reject(error);
    const axiosErr = error as AxiosError;
    const originalRequest = axiosErr.config as AxiosRequestConfig & { _retry?: boolean };

    // If error is 401 and we haven't tried to refresh yet
    if (axiosErr.response?.status === 401 && !originalRequest._retry) {
      // Check if user is guest (has guest_session but no token)
      const hasGuestSession = Boolean(localStorage.getItem('guest_session'));
      const hasToken = Boolean(localStorage.getItem('token'));
      
      // If guest session exists, don't try to refresh - just reject and let caller handle
      if (hasGuestSession && !hasToken) {
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            const headers = originalRequest.headers as AxiosRequestHeaders | undefined;
            if (headers) headers.Authorization = `Bearer ${token}`;
            else originalRequest.headers = { Authorization: `Bearer ${token}` } as unknown as AxiosRequestHeaders;
            return apiClient(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        // No refresh token, logout
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/';
        return Promise.reject(error);
      }

      try {
        // Call refresh endpoint
        const response = await axios.post(`${API_BASE}/auth/refresh`, null, {
          params: { refresh_token: refreshToken }
        });

        const { access_token } = response.data;

        // Store new token
        localStorage.setItem('token', access_token);

        // Notify WebSocket to reconnect with new token
        window.dispatchEvent(new Event('tokenRefreshed'));

        // Update default header
  apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
    if (originalRequest.headers) {
    const headers = originalRequest.headers as AxiosRequestHeaders | undefined;
    if (headers) headers.Authorization = `Bearer ${access_token}`;
    else originalRequest.headers = { Authorization: `Bearer ${access_token}` } as unknown as AxiosRequestHeaders;
  }

        // Process queued requests
        processQueue(null, access_token);

        // Retry original request
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout
        processQueue(refreshError, null);
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
