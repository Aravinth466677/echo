import React, { useEffect, useState } from 'react';
import './ComplaintTimeline.css';
import { buildApiUrl } from '../services/api.js';
import { getStoredToken } from '../utils/authStorage.js';

const ComplaintTimeline = ({ complaintId, isPublic = false, className = '' }) => {
  const [timeline, setTimeline] = useState([]);
  const [complaint, setComplaint] = useState(null);
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedEntries, setExpandedEntries] = useState(new Set());

  useEffect(() => {
    if (complaintId) {
      fetchTimeline();
    }
  }, [complaintId, isPublic]);

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      setError(null);

      const endpoint = isPublic
        ? `/api/public/complaints/${complaintId}/timeline`
        : `/api/complaints/${complaintId}/history`;

      const headers = {};
      if (!isPublic) {
        const token = getStoredToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
      }

      const response = await fetch(buildApiUrl(endpoint), {
        credentials: 'include',
        headers
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch timeline: ${response.statusText}`);
      }

      const data = await response.json();

      setTimeline(data.timeline || []);
      setComplaint(data.complaint);
      setStatistics(data.statistics);
    } catch (err) {
      console.error('Timeline fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (timestamp) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInSeconds = Math.floor((now - time) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;

    return time.toLocaleDateString();
  };

  const getActionIcon = (action) => {
    const iconMap = {
      CREATED: '📝',
      STATUS_CHANGE: '🔄',
      ASSIGNED: '👤',
      VERIFIED: '✅',
      REJECTED: '❌',
      RESOLVED: '🎯',
      ESCALATED: '⬆️',
      CLOSED: '🔒',
      COMMENT_ADDED: '💬',
      EVIDENCE_ADDED: '📎'
    };

    return iconMap[action] || '📋';
  };

  const getActionColor = (action, newStatus) => {
    const colorMap = {
      CREATED: 'blue',
      ASSIGNED: 'purple',
      VERIFIED: 'green',
      RESOLVED: 'green',
      REJECTED: 'red',
      ESCALATED: 'orange',
      CLOSED: 'gray',
      COMMENT_ADDED: 'blue',
      EVIDENCE_ADDED: 'blue'
    };

    if (newStatus) {
      const statusColors = {
        submitted: 'blue',
        assigned: 'purple',
        in_progress: 'orange',
        resolved: 'green',
        verified: 'green',
        rejected: 'red',
        closed: 'gray',
        escalated: 'orange'
      };
      return statusColors[newStatus] || colorMap[action] || 'gray';
    }

    return colorMap[action] || 'gray';
  };

  const getRoleBadgeColor = (role) => {
    const roleColors = {
      CITIZEN: 'bg-blue-100 text-blue-800',
      AUTHORITY: 'bg-purple-100 text-purple-800',
      ADMIN: 'bg-red-100 text-red-800',
      SYSTEM: 'bg-gray-100 text-gray-800'
    };
    return roleColors[role] || 'bg-gray-100 text-gray-800';
  };

  const toggleExpanded = (entryId) => {
    const nextExpanded = new Set(expandedEntries);
    if (nextExpanded.has(entryId)) {
      nextExpanded.delete(entryId);
    } else {
      nextExpanded.add(entryId);
    }
    setExpandedEntries(nextExpanded);
  };

  const getStatusChangeText = (oldStatus, newStatus) => {
    if (!oldStatus && newStatus) {
      return `Status set to ${newStatus}`;
    }
    if (oldStatus && newStatus) {
      return `${oldStatus} → ${newStatus}`;
    }
    return '';
  };

  if (loading) {
    return (
      <div className={`complaint-timeline loading ${className}`}>
        <div className="timeline-header">
          <div className="skeleton-line"></div>
          <div className="skeleton-line short"></div>
        </div>
        <div className="timeline-content">
          {[1, 2, 3].map((item) => (
            <div key={item} className="timeline-entry skeleton">
              <div className="timeline-marker skeleton-circle"></div>
              <div className="timeline-content-item">
                <div className="skeleton-line"></div>
                <div className="skeleton-line short"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`complaint-timeline error ${className}`}>
        <div className="error-message">
          <span className="error-icon">⚠️</span>
          <div>
            <h4>Failed to load timeline</h4>
            <p>{error}</p>
            <button onClick={fetchTimeline} className="retry-button">
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`complaint-timeline ${className}`}>
      <div className="timeline-header">
        <h3>📋 Complaint Timeline</h3>
        {complaint && (
          <div className="complaint-info">
            <span className="complaint-id">#{complaint.id}</span>
            <span className="complaint-category">{complaint.categoryName}</span>
            <span className={`complaint-status status-${complaint.status}`}>
              {complaint.status}
            </span>
          </div>
        )}
      </div>

      {!isPublic && statistics && (
        <div className="timeline-stats">
          <div className="stat-item">
            <span className="stat-value">{statistics.totalActions}</span>
            <span className="stat-label">Total Actions</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{statistics.statusChanges}</span>
            <span className="stat-label">Status Changes</span>
          </div>
          <div className="stat-item">
            <span className="stat-value">{statistics.uniqueActors}</span>
            <span className="stat-label">People Involved</span>
          </div>
        </div>
      )}

      <div className="timeline-content">
        {timeline.length === 0 ? (
          <div className="empty-timeline">
            <span className="empty-icon">📭</span>
            <p>No timeline entries found</p>
          </div>
        ) : (
          timeline.map((entry, index) => {
            const isExpanded = expandedEntries.has(entry.id);
            const actionColor = getActionColor(entry.action, entry.newStatus);
            const isLast = index === timeline.length - 1;

            return (
              <div key={entry.id || index} className={`timeline-entry ${isLast ? 'last' : ''}`}>
                <div className={`timeline-marker color-${actionColor}`}>
                  <span className="marker-icon">{getActionIcon(entry.action)}</span>
                </div>

                <div className="timeline-content-item">
                  <div className="timeline-header-row">
                    <div className="timeline-main-info">
                      <h4 className="timeline-title">{entry.description}</h4>
                      <div className="timeline-meta">
                        <span className={`role-badge ${getRoleBadgeColor(entry.role)}`}>
                          {entry.role}
                        </span>
                        {!isPublic && entry.changedBy && (
                          <span className="changed-by">by {entry.changedBy}</span>
                        )}
                        <span className="timestamp">{formatTimeAgo(entry.timestamp)}</span>
                      </div>
                    </div>

                    {(entry.oldStatus || entry.newStatus) && (
                      <div className="status-change">
                        <span className="status-change-text">
                          {getStatusChangeText(entry.oldStatus, entry.newStatus)}
                        </span>
                      </div>
                    )}
                  </div>

                  {(entry.remarks || (!isPublic && entry.metadata)) && (
                    <div className="timeline-expandable">
                      <button
                        onClick={() => toggleExpanded(entry.id)}
                        className="expand-button"
                      >
                        {isExpanded ? '▼ Hide Details' : '▶ Show Details'}
                      </button>

                      {isExpanded && (
                        <div className="timeline-details">
                          {entry.remarks && (
                            <div className="detail-item">
                              <strong>Remarks:</strong>
                              <p>{entry.remarks}</p>
                            </div>
                          )}

                          {!isPublic && entry.metadata && (
                            <div className="detail-item">
                              <strong>Additional Details:</strong>
                              <pre className="metadata">
                                {JSON.stringify(entry.metadata, null, 2)}
                              </pre>
                            </div>
                          )}

                          <div className="detail-item">
                            <strong>Exact Time:</strong>
                            <span>{new Date(entry.timestamp).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="timeline-footer">
        <span className="timeline-count">
          {timeline.length} {timeline.length === 1 ? 'entry' : 'entries'}
        </span>
        {!isPublic && (
          <button onClick={fetchTimeline} className="refresh-button">
            🔄 Refresh
          </button>
        )}
      </div>
    </div>
  );
};

export default ComplaintTimeline;
