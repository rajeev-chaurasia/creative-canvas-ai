import React, { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../services/api';
import axios from 'axios';

function getAxiosErrorDetail(err: unknown): string | null {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as unknown;
  if (data && typeof data === 'object' && 'detail' in (data as Record<string, unknown>)) {
    const detail = (data as Record<string, unknown>)['detail'];
    if (typeof detail === 'string') return detail;
  }
  return null;
}
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
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [publicLink, setPublicLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const loadShares = useCallback(async () => {
    try {
      const response = await apiClient.get(`/api/projects/${projectUuid}/shares`);
      setUsers(response.data.users || []);
      setPendingInvites(response.data.pending_invites || []);
    } catch (error) {
      // If 401, it means user is not authenticated - shouldn't happen if this modal is only shown for authenticated users
      // Just log and continue with empty shares
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        console.warn('Unauthorized to load shares - user may have lost session');
        setUsers([]);
        setPendingInvites([]);
      } else {
        console.error('Failed to load shares', error);
      }
    }
  }, [projectUuid]);

  const handleClose = useCallback(() => {
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
  }, [onClose]);

  useEffect(() => {
    // remember opener so we can restore focus when modal closes
    openerRef.current = document.activeElement as HTMLElement | null;
    loadShares();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      // focus trap handled elsewhere via keydown listener attached to container
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [projectUuid, loadShares, handleClose]);

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
    } catch (error: unknown) {
      // Safely extract message from axios-like error objects without using `any`
      const msg = getAxiosErrorDetail(error);
      setStatusMessage(msg || 'Failed to share project');
    } finally {
      setLoading(false);
    }
  };

  

  const handleRemoveUser = async (userId: number, userName: string) => {
    if (!confirm(`Remove ${userName} from this project?`)) return;

    try {
      await apiClient.delete(`/api/projects/${projectUuid}/shares/${userId}`);
      setStatusMessage('User removed successfully');
      loadShares();
    } catch (error: unknown) {
      const msg = getAxiosErrorDetail(error);
      setStatusMessage(msg || 'Failed to remove user');
    }
  };

  const handleChangeRole = async (userId: number, newRole: string) => {
    try {
      await apiClient.patch(`/api/projects/${projectUuid}/shares/${userId}`, {
        role: newRole
      });
  setStatusMessage('Role updated successfully');
  loadShares();
    } catch (error: unknown) {
      const msg = getAxiosErrorDetail(error);
      setStatusMessage(msg || 'Failed to update role');
    }
  };

  const handleGeneratePublicLink = async () => {
    setIsGeneratingLink(true);
    try {
      const response = await apiClient.post(`/api/projects/${projectUuid}/generate-link`);
      const token = response.data.public_share_token;
      const publicShareUrl = `${window.location.origin}/canvas/${projectUuid}?share_token=${token}`;
      setPublicLink(publicShareUrl);
      setStatusMessage('Public link generated! Anyone with this link can view the project.');
    } catch (error: unknown) {
      const msg = getAxiosErrorDetail(error);
      setStatusMessage(msg || 'Failed to generate public link');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleDisablePublicLink = async () => {
    if (!confirm('Disable public link sharing? People with the link will no longer be able to access this project.')) {
      return;
    }

    try {
      await apiClient.post(`/api/projects/${projectUuid}/disable-link`);
      setPublicLink(null);
      setStatusMessage('Public link has been disabled');
    } catch (error: unknown) {
      const msg = getAxiosErrorDetail(error);
      setStatusMessage(msg || 'Failed to disable public link');
    }
  };

  const handleCopyPublicLink = () => {
    if (publicLink) {
      navigator.clipboard.writeText(publicLink);
      setStatusMessage('Public link copied to clipboard!');
    }
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

        {/* Shareable Link Section - Google Docs Style */}
        <div className="share-section">
          <label className="share-label">
            🔗 Shareable Link
          </label>
          
          {publicLink ? (
            <>
              <p style={{ fontSize: '0.9rem', color: '#999', margin: '0 0 12px 0' }}>
                Anyone with this link can view the project. When they log in, they'll be added to the viewer list. Guests can also view and download without logging in.
              </p>
              <div className="share-input-group">
                <input
                  type="text"
                  value={publicLink}
                  readOnly
                  className="share-input"
                />
                <button
                  onClick={handleCopyPublicLink}
                  className="share-button-primary"
                >
                  📋 Copy
                </button>
              </div>
              <button
                onClick={handleDisablePublicLink}
                className="share-button-secondary"
                style={{ marginTop: '8px', width: '100%' }}
              >
                🔒 Disable Link
              </button>
            </>
          ) : (
            <>
              <p style={{ fontSize: '0.9rem', color: '#999', margin: '0 0 12px 0' }}>
                Generate a link that anyone can use to view this project. No login required—guests can view and download. Logged-in users are automatically added to your viewer list.
              </p>
              <button
                onClick={handleGeneratePublicLink}
                disabled={isGeneratingLink}
                className="share-button-primary"
                style={{ width: '100%' }}
              >
                {isGeneratingLink ? '🔄 Generating...' : '🔓 Generate Shareable Link'}
              </button>
            </>
          )}
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
