import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const AuthCallback = () => {
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (token) {
      login(token);
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
