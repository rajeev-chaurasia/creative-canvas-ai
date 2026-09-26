import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AuthCallback from './pages/AuthCallback';
import CanvasPage from './pages/CanvasPage';
import { useAuth } from './hooks/useAuth';
import './App.css';

function App() {
  const { isAuthenticated, logout } = useAuth();

  return (
    <Router>
      <div>
        {isAuthenticated && (
          <nav>
            <ul>
              <li>
                <Link to="/dashboard">Dashboard</Link>
              </li>
              <li>
                <button onClick={logout}>Sign Out</button>
              </li>
            </ul>
          </nav>
        )}

        <hr />

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
            path="/canvas/:projectId" 
            element={isAuthenticated ? <CanvasPage /> : <Navigate to="/" />} 
          />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
