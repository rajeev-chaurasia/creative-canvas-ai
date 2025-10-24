import { useEffect } from 'react';

const AuthPopup = () => {
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const token = searchParams.get('token');
    const refreshToken = searchParams.get('refresh_token');

    if (token && window.opener && !window.opener.closed) {
      const payload = { type: 'oauth', token, refresh_token: refreshToken };
      try {
        // Post message to opener (the main app), then close the popup
        const targetOrigin = window.location.origin || '*';
        window.opener.postMessage(payload, targetOrigin);
      } catch (e) {
        // ignore
      }
    }

    // Close after short delay to ensure message delivers
    setTimeout(() => {
      window.close();
    }, 300);
  }, []);

  return <div>Completing sign in...</div>;
};

export default AuthPopup;
