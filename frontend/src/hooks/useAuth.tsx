import { useState, createContext, useContext, useEffect, type ReactNode } from 'react';
import axios from 'axios';

interface AuthContextType {
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(!!localStorage.getItem('token'));

  const login = (token: string) => {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refresh_token');
    setIsAuthenticated(false);
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
          
          const response = await axios.post('http://localhost:8000/auth/refresh', null, {
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

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
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
