import './LoginPage.css';

const LoginPage = () => {
  const handleLogin = () => {
    // Redirect to the backend's Google auth endpoint
    const base = (import.meta as any).env?.API_PATH || 'http://localhost:8000';
    window.location.href = `${base}/auth/google`;
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
