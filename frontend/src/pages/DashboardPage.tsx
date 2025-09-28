import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../services/api';

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
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#1e1e1e',
      padding: '40px 5%', // Percentage padding for better responsiveness
      maxWidth: '1600px', // Max width for very large screens
      margin: '0 auto' // Center on large screens
    }}>
      {/* Header Section */}
      <div style={{ marginBottom: '48px' }}>
        <h1 style={{ 
          color: '#e1e1e1', 
          fontSize: '32px', 
          fontWeight: 600,
          marginBottom: '8px',
          letterSpacing: '0.5px'
        }}>
          Your Projects
        </h1>
        <p style={{ color: '#888', fontSize: '15px', margin: 0 }}>
          Create and manage your design projects
        </p>
      </div>

      {/* Create New Project Card */}
      <div style={{ marginBottom: '40px' }}>
        <button 
          onClick={() => setShowCreateModal(true)}
          style={{
            width: '100%',
            maxWidth: '600px',
            padding: '24px',
            backgroundColor: '#2d2d30',
            border: '2px dashed #3e3e42',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            transition: 'all 0.2s ease',
            color: '#888'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = '#007acc';
            e.currentTarget.style.backgroundColor = '#252526';
            e.currentTarget.style.color = '#007acc';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = '#3e3e42';
            e.currentTarget.style.backgroundColor = '#2d2d30';
            e.currentTarget.style.color = '#888';
          }}
        >
          <span style={{ fontSize: '24px' }}>+</span>
          <span style={{ fontSize: '15px', fontWeight: 500 }}>Create New Project</span>
        </button>
      </div>

      {/* My Projects Section */}
      {ownedProjects.length > 0 && (
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{ 
            color: '#e1e1e1', 
            fontSize: '20px', 
            fontWeight: 600,
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            📁 My Projects
          </h2>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '24px'
          }}>
            {ownedProjects.map((project) => (
              <div
                key={project.uuid} 
              style={{
                backgroundColor: '#2d2d30',
                borderRadius: '8px',
                border: '1px solid #3e3e42',
                overflow: 'hidden',
                transition: 'all 0.2s ease',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#007acc';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#3e3e42';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              {/* Canvas Preview */}
              <Link to={`/canvas/${project.uuid}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  width: '100%',
                  height: '180px',
                  backgroundColor: '#1e1e1e',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderBottom: '1px solid #3e3e42',
                  position: 'relative'
                }}>
                  {/* Simple preview - will enhance later */}
                  <span style={{ fontSize: '48px', opacity: 0.3 }}>🎨</span>
                  <div style={{
                    position: 'absolute',
                    bottom: '8px',
                    right: '8px',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    color: '#888'
                  }}>
                    Click to open
                  </div>
                </div>
              </Link>

              {/* Project Info */}
              <div style={{ padding: '20px' }}>
                {/* Title - Editable */}
                {editingProject === project.uuid ? (
                  <div style={{ marginBottom: '12px' }}>
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
                      style={{
                        width: '100%',
                        backgroundColor: '#1e1e1e',
                        border: '1px solid #007acc',
                        borderRadius: '4px',
                        padding: '6px 8px',
                        color: '#e1e1e1',
                        fontSize: '16px',
                        fontWeight: 600
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button
                        onClick={() => handleRenameProject(project.uuid)}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: '#007acc',
                          color: 'white',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingProject(null);
                          setEditingName('');
                        }}
                        style={{
                          padding: '4px 12px',
                          backgroundColor: '#3e3e42',
                          color: '#e1e1e1',
                          border: 'none',
                          borderRadius: '3px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <h2 
                    onClick={() => {
                      setEditingProject(project.uuid);
                      setEditingName(project.title);
                    }}
                    style={{ 
                      color: '#e1e1e1', 
                      fontSize: '16px', 
                      fontWeight: 600,
                      marginBottom: '12px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      cursor: 'pointer',
                      padding: '4px 0',
                      borderRadius: '3px'
                    }}
                    title="Click to rename"
                  >
                    {project.title}
                  </h2>
                )}

                {/* Dates */}
                <div style={{ marginBottom: '16px' }}>
                  <p style={{ 
                    color: '#888', 
                    fontSize: '12px', 
                    margin: '0 0 4px 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>📅</span>
                    <span>Created: {formatDate(project.created_at)}</span>
                  </p>
                  <p style={{ 
                    color: '#888', 
                    fontSize: '12px', 
                    margin: 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>🔄</span>
                    <span>Modified: {formatDate(project.updated_at)}</span>
                  </p>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Link 
                    to={`/canvas/${project.uuid}`}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: '#007acc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      textAlign: 'center',
                      textDecoration: 'none',
                      display: 'block'
                    }}
                  >
                    Open
                  </Link>
                  <button
                    onClick={() => handleDeleteProject(project.uuid, project.title)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'transparent',
                      color: '#f44336',
                      border: '1px solid #f44336',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f44336';
                      e.currentTarget.style.color = 'white';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = '#f44336';
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
          </div>
        </div>
      )}

      {/* Shared with me Section */}
      {sharedProjects.length > 0 && (
        <div style={{ marginBottom: '48px' }}>
          <h2 style={{ 
            color: '#e1e1e1', 
            fontSize: '20px', 
            fontWeight: 600,
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            📤 Shared with me
          </h2>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
            gap: '24px'
          }}>
            {sharedProjects.map((project) => (
              <div
                key={project.uuid}
                style={{
                  backgroundColor: '#2d2d30',
                  borderRadius: '8px',
                  border: '1px solid #3e3e42',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  position: 'relative'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#007acc';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.3)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#3e3e42';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Role Badge */}
                <div style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  backgroundColor: project.user_role === 'editor' ? '#4caf50' : '#ff9800',
                  color: 'white',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  zIndex: 10
                }}>
                  {project.user_role}
                </div>

                {/* Canvas Preview */}
                <Link to={`/canvas/${project.uuid}`} style={{ textDecoration: 'none' }}>
                  <div style={{
                    width: '100%',
                    height: '180px',
                    backgroundColor: '#1e1e1e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderBottom: '1px solid #3e3e42',
                    position: 'relative'
                  }}>
                    <span style={{ fontSize: '48px', opacity: 0.3 }}>🎨</span>
                    <div style={{
                      position: 'absolute',
                      bottom: '8px',
                      right: '8px',
                      backgroundColor: 'rgba(0,0,0,0.7)',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      color: '#888'
                    }}>
                      Click to open
                    </div>
                  </div>
                </Link>

                {/* Project Info */}
                <div style={{ padding: '20px' }}>
                  <h2 style={{ 
                    color: '#e1e1e1', 
                    fontSize: '16px', 
                    fontWeight: 600,
                    marginBottom: '12px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {project.title}
                  </h2>

                  {/* Dates */}
                  <div style={{ marginBottom: '16px' }}>
                    <p style={{ 
                      color: '#888', 
                      fontSize: '12px', 
                      margin: '0 0 4px 0',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span>📅</span>
                      <span>Created: {formatDate(project.created_at)}</span>
                    </p>
                    <p style={{ 
                      color: '#888', 
                      fontSize: '12px', 
                      margin: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}>
                      <span>🔄</span>
                      <span>Modified: {formatDate(project.updated_at)}</span>
                    </p>
                  </div>

                  {/* Actions */}
                  <Link 
                    to={`/canvas/${project.uuid}`}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#007acc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      textAlign: 'center',
                      textDecoration: 'none'
                    }}
                  >
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
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          color: '#666'
        }}>
          <p style={{ fontSize: '48px', marginBottom: '16px' }}>📋</p>
          <p style={{ fontSize: '16px' }}>No projects yet. Create your first project to get started!</p>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}
          onClick={() => setShowCreateModal(false)}
        >
          <div 
            style={{
              backgroundColor: '#2d2d30',
              borderRadius: '8px',
              padding: '32px',
              maxWidth: '500px',
              width: '90%',
              border: '1px solid #3e3e42'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ color: '#e1e1e1', marginBottom: '24px', fontSize: '20px' }}>
              Create New Project
            </h2>
            <input
              type="text"
              placeholder="Enter project name..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleCreateProject();
              }}
              autoFocus
              style={{
                width: '100%',
                padding: '12px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e42',
                borderRadius: '4px',
                color: '#e1e1e1',
                fontSize: '14px',
                marginBottom: '24px',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewProjectName('');
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3e3e42',
                  color: '#e1e1e1',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProject}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#007acc',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500
                }}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
