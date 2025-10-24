/* eslint-disable react-refresh/only-export-components */
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

    // Clear guest session now that user is authenticated
    try {
      localStorage.removeItem('guest_session');
      localStorage.removeItem('canvas-guest-draft');
      localStorage.removeItem('client_project_key');
      localStorage.removeItem('guest_project_map');
    } catch {
      // ignore cleanup errors
    }

    // Try to decode token payload for user info
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const user: UserInfo = {
        email: payload.sub,
        name: payload.name || undefined,
        avatarUrl: payload.picture || undefined,
      };
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    }

    setIsAuthenticated(true);

    // Also try to fetch canonical profile from backend (best-effort)
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
      } catch {
        // ignore - keep token-decoded user if available
      }
    })();
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    setIsAuthenticated(false);
    setCurrentUser(null);
  };

  // Proactive token refresh - refresh periodically
  useEffect(() => {
    if (!isAuthenticated) return;

    const refreshToken = async () => {
      const token = localStorage.getItem('token');
      const refresh = localStorage.getItem('refresh_token');
      if (!token || !refresh) return;

      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiresAt = payload.exp * 1000; // ms
        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;

        // If token expires in less than 5 minutes, refresh it
        if (timeUntilExpiry < 5 * 60 * 1000) {
          const response = await axios.post(`${API_BASE}/auth/refresh`, null, {
            params: { refresh_token: refresh }
          });
          const { access_token } = response.data;
          localStorage.setItem('token', access_token);
        }
      } catch {
        // ignore
      }
    };

    refreshToken();
    const interval = setInterval(refreshToken, 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // On mount, try to populate currentUser from backend or token
  useEffect(() => {
    const init = async () => {
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
        setIsAuthenticated(true);
        return;
      } catch {
        // fallback to token decode
      }

      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setCurrentUser({
          email: payload.sub,
          name: payload.name || undefined,
          avatarUrl: payload.picture || undefined,
        });
        setIsAuthenticated(true);
      } catch {
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
      } catch {
        // ignore
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
