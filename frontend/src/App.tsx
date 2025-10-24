import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AuthCallback from './pages/AuthCallback';
import AuthReceive from './pages/AuthReceive';
import AuthPopup from './pages/AuthPopup';
import CanvasPage from './pages/CanvasPage';
import { useAuth } from './hooks/useAuth';
import './App.css';
import { useState, useRef, useEffect } from 'react';

// Hook to react to localStorage changes
function useLocalStorage(key: string) {
  const [value, setValue] = useState(() => localStorage.getItem(key));

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key) {
        setValue(e.newValue);
      }
    };

    const handleLocalChange = () => {
      setValue(localStorage.getItem(key));
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('storage-local-change', handleLocalChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('storage-local-change', handleLocalChange);
    };
  }, [key]);

  return value;
}

// Default user icon component (consistent fallback, not initials)

function Navigation() {
  // Hooks must always be called in the same order
  const location = useLocation();
  const { isAuthenticated, logout, currentUser } = useAuth();
  const guestSessionValue = useLocalStorage('guest_session');
  const hasGuestSession = Boolean(guestSessionValue);

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

  // Hide navigation on canvas page for immersive experience and login page
  if (location.pathname.startsWith('/canvas/') || location.pathname === '/') {
    return null;
  }

  // Only show nav if authenticated OR on dashboard/protected pages with guest session
  if (!isAuthenticated && !hasGuestSession) {
    return null;
  }

  const email = currentUser?.email || '';

  return (
    <>
      <nav className="app-nav">
        <div className="app-nav-inner">
          <div className="app-brand">Canvas AI</div>

          {/* Guest badge when not signed in but guest session exists */}
          {!isAuthenticated && hasGuestSession && (
            <div className="guest-badge" title="You're in guest mode">Guest</div>
          )}

          <div style={{ flex: 1 }} />

          {/* Profile menu - only show for authenticated users */}
          {isAuthenticated && (
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
          )}
        </div>
      </nav>
    </>
  );
}

function App() {
  const { isAuthenticated } = useAuth();
  const guestSessionValue = useLocalStorage('guest_session');
  const hasGuestSession = Boolean(guestSessionValue);

  // Helper to check guest session at render time
  const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    if (!isAuthenticated && !hasGuestSession) {
      return <Navigate to="/" />;
    }
    return children;
  };

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
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } 
          />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/auth/receive" element={<AuthReceive />} />
          <Route path="/auth/popup" element={<AuthPopup />} />
          <Route 
            path="/canvas/:uuid" 
            element={
              <ProtectedRoute>
                <CanvasPage />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
