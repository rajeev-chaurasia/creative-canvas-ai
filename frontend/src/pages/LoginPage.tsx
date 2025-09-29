import './LoginPage.css';

const LoginPage = () => {
  const handleLogin = () => {
    // Redirect to the backend's Google auth endpoint
    window.location.href = 'http://localhost:8000/auth/google';
  };

  return (
    <div className="login-hero">
      {/* animated background blobs */}
      <div className="bg-blob blob1" />
      <div className="bg-blob blob2" />
      <div className="bg-blob blob3" />
      <div className="hero-card">
        <h1 className="hero-title">Welcome to Canvas AI</h1>
        <p className="hero-sub">Create, collaborate and iterate on designs in real-time.</p>
        <div className="cta-row">
          <button className="btn-primary" onClick={handleLogin}>Sign In with Google</button>
        </div>
        <small className="hero-note">Works best in Chrome or Edge. Your designs are private by default.</small>
      </div>
      <footer className="hero-footer">No credit card required • Real-time collaboration</footer>
    </div>
  );
};

export default LoginPage;
