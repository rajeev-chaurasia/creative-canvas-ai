import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AuthCallback from './pages/AuthCallback';
import CanvasPage from './pages/CanvasPage';
import { useAuth } from './hooks/useAuth';
import './App.css';
import { useState, useRef, useEffect } from 'react';

// Default user icon component (consistent fallback, not initials)

function Navigation() {
  // Hooks must always be called in the same order
  const location = useLocation();
  const { isAuthenticated, logout, currentUser } = useAuth();

  // Profile menu open/close state for click/tap behavior
  const [menuOpen, setMenuOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (e.target instanceof Node && !rootRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', handleDocClick);
    return () => document.removeEventListener('click', handleDocClick);
  }, []);

  // Hide navigation on canvas page for immersive experience
  if (location.pathname.startsWith('/canvas/')) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  const email = currentUser?.email || '';

  return (
    <>
      <nav className="app-nav">
        <div className="app-nav-inner">
          <div className="app-brand">Canvas AI</div>

          <div style={{ flex: 1 }} />

          {/* Profile menu - hover to show email and sign out */}
          <div style={{ position: 'relative' }} className={`profile-menu-root ${menuOpen ? 'open' : ''}`} ref={rootRef}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => setMenuOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="profile-button"
                title="Profile"
              >
                <span className="profile-icon-glyph" aria-hidden>👤</span>
              </button>
            </div>
            <div className="profile-dropdown">
              <div className="user-email">{email}</div>
              <button onClick={() => { setMenuOpen(false); logout(); }}>
                🚪 Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>
    </>
  );
}

function App() {
  const { isAuthenticated } = useAuth();

  return (
    <Router>
      <div style={{ width: '100%', minHeight: '100vh' }}>
        <Navigation />

        <Routes>
          <Route 
            path="/" 
            element={isAuthenticated ? <Navigate to="/dashboard" /> : <LoginPage />} 
          />
          <Route 
            path="/dashboard" 
            element={isAuthenticated ? <DashboardPage /> : <Navigate to="/" />} 
          />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route 
            path="/canvas/:uuid" 
            element={isAuthenticated ? <CanvasPage /> : <Navigate to="/" />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
