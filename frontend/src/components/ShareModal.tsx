import React, { useState, useEffect } from 'react';
import apiClient from '../services/api';

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

  useEffect(() => {
    loadShares();
    setShareLink(`${window.location.origin}/canvas/${projectUuid}`);
  }, [projectUuid]);

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
      alert(response.data.message);
      setEmail('');
      loadShares();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to share project');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveUser = async (userId: number, userName: string) => {
    if (!confirm(`Remove ${userName} from this project?`)) return;

    try {
      await apiClient.delete(`/api/projects/${projectUuid}/shares/${userId}`);
      alert('User removed successfully');
      loadShares();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to remove user');
    }
  };

  const handleChangeRole = async (userId: number, newRole: string) => {
    try {
      await apiClient.patch(`/api/projects/${projectUuid}/shares/${userId}`, {
        role: newRole
      });
      alert('Role updated successfully');
      loadShares();
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Failed to update role');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink);
    alert('Link copied to clipboard!');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: '#2d2d30',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '600px',
          width: '90%',
          maxHeight: '80vh',
          overflow: 'auto',
          border: '1px solid #3e3e42'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ color: '#e1e1e1', margin: 0, fontSize: '22px', fontWeight: 600 }}>
            Share "{projectTitle}"
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#888',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0 8px'
            }}
          >
            ×
          </button>
        </div>

        {/* Share Link */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ color: '#888', fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '8px' }}>
            🔗 Share Link
          </label>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="text"
              value={shareLink}
              readOnly
              style={{
                flex: 1,
                padding: '10px 12px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e42',
                borderRadius: '6px',
                color: '#e1e1e1',
                fontSize: '13px'
              }}
            />
            <button
              onClick={handleCopyLink}
              style={{
                padding: '10px 16px',
                backgroundColor: '#007acc',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              📋 Copy
            </button>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid #3e3e42', margin: '24px 0' }} />

        {/* Email Invite */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ color: '#888', fontSize: '13px', fontWeight: 500, display: 'block', marginBottom: '8px' }}>
            📧 Invite by Email
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') handleShare();
              }}
              style={{
                flex: 1,
                padding: '10px 12px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e42',
                borderRadius: '6px',
                color: '#e1e1e1',
                fontSize: '13px'
              }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
              style={{
                padding: '10px 12px',
                backgroundColor: '#1e1e1e',
                border: '1px solid #3e3e42',
                borderRadius: '6px',
                color: '#e1e1e1',
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button
              onClick={handleShare}
              disabled={loading}
              style={{
                padding: '10px 16px',
                backgroundColor: loading ? '#555' : '#4caf50',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontWeight: 500
              }}
            >
              {loading ? '...' : 'Invite'}
            </button>
          </div>
        </div>

        {/* People with Access */}
        <div>
          <h3 style={{ color: '#e1e1e1', fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
            👥 People with access
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {users.map((user) => (
              <div
                key={user.user_id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: '#1e1e1e',
                  borderRadius: '6px',
                  border: '1px solid #3e3e42'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e1e1e1', fontSize: '14px', fontWeight: 500 }}>
                    {user.name || user.email.split('@')[0]}
                  </div>
                  <div style={{ color: '#888', fontSize: '12px' }}>{user.email}</div>
                </div>
                {user.role === 'owner' ? (
                  <div
                    style={{
                      padding: '4px 12px',
                      backgroundColor: '#007acc',
                      color: 'white',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}
                  >
                    Owner
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <select
                      value={user.role}
                      onChange={(e) => handleChangeRole(user.user_id, e.target.value)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: '#2d2d30',
                        border: '1px solid #3e3e42',
                        borderRadius: '4px',
                        color: '#e1e1e1',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={() => handleRemoveUser(user.user_id, user.name || user.email)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'transparent',
                        color: '#f44336',
                        border: '1px solid #f44336',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Pending Invites */}
            {pendingInvites.map((invite, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px',
                  backgroundColor: '#1e1e1e',
                  borderRadius: '6px',
                  border: '1px solid #ff9800'
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#e1e1e1', fontSize: '14px', fontWeight: 500 }}>
                    {invite.email}
                  </div>
                  <div style={{ color: '#888', fontSize: '12px' }}>Pending invitation</div>
                </div>
                <div
                  style={{
                    padding: '4px 12px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase'
                  }}
                >
                  {invite.role}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              backgroundColor: '#3e3e42',
              color: '#e1e1e1',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 500
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShareModal;
