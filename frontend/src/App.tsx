import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AuthCallback from './pages/AuthCallback';
import CanvasPage from './pages/CanvasPage';
import { useAuth } from './hooks/useAuth';
import './App.css';

function Navigation() {
  const { isAuthenticated, logout } = useAuth();
  const location = useLocation();
  
  // Hide navigation on canvas page for immersive experience
  if (location.pathname.startsWith('/canvas/')) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <>
      <nav style={{
        width: '100%',
        backgroundColor: '#2d2d30',
        padding: '12px 5%',
        borderBottom: '1px solid #3e3e42',
        boxSizing: 'border-box'
      }}>
        <div style={{
          maxWidth: '1600px',
          margin: '0 auto',
          display: 'flex',
          gap: '24px',
          alignItems: 'center'
        }}>
          <Link to="/dashboard" style={{
            color: '#e1e1e1',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500
          }}>Dashboard</Link>
          <button onClick={logout} style={{
            marginLeft: 'auto',
            backgroundColor: '#007acc',
            color: 'white',
            border: 'none',
            padding: '6px 16px',
            borderRadius: '3px',
            cursor: 'pointer',
            fontSize: '13px'
          }}>Sign Out</button>
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
