-- Migration: Add UUID and Sharing System
-- Date: 2025-10-17
-- Description: Add UUID to projects, create project_shares and share_invites tables

-- Step 1: Add UUID column to projects table
ALTER TABLE projects 
ADD COLUMN uuid VARCHAR(36) UNIQUE NOT NULL DEFAULT (UUID());

-- Add index on uuid for fast lookups
CREATE INDEX idx_projects_uuid ON projects(uuid);

-- Step 2: Create project_shares table
CREATE TABLE project_shares (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('viewer', 'editor', 'owner') DEFAULT 'viewer',
    invited_by INT NOT NULL,
    invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_share (project_id, user_id),
    INDEX idx_user_projects (user_id),
    INDEX idx_project_users (project_id)
);

-- Step 3: Create share_invites table
CREATE TABLE share_invites (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    role ENUM('viewer', 'editor') DEFAULT 'viewer',
    token VARCHAR(64) UNIQUE NOT NULL,
    invited_by INT NOT NULL,
    invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    accepted BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_email (email),
    INDEX idx_token (token),
    INDEX idx_project_invites (project_id)
);

-- Step 4: Create project_activities table (audit log)
CREATE TABLE project_activities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    action ENUM('created', 'edited', 'shared', 'deleted', 'renamed', 'joined', 'left') NOT NULL,
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_project_activity (project_id, created_at),
    INDEX idx_user_activity (user_id, created_at)
);

-- Step 5: Generate UUIDs for existing projects
-- (This will happen automatically with the DEFAULT clause above)

-- Verification queries (commented out, use for testing)
-- SELECT COUNT(*) FROM projects WHERE uuid IS NOT NULL;
-- SELECT * FROM project_shares LIMIT 5;
-- SELECT * FROM share_invites LIMIT 5;
-- SELECT * FROM project_activities LIMIT 5;
