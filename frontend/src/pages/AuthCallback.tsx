import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { GUEST_STORAGE_KEY } from '../hooks/useGuest';

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
      
  // After login, if a guest session exists, mark pending claim and resume any pending action
      const rawGuest = localStorage.getItem(GUEST_STORAGE_KEY);
      if (rawGuest) {
        try {
          const guest = JSON.parse(rawGuest);
          localStorage.setItem('pending_guest_claim', JSON.stringify({ guest_id: guest.guest_id }));
        } catch {
          // ignore parse errors
        }
      }

      // If user attempted an action that included a projectUuid, resume by redirecting to that canvas
      const pendingActionRaw = localStorage.getItem('pending_action');
      if (pendingActionRaw) {
        try {
          const pending = JSON.parse(pendingActionRaw);
          if (pending?.projectUuid) {
            navigate(`/canvas/${pending.projectUuid}`);
            return;
          }
        } catch { /* ignore */ }
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
