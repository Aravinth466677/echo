import React from 'react';
import './SLAStatus.css';

const SLAStatus = ({ slaStatus, compact = false }) => {
  if (!slaStatus) {
    return null;
  }

  const {
    remaining_time_formatted,
    is_breached,
    status_color,
    display_text,
    sla_deadline,
    issue_status,
  } = slaStatus;

  if (issue_status === 'resolved' || issue_status === 'rejected') {
    return (
      <div className={`sla-status ${compact ? 'compact' : ''} completed`}>
        <span className="sla-icon">{'\u2705'}</span>
        <span className="sla-text">Completed</span>
      </div>
    );
  }

  const getIcon = () => {
    if (is_breached) {
      return '\u{1F6A8}';
    }

    if (status_color === 'red') {
      return '\u26A0\uFE0F';
    }

    if (status_color === 'orange') {
      return '\u23F0';
    }

    return '\u2705';
  };

  const formatDeadline = (deadline) => {
    if (!deadline) {
      return '';
    }

    const date = new Date(deadline);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className={`sla-status ${compact ? 'compact' : ''} ${status_color} ${
        is_breached ? 'breached' : ''
      }`}
    >
      <span className="sla-icon">{getIcon()}</span>
      <div className="sla-content">
        <div className="sla-main">
          <span className="sla-time">{remaining_time_formatted}</span>
          <span className="sla-label">{is_breached ? 'Overdue' : 'remaining'}</span>
        </div>
        {!compact && (
          <div className="sla-details">
            <span className="sla-status-text">{display_text}</span>
            {sla_deadline && (
              <span className="sla-deadline">Due: {formatDeadline(sla_deadline)}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SLAStatus;
