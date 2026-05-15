import React, { useEffect, useState } from 'react';
import { complaintAPI } from '../services/api';
import './RoutingHistory.css';

const ROUTING_REASON_LABELS = {
  NORMAL: 'Standard routing to jurisdiction authority',
  NO_JURISDICTION: 'No jurisdiction found - routed to department',
  NO_JURISDICTION_AUTHORITY: 'No jurisdiction authority available - routed to department',
  NO_DEPARTMENT_AUTHORITY: 'No department authority available - routed to Super Admin',
  SLA_ESCALATION: 'Escalated due to SLA timeout - issue pending too long',
  RE_ROUTING: 'Re-routed due to escalation'
};

const AUTHORITY_BADGES = {
  JURISDICTION: { text: 'Local Authority', class: 'badge-jurisdiction' },
  DEPARTMENT: { text: 'Department Head', class: 'badge-department' },
  SUPER_ADMIN: { text: 'Super Admin', class: 'badge-super-admin' },
};

const RoutingHistory = ({ complaintId, onClose }) => {
  const [routingData, setRoutingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (complaintId) {
      loadRoutingHistory();
    }
  }, [complaintId]);

  const loadRoutingHistory = async () => {
    try {
      setLoading(true);
      const response = await complaintAPI.getRoutingHistory(complaintId);
      setRoutingData(response.data);
      setError('');
    } catch (err) {
      console.error('Failed to load routing history:', err);
      setRoutingData(null);
      setError(err.response?.data?.error || 'Failed to load routing history');
    } finally {
      setLoading(false);
    }
  };

  const getRoutingReasonText = (reason) => ROUTING_REASON_LABELS[reason] || reason;

  const getAuthorityLevelBadge = (level) => {
    const badge = AUTHORITY_BADGES[level] || { text: level, class: 'badge-default' };
    return <span className={`authority-badge ${badge.class}`}>{badge.text}</span>;
  };

  const formatDateTime = (dateString) =>
    new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const formatCoordinate = (value) => {
    const numericValue = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(numericValue) ? numericValue.toFixed(6) : String(value ?? '');
  };

  if (loading) {
    return (
      <div className="routing-history-modal">
      <div className="routing-history-content">
        <div className="routing-history-header">
          <h3>Complaint Routing History</h3>
          <button className="close-btn" onClick={onClose} type="button" aria-label="Close routing history">×</button>
        </div>
        <div className="loading">Loading routing history...</div>
      </div>
      </div>
    );
  }

  return (
    <div className="routing-history-modal">
      <div className="routing-history-content">
        <div className="routing-history-header">
          <h3>Complaint Routing History</h3>
          <button className="close-btn" onClick={onClose} type="button" aria-label="Close routing history">×</button>
        </div>

        {error && <div className="error">{error}</div>}

        <div className="routing-timeline">
          {!routingData?.routingHistory || routingData.routingHistory.length === 0 ? (
            <p className="no-history">No routing history available</p>
          ) : (
            routingData.routingHistory.map((log, index) => (
              <div key={log.id} className="routing-step">
                <div className="step-indicator">
                  <div className="step-number">{index + 1}</div>
                  {index < routingData.routingHistory.length - 1 && <div className="step-line"></div>}
                </div>

                <div className="step-content">
                  <div className="step-header">
                    <div className="step-time">{formatDateTime(log.routedAt)}</div>
                    {getAuthorityLevelBadge(log.authorityLevel)}
                  </div>

                  <div className="step-details">
                    <div className="authority-info">
                      <strong>{log.authorityName || 'Authority'}</strong>
                    </div>

                    <div className="routing-detail-grid">
                      {log.jurisdictionName && (
                        <div className="routing-detail-item">
                          <span className="label">Jurisdiction</span>
                          <span className="detail-text">{log.jurisdictionName}</span>
                        </div>
                      )}

                      <div className="routing-detail-item">
                        <span className="label">Category</span>
                        <span className="detail-text">{log.categoryName}</span>
                      </div>

                      <div className="routing-detail-item">
                        <span className="label">Echo Count</span>
                        <span
                          className={`echo-badge ${
                            log.echoCount >= 10 ? 'high' : log.echoCount >= 5 ? 'medium' : 'normal'
                          }`}
                        >
                          {log.echoCount}
                        </span>
                      </div>

                      {log.details?.coordinates && (
                        <div className="routing-detail-item">
                          <span className="label">Location</span>
                          <span className="coords">
                            {formatCoordinate(log.details.coordinates.latitude)},{' '}
                            {formatCoordinate(log.details.coordinates.longitude)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="routing-reason">
                      <span className="label">Reason</span>
                      <div className="reason-text">{getRoutingReasonText(log.routingReason)}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="routing-summary">
          <h4>Routing Summary</h4>
          <p>
            Your complaint has been routed <strong>{routingData?.routingHistory?.length || 0}</strong> time(s).
            {(routingData?.routingHistory?.length || 0) > 1 && (
              <span> The latest routing was due to escalation or priority change.</span>
            )}
          </p>

          {routingData?.currentAssignment?.authorityName && (
            <div className="current-assignment">
              <strong>Currently assigned to:</strong> {getAuthorityLevelBadge(routingData.currentAssignment.authorityLevel)}
              <span className="current-authority">{routingData.currentAssignment.authorityName}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoutingHistory;
