import React, { useState, useEffect, useRef } from 'react';
import apiClient from '../services/api';
import './ShareModal.css';

interface ShareModalProps {
  projectUuid: string;
  projectTitle: string;
  onClose: () => void;
}

interface ShareUser {
  user_id: number;
  name: string;
  email: string;
  role: string;
  invited_at: string;
  accepted_at?: string;
}

interface PendingInvite {
  email: string;
  role: string;
  invited_at: string;
  expires_at: string;
}

const ShareModal: React.FC<ShareModalProps> = ({ projectUuid, projectTitle, onClose }) => {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [users, setUsers] = useState<ShareUser[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // remember opener so we can restore focus when modal closes
    openerRef.current = document.activeElement as HTMLElement | null;
    loadShares();
    setShareLink(`${window.location.origin}/canvas/${projectUuid}`);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      // focus trap handled elsewhere via keydown listener attached to container
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectUuid]);

  // focus the first focusable element when modal opens and trap focus
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const focusable = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length) {
      focusable[0].focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusableEls = Array.from(container.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )).filter(el => !el.hasAttribute('disabled'));
      if (focusableEls.length === 0) return;
      const first = focusableEls[0];
      const last = focusableEls[focusableEls.length - 1];

      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    return () => container.removeEventListener('keydown', handleKeyDown);
  }, []);

  const loadShares = async () => {
    try {
      const response = await apiClient.get(`/api/projects/${projectUuid}/shares`);
      setUsers(response.data.users || []);
      setPendingInvites(response.data.pending_invites || []);
    } catch (error) {
      console.error('Failed to load shares', error);
    }
  };

  const handleShare = async () => {
    if (!email.trim()) {
      alert('Please enter an email address');
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.post(`/api/projects/${projectUuid}/share`, {
        email: email.trim(),
        role
      });
      setStatusMessage(response.data.message || 'Invite sent');
      setEmail('');
      loadShares();
    } catch (error: any) {
      setStatusMessage(error.response?.data?.detail || 'Failed to share project');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    // restore focus to opener after modal closes
    try {
      onClose();
    } finally {
      // schedule focus restore after unmount
      setTimeout(() => {
        if (openerRef.current && typeof openerRef.current.focus === 'function') {
          openerRef.current.focus();
        }
      }, 0);
    }
  };

  const handleRemoveUser = async (userId: number, userName: string) => {
    if (!confirm(`Remove ${userName} from this project?`)) return;

    try {
      await apiClient.delete(`/api/projects/${projectUuid}/shares/${userId}`);
      setStatusMessage('User removed successfully');
      loadShares();
    } catch (error: any) {
      setStatusMessage(error.response?.data?.detail || 'Failed to remove user');
    }
  };

  const handleChangeRole = async (userId: number, newRole: string) => {
    try {
      await apiClient.patch(`/api/projects/${projectUuid}/shares/${userId}`, {
        role: newRole
      });
  setStatusMessage('Role updated successfully');
  loadShares();
    } catch (error: any) {
      setStatusMessage(error.response?.data?.detail || 'Failed to update role');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    setStatusMessage('Link copied to clipboard!');
  };

  return (
    <div
      className="share-modal-overlay"
      onClick={handleClose}
    >
      <div
        className="share-modal-container"
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
      >
        {/* Header */}
        <div className="share-modal-header" role="dialog" aria-labelledby="share-title" aria-modal="true">
          <h2 id="share-title" className="share-modal-title">
            Share "{projectTitle}"
          </h2>
          <button
            onClick={onClose}
            className="share-modal-close"
          >
            ×
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className="share-status" role="status">{statusMessage}</div>
        )}

        {/* Share Link */}
        <div className="share-section">
          <label className="share-label">
            🔗 Share Link
          </label>
          <div className="share-input-group">
            <input
              type="text"
              value={shareLink}
              readOnly
              className="share-input"
            />
            <button
              onClick={handleCopyLink}
              className="share-button-primary"
            >
              📋 Copy
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="share-divider" />

        {/* Email Invite */}
        <div className="share-section">
          <label className="share-label">
            📧 Invite by Email
          </label>
          <div className="share-input-group share-input-group--spaced">
            <input
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleShare();
              }}
              className="share-input"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
              className="share-select"
            >
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button
              onClick={handleShare}
              disabled={loading}
              className="share-button-primary"
            >
              {loading ? '...' : 'Invite'}
            </button>
          </div>
        </div>

        {/* People with Access */}
        <div>
          <h3 className="share-people-title">👥 People with access</h3>
          <div className="share-user-list">
            {users.map((user) => (
              <div key={user.user_id} className="share-user-item">
                <div style={{ flex: 1 }}>
                  <div className="share-user-name">{user.name || user.email.split('@')[0]}</div>
                  <div className="share-user-email">{user.email}</div>
                </div>
                {user.role === 'owner' ? (
                  <div className="share-owner-badge">Owner</div>
                ) : (
                  <div className="share-user-actions">
                    <select
                      value={user.role}
                      onChange={(e) => handleChangeRole(user.user_id, e.target.value)}
                      className="share-user-role-select"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={() => handleRemoveUser(user.user_id, user.name || user.email)}
                      className="share-remove-button"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Pending Invites */}
            {pendingInvites.map((invite, idx) => (
              <div key={idx} className="share-pending-item">
                <div style={{ flex: 1 }}>
                  <div className="share-user-name">{invite.email}</div>
                  <div className="share-user-email">Pending invitation</div>
                </div>
                <div className="share-pending-badge">{invite.role}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="share-footer">
          <button onClick={handleClose} className="share-done-button">Done</button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
