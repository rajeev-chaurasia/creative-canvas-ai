import './LoginPage.css';
import { useNavigate } from 'react-router-dom';
import useGuest from '../hooks/useGuest';
import { useAuth } from '../hooks/useAuth';
import { useEffect, useRef } from 'react';

const LoginPage = () => {
  const navigate = useNavigate();
  const { ensureGuest } = useGuest(Boolean(localStorage.getItem('token')));
  const { login } = useAuth();
  const popupRef = useRef<Window | null>(null);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      try {
        if (e.origin !== window.location.origin) return;
        const data = e.data as any;
        if (data?.type === 'oauth' && data.token) {
          // login() in useAuth now clears guest_session automatically
          login(data.token);
          if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
          // Redirect to dashboard after a brief delay to allow state to settle
          setTimeout(() => navigate('/dashboard'), 100);
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [login, navigate]);

  const handleLogin = () => {
    // Open auth in a popup and use postMessage to receive tokens securely
    const base = import.meta.env.VITE_API_PATH || 'http://localhost:8000';
    const url = `${base}/auth/google?popup=1`;
    popupRef.current = window.open(url, 'CanvasAIAuth', 'width=500,height=700');
    // Fallback: if popup blocked, redirect in same tab
    if (!popupRef.current) {
      window.location.href = `${base}/auth/google`;
    }
  };

  return (
    <div className="login-hero">
      {/* Animated background blobs */}
      <div className="bg-blob blob1" />
      <div className="bg-blob blob2" />
      <div className="bg-blob blob3" />
      
      <div className="hero-card">
        <h1 className="hero-title">Welcome to Canvas AI</h1>
        <p className="hero-sub">
          Create stunning designs, collaborate in real-time, and bring your ideas to life with AI-powered tools.
        </p>
        <div className="cta-row">
          <button className="btn-primary" onClick={handleLogin}>
            <span>🚀 Sign In with Google</span>
          </button>
          <button className="btn-secondary" onClick={async () => { await ensureGuest(); navigate('/dashboard'); }}>
            Continue as guest
          </button>
        </div>
        <div className="feature-pills">
          <span className="feature-pill">✨ AI-Powered</span>
          <span className="feature-pill">🎨 Intuitive Design</span>
          <span className="feature-pill">👥 Real-time Collab</span>
        </div>
      </div>
      
      <footer className="hero-footer">
        No credit card required • Start creating instantly
      </footer>
    </div>
  );
};

export default LoginPage;
