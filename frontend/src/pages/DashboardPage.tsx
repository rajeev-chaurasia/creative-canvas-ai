import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';
import './DashboardPage.css';

interface Project {
  id: number;
  uuid: string;
  title: string;
  created_at: string;
  updated_at: string;
  canvas_state?: any;
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

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const response = await apiClient.get('/api/projects');
      setOwnedProjects(response.data.owned || []);
      setSharedProjects(response.data.shared || []);
    } catch (error) {
      console.error('Failed to fetch projects', error);
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
      console.log('📝 Creating project with data:', projectData);
      
      const response = await apiClient.post('/api/projects', projectData);
      console.log('✅ Project created:', response.data);
      
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
      await apiClient.delete(`/api/projects/${projectUuid}`);
      setOwnedProjects(ownedProjects.filter(p => p.uuid !== projectUuid));
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
      const project = [...ownedProjects, ...sharedProjects].find(p => p.uuid === projectUuid);
      if (!project) return;

      await apiClient.put(`/api/projects/${projectUuid}`, {
        title: editingName.trim(),
        canvas_state: project.canvas_state
      });
      
      setOwnedProjects(ownedProjects.map(p => 
        p.uuid === projectUuid ? { ...p, title: editingName.trim() } : p
      ));
      setSharedProjects(sharedProjects.map(p => 
        p.uuid === projectUuid ? { ...p, title: editingName.trim() } : p
      ));
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
