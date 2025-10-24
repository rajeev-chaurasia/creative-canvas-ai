import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AuthReceive = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    // Read token from query string or hash
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = searchParams.get('token') || hashParams.get('token');
    const refreshToken = searchParams.get('refresh_token') || hashParams.get('refresh_token');

    if (token) {
      // Store tokens and proceed. Clear the URL via replaceState immediately to avoid leaking tokens in history.
      login(token);
      if (refreshToken) localStorage.setItem('refresh_token', refreshToken);

      // If a pending guest claim exists, keep it for later processing (already used by Dashboard)
      // Clear search params from URL to avoid tokens remaining in history
      try {
        const newUrl = window.location.origin + '/auth/receive';
        window.history.replaceState({}, '', newUrl);
      } catch {
        // ignore
      }

      // Redirect to dashboard
      navigate('/dashboard');
    } else {
      console.error('AuthReceive: No token found in URL.');
      navigate('/');
    }
  }, [login, navigate]);

  return <div>Processing authentication...</div>;
};

export default AuthReceive;
