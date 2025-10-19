import { useState, createContext, useContext, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import { API_BASE } from '../services/api';

interface UserInfo {
  email?: string;
  name?: string;
  avatarUrl?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  currentUser: UserInfo | null;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem('token'));
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(null);

  const login = (token: string) => {
    localStorage.setItem('token', token);
    // Try to decode token payload for user info
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const user: UserInfo = {
        email: payload.sub,
        name: payload.name || undefined,
        avatarUrl: payload.picture || undefined,
      };
      setCurrentUser(user);
    } catch (e) {
      setCurrentUser(null);
    }
    setIsAuthenticated(true);
    // Also try to fetch canonical profile from backend
    (async () => {
      try {
        const access = localStorage.getItem('token');
        if (!access) return;
        const resp = await axios.get(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${access}` },
        });
        setCurrentUser({
          email: resp.data.email,
          name: resp.data.full_name || undefined,
        });
      } catch (err) {
        // If the request fails, keep the decoded token info as fallback
        console.warn('Could not fetch /auth/me, using token decode fallback');
      }
    })();
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  // Proactive token refresh - refresh 5 minutes before expiry
  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshToken = async () => {
      const token = localStorage.getItem('token');
      const refresh = localStorage.getItem('refresh_token');

      if (!token || !refresh) return;

      try {
        // Decode token to check expiry (without verification)
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresAt = payload.exp * 1000; // Convert to milliseconds
        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;

        // If token expires in less than 5 minutes, refresh it
        if (timeUntilExpiry < 5 * 60 * 1000) {
          console.log('Token expiring soon, refreshing...');
          
          const response = await axios.post(`${API_BASE}/auth/refresh`, null, {
            params: { refresh_token: refresh }
          });

          const { access_token } = response.data;
          localStorage.setItem('token', access_token);
          console.log('Token refreshed successfully');
        }
      } catch (error) {
        console.error('Failed to refresh token:', error);
        // Don't logout here - let the interceptor handle it
      }
    };

    // Check immediately
    refreshToken();

    // Check every minute
    const interval = setInterval(refreshToken, 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // On mount, if token exists but currentUser is empty, try to populate from token
  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;

      // Prefer canonical backend profile
      try {
        const resp = await axios.get(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCurrentUser({
          email: resp.data.email,
          name: resp.data.full_name || undefined,
        });
        setIsAuthenticated(true);
        return;
      } catch (err) {
        // fallback to token decode
      }

      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user = {
          email: payload.sub,
          name: payload.name || undefined,
          avatarUrl: payload.picture || undefined,
        };
        setCurrentUser(user);
        setIsAuthenticated(true);
      } catch (e) {
        // ignore
      }
    };

    init();
  }, []);

  // When token is refreshed elsewhere in the app, re-fetch canonical profile
  useEffect(() => {
    const handler = async () => {
      const token = localStorage.getItem('token');
      if (!token) return;
      try {
        const resp = await axios.get(`${API_BASE}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCurrentUser({
          email: resp.data.email,
          name: resp.data.full_name || undefined,
        });
      } catch (err) {
        console.warn('Failed to refresh currentUser after token refresh');
      }
    };

    window.addEventListener('tokenRefreshed', handler as EventListener);
    return () => window.removeEventListener('tokenRefreshed', handler as EventListener);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, currentUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
