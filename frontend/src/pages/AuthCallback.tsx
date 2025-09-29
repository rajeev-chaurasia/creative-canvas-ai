import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    // Support both query string and hash fragment (some redirects and SPAs use hash)
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const token = searchParams.get('token') || hashParams.get('token');
    const refreshToken = searchParams.get('refresh_token') || hashParams.get('refresh_token');

    if (token) {
      login(token);
      
      // Store refresh token if provided
      if (refreshToken) {
        localStorage.setItem('refresh_token', refreshToken);
      }
      
      navigate('/dashboard');
    } else {
      // Handle error case
      console.error("Authentication failed: No token received.");
      navigate('/');
    }
  }, [navigate, login]);

  return <div>Loading...</div>;
};

export default AuthCallback;
