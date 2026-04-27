import React from 'react';
import './TrustLevelIndicator.css';

const TRUST_CONFIGS = {
  high: {
    icon: '\u25CF',
    label: 'High Trust',
    color: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: '#10b981',
    description: 'Reporter is near the issue location',
  },
  medium: {
    icon: '\u25CF',
    label: 'Medium Trust',
    color: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: '#f59e0b',
    description: 'Reporter is moderately far from the issue',
  },
  low: {
    icon: '\u25CF',
    label: 'Low Trust',
    color: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: '#ef4444',
    description: 'Reporter is far from the issue location',
  },
  unverified: {
    icon: '\u25CF',
    label: 'Unverified',
    color: '#dc2626',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
    borderColor: '#dc2626',
    description: 'Location could not be verified',
  },
};

const JUSTIFICATION_LABELS = {
  traveling: 'Saw while traveling',
  reporting_for_other: 'Reporting for someone else',
  other: 'Other reason',
};

const TrustLevelIndicator = ({
  trustLevel,
  distance,
  distanceFormatted,
  justification,
  justificationType,
  compact = false,
  showDetails = true,
}) => {
  const config = TRUST_CONFIGS[trustLevel] || TRUST_CONFIGS.unverified;

  if (compact) {
    return (
      <div
        className="trust-indicator compact"
        style={{
          backgroundColor: config.backgroundColor,
          borderColor: config.borderColor,
          color: config.color,
        }}
        title={`${config.label}${distanceFormatted ? ` (${distanceFormatted} away)` : ''}`}
      >
        <span className="trust-icon">{config.icon}</span>
        <span className="trust-label">{config.label}</span>
        {distanceFormatted && <span className="trust-distance">{distanceFormatted}</span>}
      </div>
    );
  }

  return (
    <div
      className="trust-indicator full"
      style={{
        backgroundColor: config.backgroundColor,
        borderColor: config.borderColor,
      }}
    >
      <div className="trust-header">
        <span className="trust-icon" style={{ color: config.color }}>
          {config.icon}
        </span>
        <div className="trust-info">
          <div className="trust-label" style={{ color: config.color }}>
            {config.label}
          </div>
          {showDetails && <div className="trust-description">{config.description}</div>}
        </div>
      </div>

      {showDetails && (
        <div className="trust-details">
          {distanceFormatted && (
            <div className="detail-item">
              <span className="detail-label">Distance:</span>
              <span className="detail-value">{distanceFormatted}</span>
            </div>
          )}

          {distance !== undefined && distance > 0 && (
            <div className="detail-item">
              <span className="detail-label">Exact:</span>
              <span className="detail-value">{distance}m</span>
            </div>
          )}

          {justification && (
            <div className="detail-item">
              <span className="detail-label">Reason:</span>
              <span className="detail-value">
                {justificationType
                  ? JUSTIFICATION_LABELS[justificationType] || justificationType
                  : 'Remote reporting'}
              </span>
            </div>
          )}

          {justification && (
            <div className="detail-item full-width">
              <span className="detail-label">Justification:</span>
              <span className="detail-value italic">"{justification}"</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrustLevelIndicator;
