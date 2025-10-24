import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import useGuest from '../hooks/useGuest';
import './DashboardPage.css';


interface Project {
  id: number;
  uuid: string;
  title: string;
  created_at: string;
  updated_at: string;
  canvas_state?: unknown;
  user_role?: string;
}

const DashboardPage = () => {
  const [ownedProjects, setOwnedProjects] = useState<Project[]>([]);
  const [sharedProjects, setSharedProjects] = useState<Project[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const navigate = useNavigate();
  const { getDraft, clearDraft } = useGuest(Boolean(localStorage.getItem('token')));
  const [guestProjects, setGuestProjects] = useState<Project[]>([]);
  const [showPendingClaimModal, setShowPendingClaimModal] = useState(false);

  // If a guest session exists, fetch server-side guest projects to allow claiming
  useEffect(() => {
    const raw = localStorage.getItem('guest_session');
    if (!raw) return;
    (async () => {
      try {
        // Guest header will be attached automatically by the axios interceptor when appropriate
        const resp = await apiClient.get('/guest/projects');
        setGuestProjects(resp.data || []);
        
        // Auto-claim modal: if user just signed in (has token + guest session), show modal auto
        const token = localStorage.getItem('token');
        const justSignedIn = localStorage.getItem('just_signed_in');
        if ((token || justSignedIn) && resp.data && resp.data.length > 0) {
          // User signed in and has guest projects → auto-show claim modal
          setShowPendingClaimModal(true);
          // Clear the flag now that we've shown the modal
          localStorage.removeItem('just_signed_in');
        }
      } catch (e) {
        console.warn('Failed to fetch guest projects', e);
      }
    })();
  }, []);

  // intentionally run once on mount
  const tryRestoreGuestDraft = useCallback(async () => {
    const draft = getDraft();
    if (!draft) return;

    // Show a browser confirm for MVP restore flow
    const restore = window.confirm(`We found a local draft (saved as "${draft.title}").\n\nCreate a new project from this draft now?`);
    if (!restore) {
      // user declined; keep draft in localStorage
      return;
    }

    try {
      const payload = { title: draft.title || 'New Project', canvas_state: { objects: draft.objects } };
      // Check if authenticated (has token) - if so, use authenticated endpoint
      // even if guest_session exists (kept for claiming)
      const token = localStorage.getItem('token');
      const endpoint = token ? '/api/projects' : '/guest/projects';
      const resp = await apiClient.post(endpoint, payload);
      // Clear the draft only after successful creation
      clearDraft();
      navigate(`/canvas/${resp.data.uuid}`);
    } catch (error) {
      console.error('Failed to restore guest draft:', error);
      alert('Failed to create project from draft. Please try again.');
    }
  }, [getDraft, clearDraft, navigate]);

  useEffect(() => {
    // Only fetch authenticated projects if authenticated (has token)
    const token = localStorage.getItem('token');
    
    if (token) {
      fetchProjects();
    }
    
    // If user just signed in and a guest draft exists, prompt to restore (only once)
    tryRestoreGuestDraft();
  }, []);

  // Listen for OAuth messages from popup
  useEffect(() => {
    const handleOAuthMessage = (e: MessageEvent) => {
      try {
        if (e.origin !== window.location.origin) return;
        const data = e.data as any;
        if (data?.type === 'oauth' && data.token) {
          // Store the token and refresh_token
          localStorage.setItem('token', data.token);
          if (data.refresh_token) localStorage.setItem('refresh_token', data.refresh_token);
          
          // Mark that we just signed in so the dashboard knows to fetch guest projects and show claim modal
          localStorage.setItem('just_signed_in', 'true');
          
          // Keep guest_session and guest_project_map so auto-claim can work
          // Only clear the local draft (canvas-guest-draft) since we're authenticated now
          localStorage.removeItem('canvas-guest-draft');
          
          // Force page reload to refresh auth state and fetch authenticated projects
          window.location.reload();
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, []);

  // Render banner when in guest session
  const GuestBanner = () => {
    const raw = localStorage.getItem('guest_session');
    if (!raw) return null;
    
    const handleSignIn = () => {
      // Open OAuth popup to backend
      const meta = import.meta as unknown as { env?: { API_PATH?: string } };
      const base = meta.env?.API_PATH || 'http://localhost:8000';
      const url = `${base}/auth/google?popup=1`;
      const width = 500;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(url, 'oauth-popup', `width=${width},height=${height},left=${left},top=${top}`);
      // Fallback: if popup blocked, redirect in same tab
      if (!popup) {
        window.location.href = url;
      }
    };
    
    return (
      <div className="guest-banner">
        <div style={{ flex: 1 }}>
          You are in guest mode — your drafts are saved locally and can be claimed after signing in.
        </div>
        <button 
          onClick={handleSignIn}
          style={{
            padding: '8px 16px',
            backgroundColor: '#007acc',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            marginLeft: '16px'
          }}
        >
          Sign In
        </button>
      </div>
    );
  };





  const fetchProjects = async () => {
    try {
      const response = await apiClient.get('/api/projects');
      setOwnedProjects(response.data.owned || []);
      setSharedProjects(response.data.shared || []);
    } catch (error) {
      // 401 means user is not authenticated; skip for guest sessions
      if (error instanceof Error && error.message.includes('401')) {
        setOwnedProjects([]);
        setSharedProjects([]);
      } else {
        console.error('Failed to fetch projects', error);
      }
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      alert('Please enter a project name');
      return;
    }

    try {
      const projectData = { 
        title: newProjectName.trim() 
      };
      
      // Check if authenticated (has token) - if so, use authenticated endpoint
      // even if guest_session exists (kept for claiming)
      const token = localStorage.getItem('token');
      
      // Use appropriate endpoint based on auth status
      const endpoint = token ? '/api/projects' : '/guest/projects';
      const response = await apiClient.post(endpoint, projectData);
      
      setShowCreateModal(false);
      setNewProjectName('');
      navigate(`/canvas/${response.data.uuid}`);
    } catch (error) {
      console.error('Failed to create project', error);
      alert('Failed to create project');
    }
  };

  const handleDeleteProject = async (projectUuid: string, projectName: string) => {
    if (!confirm(`Delete "${projectName}"? This cannot be undone.`)) {
      return;
    }

    try {
      // Check if authenticated (has token) - if so, use authenticated endpoint
      // even if guest_session exists (kept for claiming)
      const token = localStorage.getItem('token');
      const isGuest = !token;
      
      // Use appropriate endpoint based on auth status
      const endpoint = isGuest ? `/guest/projects/${projectUuid}` : `/api/projects/${projectUuid}`;
      await apiClient.delete(endpoint);
      
      // Update the appropriate project list
      if (isGuest) {
        setGuestProjects(guestProjects.filter(p => p.uuid !== projectUuid));
      } else {
        setOwnedProjects(ownedProjects.filter(p => p.uuid !== projectUuid));
      }
    } catch (error) {
      console.error('Failed to delete project', error);
      alert('Failed to delete project');
    }
  };

  const handleRenameProject = async (projectUuid: string) => {
    if (!editingName.trim()) {
      alert('Project name cannot be empty');
      return;
    }

    try {
      // Check if authenticated (has token) - if so, use authenticated endpoint
      // even if guest_session exists (kept for claiming)
      const token = localStorage.getItem('token');
      const isGuest = !token;
      
      // Find the project from appropriate list
      let project = null;
      if (isGuest) {
        project = guestProjects.find(p => p.uuid === projectUuid);
      } else {
        project = [...ownedProjects, ...sharedProjects].find(p => p.uuid === projectUuid);
      }
      
      if (!project) return;

      // Use appropriate endpoint based on auth status
      const endpoint = isGuest ? `/guest/projects/${projectUuid}` : `/api/projects/${projectUuid}`;
      const method = isGuest ? 'patch' : 'put';
      
      await apiClient[method](endpoint, {
        title: editingName.trim(),
        canvas_state: project.canvas_state
      });
      
      // Update the appropriate project list
      if (isGuest) {
        setGuestProjects(guestProjects.map(p => 
          p.uuid === projectUuid ? { ...p, title: editingName.trim() } : p
        ));
      } else {
        setOwnedProjects(ownedProjects.map(p => 
          p.uuid === projectUuid ? { ...p, title: editingName.trim() } : p
        ));
        setSharedProjects(sharedProjects.map(p => 
          p.uuid === projectUuid ? { ...p, title: editingName.trim() } : p
        ));
      }
      
      setEditingProject(null);
      setEditingName('');
    } catch (error) {
      console.error('Failed to rename project', error);
      alert('Failed to rename project');
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  return (
    <div className="dashboard-root">
      {/* Guest mode banner */}
      <GuestBanner />
      <div className="dashboard-container">
        {/* Header Section */}
        <div className="dashboard-header">
          <h1 className="dashboard-title">Your Projects</h1>
          <p className="dashboard-subtitle">Create and manage your design projects</p>
        </div>

        {/* Create New Project Card */}
        <div style={{ marginBottom: 'var(--space-2xl)' }}>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="create-project-card"
          >
            <span className="create-project-icon">✨</span>
            <span className="create-project-text">Create New Project</span>
          </button>
        </div>

        {/* My Projects Section */}
        {guestProjects.length > 0 && (
          <div style={{ marginBottom: 'var(--space-2xl)' }}>
            <div className="section-header">
              <h2>Guest drafts</h2>
              {/* Only show Claim button if user is authenticated */}
              {Boolean(localStorage.getItem('token')) && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" onClick={async () => {
                    const raw = localStorage.getItem('guest_session');
                    if (!raw) return;
                    const session = JSON.parse(raw);
                    try {
                      await apiClient.post('/guest/claim', { guest_id: session.guest_id, project_uuids: undefined });
                      localStorage.removeItem('guest_session');
                      localStorage.removeItem('canvas-guest-draft');
                      localStorage.removeItem('guest_project_map');
                      // Refresh
                      fetchProjects();
                      setGuestProjects([]);
                      alert('Claimed guest projects into your account');
                    } catch (e) {
                      console.error('Failed to claim guest projects', e);
                      alert('Failed to claim guest projects');
                    }
                  }}>Claim all</button>
                </div>
              )}
            </div>
            <div className="projects-grid">
              {guestProjects.map((project) => (
                <div key={project.uuid} className="project-card">
                  <div className="project-body">
                    <div className="project-title">{project.title || 'Untitled'}</div>
                    <div className="project-meta">Saved as guest • {formatDate(project.created_at)}</div>
                    <div style={{ marginTop: '8px' }}>
                      {/* Only show Claim button if user is authenticated */}
                      {Boolean(localStorage.getItem('token')) ? (
                        <button className="btn-primary" onClick={async () => {
                          try {
                            const raw = localStorage.getItem('guest_session');
                            if (!raw) return;
                            const session = JSON.parse(raw);
                            await apiClient.post('/guest/claim', { guest_id: session.guest_id, project_uuids: [project.uuid] });
                            // remove from list
                            setGuestProjects(guestProjects.filter(p => p.uuid !== project.uuid));
                            fetchProjects();
                            alert('Project claimed');
                          } catch (e) {
                            console.error('Failed to claim project', e);
                            alert('Failed to claim project');
                          }
                        }}>Claim</button>
                      ) : (
                        <button 
                          style={{
                            padding: '6px 12px',
                            backgroundColor: '#666',
                            color: '#999',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'not-allowed',
                            fontSize: '13px',
                            fontWeight: 600
                          }}
                          disabled
                          title="Sign in to claim this project"
                        >
                          Sign in to claim
                        </button>
                      )}
                      <button style={{ marginLeft: '8px' }} onClick={() => navigate(`/canvas/${project.uuid}`)}>Open</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pending claim modal */}
        {showPendingClaimModal && (
          <div className="modal-overlay" onClick={() => setShowPendingClaimModal(false)}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
              <h3>Claim your guest projects</h3>
              <p>We found projects from a recent guest session. Would you like to save them to your account?</p>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {guestProjects.map(p => (
                  <div key={p.uuid} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                    <div>
                      <strong>{p.title || 'Untitled'}</strong>
                      <div style={{ fontSize: '12px', color: '#666' }}>{formatDate(p.created_at)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-primary" onClick={async () => {
                        try {
                          const raw = localStorage.getItem('guest_session');
                          if (!raw) return;
                          const session = JSON.parse(raw);
                          await apiClient.post('/guest/claim', { guest_id: session.guest_id, project_uuids: [p.uuid] });
                          setGuestProjects(guestProjects.filter(x => x.uuid !== p.uuid));
                          fetchProjects();
                        } catch (err) { console.error(err); alert('Failed to claim project'); }
                      }}>Claim</button>
                      <button onClick={() => setShowPendingClaimModal(false)}>Close</button>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '12px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button className="btn-primary" onClick={async () => {
                  try {
                    const raw = localStorage.getItem('guest_session');
                    if (!raw) return;
                    const session = JSON.parse(raw);
                    await apiClient.post('/guest/claim', { guest_id: session.guest_id, project_uuids: undefined });
                    localStorage.removeItem('pending_guest_claim');
                    localStorage.removeItem('guest_session');
                    localStorage.removeItem('canvas-guest-draft');
                    localStorage.removeItem('guest_project_map');
                    setGuestProjects([]);
                    fetchProjects();
                    setShowPendingClaimModal(false);
                    alert('Claimed all guest projects');
                  } catch (err) { console.error(err); alert('Failed to claim guest projects'); }
                }}>Claim all</button>
                <button onClick={() => { localStorage.removeItem('pending_guest_claim'); setShowPendingClaimModal(false); }}>Dismiss</button>
              </div>
            </div>
          </div>
        )}
        {ownedProjects.length > 0 && (
          <div style={{ marginBottom: 'var(--space-2xl)' }}>
            <div className="section-header">
              <h2>📁 My Projects</h2>
            </div>
            <div className="projects-grid">
              {ownedProjects.map((project) => (
                <div key={project.uuid} className="project-card">
                  {/* Canvas Preview */}
                  <Link to={`/canvas/${project.uuid}`} style={{ textDecoration: 'none' }}>
                    <div className="project-preview">
                      <span className="project-preview-icon">🎨</span>
                      <div className="preview-open-label">Click to open</div>
                    </div>
                  </Link>

                  {/* Project Info */}
                  <div className="project-body">
                    {/* Title - Editable */}
                    {editingProject === project.uuid ? (
                      <div style={{ marginBottom: 'var(--space-md)' }}>
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') handleRenameProject(project.uuid);
                            if (e.key === 'Escape') {
                              setEditingProject(null);
                              setEditingName('');
                            }
                          }}
                          autoFocus
                          className="modal-input"
                        />
                        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-sm)' }}>
                          <button onClick={() => handleRenameProject(project.uuid)} className="btn-primary">Save</button>
                          <button onClick={() => { setEditingProject(null); setEditingName(''); }} className="btn-danger">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <h3 onClick={() => { setEditingProject(project.uuid); setEditingName(project.title); }} className="project-title" title="Click to rename">
                        {project.title}
                      </h3>
                    )}

                    {/* Dates */}
                    <div className="project-meta">
                      <div>📅 Created: {formatDate(project.created_at)}</div>
                      <div>🔄 Modified: {formatDate(project.updated_at)}</div>
                    </div>

                    {/* Actions */}
                    <div className="actions-row">
                      <Link to={`/canvas/${project.uuid}`} className="btn-primary">Open</Link>
                      <button onClick={() => handleDeleteProject(project.uuid, project.title)} className="btn-danger">Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shared with me Section */}
        {sharedProjects.length > 0 && (
          <div style={{ marginBottom: 'var(--space-2xl)' }}>
            <div className="section-header">
              <h2>📤 Shared with me</h2>
            </div>
            <div className="projects-grid">
              {sharedProjects.map((project) => (
                <div key={project.uuid} className="project-card">
                  {/* Role Badge */}
                  <div className={`role-badge ${project.user_role}`}>
                    {project.user_role}
                  </div>

                  {/* Canvas Preview */}
                  <Link to={`/canvas/${project.uuid}`} style={{ textDecoration: 'none' }}>
                    <div className="project-preview">
                      <span className="project-preview-icon">🎨</span>
                      <div className="preview-open-label">Click to open</div>
                    </div>
                  </Link>

                  {/* Project Info */}
                  <div className="project-body">
                    <h3 className="project-title">{project.title}</h3>

                    {/* Dates */}
                    <div className="project-meta">
                      <div>📅 Created: {formatDate(project.created_at)}</div>
                      <div>🔄 Modified: {formatDate(project.updated_at)}</div>
                    </div>

                    {/* Actions */}
                    <Link to={`/canvas/${project.uuid}`} className="btn-primary" style={{ display: 'block', textAlign: 'center' }}>
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {ownedProjects.length === 0 && sharedProjects.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-text">No projects yet. Create your first project to get started!</p>
          </div>
        )}

        {/* Create Project Modal */}
        {showCreateModal && (
          <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
            <div className="modal-container" onClick={(e) => e.stopPropagation()}>
              <h2 className="modal-title">Create New Project</h2>
              <input
                type="text"
                placeholder="Enter project name..."
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') handleCreateProject();
                }}
                autoFocus
                className="modal-input"
              />
              <div className="modal-actions">
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewProjectName('');
                  }}
                  className="modal-button modal-button-cancel"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateProject}
                  className="modal-button modal-button-primary"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
