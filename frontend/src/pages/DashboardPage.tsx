import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../services/api';

interface Project {
  id: number;
  title: string;
  updated_at: string;
}

const DashboardPage = () => {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await apiClient.get('/projects');
        setProjects(response.data);
      } catch (error) {
        console.error('Failed to fetch projects', error);
      }
    };

    fetchProjects();
  }, []);

  const handleCreateProject = async () => {
    try {
      const response = await apiClient.post('/projects', { title: 'New Project' });
      // Redirect to the new project's canvas
      window.location.href = `/canvas/${response.data.id}`;
    } catch (error) {
      console.error('Failed to create project', error);
    }
  };

  return (
    <div>
      <h1>Your Projects</h1>
      <button onClick={handleCreateProject}>Create New Project</button>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
        {projects.map((project) => (
          <div key={project.id} style={{ border: '1px solid #ccc', padding: '1rem' }}>
            <Link to={`/canvas/${project.id}`}>
              <h2>{project.title}</h2>
              <p>Last modified: {new Date(project.updated_at).toLocaleDateString()}</p>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
};

export default DashboardPage;
