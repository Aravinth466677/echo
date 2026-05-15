import React, { useContext, useEffect, useState } from 'react';
import LocationPicker from '../components/LocationPicker.jsx';
import SLAStatus from '../components/SLAStatus.jsx';
import TrustLevelIndicator from '../components/TrustLevelIndicator.jsx';
import AnalyticsDashboard from './AnalyticsDashboard.jsx';
import { AuthContext } from '../context/AuthContext.jsx';
import { API_ORIGIN, authorityAPI } from '../services/api';
import './Dashboard.css';
import '../components/NoJurisdictionTag.css';

const AuthorityDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('queue');
  const [verificationQueue, setVerificationQueue] = useState([]);
  const [activeIssues, setActiveIssues] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [issueDetails, setIssueDetails] = useState(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationSaved, setLocationSaved] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const formatDate = (value) => {
    if (!value) {
      return 'Unknown date';
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? 'Unknown date' : parsed.toLocaleDateString();
  };

  const getIssueIdentifier = (item) => item?.issue_id || item?.id;
  const getReportModeLabel = (reportMode) => (reportMode === 'remote' ? 'Remote' : 'In-Place');
  const getAuthorityLevelLabel = (authorityLevel) => {
    if (authorityLevel === 'JURISDICTION') return 'Local Authority';
    if (authorityLevel === 'DEPARTMENT') return 'Department Head';
    if (authorityLevel === 'SUPER_ADMIN') return 'Super Admin';
    return authorityLevel || 'Unknown';
  };

  const loadData = async () => {
    try {
      const [queueResult, activeResult] = await Promise.allSettled([
        authorityAPI.getVerificationQueue(),
        authorityAPI.getActiveIssues(),
      ]);

      if (queueResult.status === 'fulfilled') {
        const queueItems =
          queueResult.value?.data?.complaints ?? queueResult.value?.data?.issues ?? [];
        setVerificationQueue(Array.isArray(queueItems) ? queueItems : []);
      } else {
        console.error('Failed to load verification queue:', queueResult.reason);
        setVerificationQueue([]);
      }

      if (activeResult.status === 'fulfilled') {
        const activeItems =
          activeResult.value?.data?.complaints ?? activeResult.value?.data?.issues ?? [];
        setActiveIssues(Array.isArray(activeItems) ? activeItems : []);
      } else {
        console.error('Failed to load active issues:', activeResult.reason);
        setActiveIssues([]);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
      setVerificationQueue([]);
      setActiveIssues([]);
    }
  };

  const viewIssueDetails = async (item) => {
    const issueId = getIssueIdentifier(item);

    if (!issueId) {
      console.error('Missing issue identifier for authority dashboard item:', item);
      alert('This report is missing its issue link.');
      return;
    }

    try {
      const response = await authorityAPI.getIssueDetails(issueId);
      setIssueDetails(response.data);
      setSelectedIssue(issueId);
    } catch (error) {
      console.error('Failed to load issue details:', error);
    }
  };

  const handleVerify = async (action) => {
    try {
      await authorityAPI.verifyIssue(selectedIssue, action);
      alert(`Issue ${action}ed successfully`);
      setSelectedIssue(null);
      setIssueDetails(null);
      setLocationSaved(null);
      loadData();
    } catch (error) {
      alert('Failed to verify issue');
    }
  };

  const handleLocationConfirm = async (locationData) => {
    try {
      await authorityAPI.updateIssueLocation(selectedIssue, locationData);
      setLocationSaved(locationData);
      setShowLocationPicker(false);
      alert('Location saved successfully');
    } catch (error) {
      alert('Failed to save location');
    }
  };

  const handleStatusUpdate = async (status) => {
    try {
      await authorityAPI.updateIssueStatus(selectedIssue, status, null);
      alert('Status updated successfully');
      setSelectedIssue(null);
      setIssueDetails(null);
      loadData();
    } catch (error) {
      alert('Failed to update status');
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Echo - Authority Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user?.fullName}</span>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        {!selectedIssue ? (
          <>
            {/* Tab Navigation */}
            <div className="tab-navigation">
              <button 
                className={`tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
                onClick={() => setActiveTab('queue')}
              >
                Verification Queue ({verificationQueue.length})
              </button>
              <button 
                className={`tab-btn ${activeTab === 'active' ? 'active' : ''}`}
                onClick={() => setActiveTab('active')}
              >
                Active Issues ({activeIssues.length})
              </button>
              <button 
                className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                Analytics
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'queue' && (
              <section className="complaints-section">
                <h2>Verification Queue ({verificationQueue.length})</h2>
                <div className="complaints-list">
                  {verificationQueue.map((issue) => (
                    <div
                      key={`${issue.id}-${issue.issue_id || 'no-issue'}`}
                      className={`complaint-card ${issue.is_no_jurisdiction ? 'no-jurisdiction' : ''} ${
                        issue.is_sla_breached ? 'sla-breached' : ''
                      }`}
                      onClick={() => viewIssueDetails(issue)}
                    >
                      <div className="complaint-header">
                        <span className="category">{issue.category_name}</span>
                        <span className="echo-badge">Echo: {issue.echo_count || 1}</span>
                        {issue.is_no_jurisdiction && (
                          <span className="no-jurisdiction-tag">NO JURISDICTION</span>
                        )}
                      </div>
                      {issue.sla_status && (
                        <div className="sla-container">
                          <SLAStatus slaStatus={issue.sla_status} compact />
                        </div>
                      )}
                      {issue.trust_level && (
                        <div className="trust-container">
                          <TrustLevelIndicator
                            trustLevel={issue.trust_level}
                            distance={issue.distance_meters}
                            distanceFormatted={
                              typeof issue.distance_meters === 'number'
                                ? issue.distance_meters < 1000
                                  ? `${issue.distance_meters}m`
                                  : `${(issue.distance_meters / 1000).toFixed(1)}km`
                                : null
                            }
                            justification={issue.remote_justification}
                            justificationType={issue.justification_type}
                            compact
                          />
                        </div>
                      )}
                      <div className="report-mode-info">
                        <span className="label">Report Mode:</span>
                        <span className={`report-mode ${issue.report_mode === 'remote' ? 'remote' : 'in-place'}`}>
                          {getReportModeLabel(issue.report_mode)}
                        </span>
                      </div>
                      <div className="jurisdiction-info">
                        <span className="label">Area:</span>
                        <span
                          className={
                            issue.is_no_jurisdiction ? 'jurisdiction-none' : 'jurisdiction-normal'
                          }
                        >
                          {issue.jurisdiction_name || 'Unknown Area'}
                        </span>
                      </div>
                      {issue.assigned_authority_name && (
                        <div className="assignment-info">
                          <span className="label">Assigned to:</span>
                          <span className="assigned-authority">{getAuthorityLevelLabel(issue.assigned_authority_level)}</span>
                        </div>
                      )}
                      {!issue.is_current_assignee && (
                        <div className="assignment-info">
                          <span className="label">Visibility:</span>
                          <span className="assigned-authority">Escalated - read only</span>
                        </div>
                      )}
                      <div className="complaint-meta">
                        <span>Reports: {issue.report_count || issue.echo_count || 1}</span>
                        <span>{formatDate(issue.first_reported_at || issue.created_at)}</span>
                        {issue.priority_score && (
                          <span className="priority-score">
                            Priority: {Math.round(issue.priority_score)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'active' && (
              <section className="complaints-section">
                <h2>Active Issues ({activeIssues.length})</h2>
                <div className="complaints-list">
                  {activeIssues.map((issue) => (
                    <div
                      key={`${issue.id}-${issue.issue_id || 'no-issue'}`}
                      className={`complaint-card ${issue.is_no_jurisdiction ? 'no-jurisdiction' : ''} ${
                        issue.is_sla_breached ? 'sla-breached' : ''
                      }`}
                      onClick={() => viewIssueDetails(issue)}
                    >
                      <div className="complaint-header">
                        <span className="category">{issue.category_name}</span>
                        <span className={`status status-${issue.issue_status || issue.status}`}>
                          {issue.issue_status || issue.status}
                        </span>
                        {issue.is_no_jurisdiction && (
                          <span className="no-jurisdiction-tag">NO JURISDICTION</span>
                        )}
                      </div>
                      {issue.sla_status && (
                        <div className="sla-container">
                          <SLAStatus slaStatus={issue.sla_status} compact />
                        </div>
                      )}
                      {issue.trust_level && (
                        <div className="trust-container">
                          <TrustLevelIndicator
                            trustLevel={issue.trust_level}
                            distance={issue.distance_meters}
                            distanceFormatted={
                              typeof issue.distance_meters === 'number'
                                ? issue.distance_meters < 1000
                                  ? `${issue.distance_meters}m`
                                  : `${(issue.distance_meters / 1000).toFixed(1)}km`
                                : null
                            }
                            justification={issue.remote_justification}
                            justificationType={issue.justification_type}
                            compact
                          />
                        </div>
                      )}
                      <div className="report-mode-info">
                        <span className="label">Report Mode:</span>
                        <span className={`report-mode ${issue.report_mode === 'remote' ? 'remote' : 'in-place'}`}>
                          {getReportModeLabel(issue.report_mode)}
                        </span>
                      </div>
                      <div className="jurisdiction-info">
                        <span className="label">Area:</span>
                        <span
                          className={
                            issue.is_no_jurisdiction ? 'jurisdiction-none' : 'jurisdiction-normal'
                          }
                        >
                          {issue.jurisdiction_name || 'Unknown Area'}
                        </span>
                      </div>
                      {issue.assigned_authority_name && (
                        <div className="assignment-info">
                          <span className="label">Assigned to:</span>
                          <span className="assigned-authority">{getAuthorityLevelLabel(issue.assigned_authority_level)}</span>
                        </div>
                      )}
                      {!issue.is_current_assignee && (
                        <div className="assignment-info">
                          <span className="label">Visibility:</span>
                          <span className="assigned-authority">Escalated - read only</span>
                        </div>
                      )}
                      <div className="complaint-meta">
                        <span>Echo: {issue.echo_count || 1}</span>
                        <span>Open: {Math.max(0, Math.floor(issue.hours_open || 0))}h</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'analytics' && (
              <section className="complaints-section">
                <h2>Analytics</h2>
                <AnalyticsDashboard embedded />
              </section>
            )}
          </>
        ) : (
          <section className="complaints-section">
            <button
              onClick={() => {
                setSelectedIssue(null);
                setIssueDetails(null);
              }}
            >
              Back
            </button>

            {issueDetails && (
              <div className="issue-details">
                <h2>{issueDetails.issue.category_name}</h2>
                <div className="jurisdiction-info">
                  <span className="label">Area:</span>
                  <span
                    className={
                      issueDetails.issue.is_no_jurisdiction
                        ? 'jurisdiction-none'
                        : 'jurisdiction-normal'
                    }
                  >
                    {issueDetails.issue.jurisdiction_name || 'Unknown Area'}
                  </span>
                  {issueDetails.issue.is_no_jurisdiction && (
                    <span className="no-jurisdiction-tag">NO JURISDICTION</span>
                  )}
                </div>

                {issueDetails.issue.sla_status && (
                  <div className="sla-section">
                    <h3>Service Level Agreement</h3>
                    <SLAStatus slaStatus={issueDetails.issue.sla_status} />
                  </div>
                )}

                {issueDetails.complaints?.[0]?.trust_level && (
                  <div className="trust-section">
                    <h3>Report Trust</h3>
                    <TrustLevelIndicator
                      trustLevel={issueDetails.complaints[0].trust_level}
                      distance={issueDetails.complaints[0].distance_meters}
                      distanceFormatted={
                        typeof issueDetails.complaints[0].distance_meters === 'number'
                          ? issueDetails.complaints[0].distance_meters < 1000
                            ? `${issueDetails.complaints[0].distance_meters}m`
                            : `${(issueDetails.complaints[0].distance_meters / 1000).toFixed(1)}km`
                          : null
                      }
                      justification={issueDetails.complaints[0].remote_justification}
                      justificationType={issueDetails.complaints[0].justification_type}
                    />
                    <p>Report Mode: {getReportModeLabel(issueDetails.complaints[0].report_mode)}</p>
                  </div>
                )}

                <p>Status: {issueDetails.issue.status}</p>
                <p>Echo Count: {issueDetails.issue.echo_count}</p>
                {!issueDetails.issue.is_current_assignee && (
                  <p>
                    This issue is currently assigned to{' '}
                    {issueDetails.issue.current_authority_name || getAuthorityLevelLabel(issueDetails.issue.current_authority_level)}.
                    You can still view it here because it previously passed through your queue.
                  </p>
                )}

                <div className="location-section">
                  <strong>Location</strong>
                  {locationSaved ? (
                    <div className="location-saved">
                      <div>
                        Verified:{' '}
                        {locationSaved.address ||
                          `${locationSaved.latitude.toFixed(5)}, ${locationSaved.longitude.toFixed(5)}`}
                      </div>
                      <div className="location-landmark">
                        Landmark: {locationSaved.landmark_note}
                      </div>
                    </div>
                  ) : (
                    <div className="location-coords">
                      {issueDetails.issue.latitude}, {issueDetails.issue.longitude}
                    </div>
                  )}
                  <button className="location-btn" onClick={() => setShowLocationPicker(true)}>
                    {locationSaved ? 'Adjust Location' : 'Set Verified Location'}
                  </button>
                </div>

                <h3>Evidence Timeline</h3>
                {(issueDetails.complaints || []).map((complaint) => (
                  <div key={complaint.id} className="evidence-item">
                    <img
                      src={`${API_ORIGIN}${complaint.evidence_url}`}
                      alt="Evidence"
                      style={{ maxWidth: '300px' }}
                    />
                    <p>{complaint.description}</p>
                    <small>{new Date(complaint.created_at).toLocaleString()}</small>
                  </div>
                ))}

                <div className="action-buttons">
                  {issueDetails.issue.is_current_assignee && issueDetails.issue.status === 'pending' && (
                    <>
                      <button onClick={() => handleVerify('accept')}>Accept</button>
                      <button onClick={() => handleVerify('reject')}>Reject</button>
                    </>
                  )}
                  {issueDetails.issue.is_current_assignee && issueDetails.issue.status === 'verified' && (
                    <button onClick={() => handleStatusUpdate('in_progress')}>
                      Mark In Progress
                    </button>
                  )}
                  {issueDetails.issue.is_current_assignee && issueDetails.issue.status === 'in_progress' && (
                    <button onClick={() => handleStatusUpdate('resolved')}>Mark Resolved</button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      {showLocationPicker && (
        <LocationPicker
          initialLat={locationSaved?.latitude ?? issueDetails?.issue?.latitude}
          initialLng={locationSaved?.longitude ?? issueDetails?.issue?.longitude}
          onConfirm={handleLocationConfirm}
          onCancel={() => setShowLocationPicker(false)}
        />
      )}
    </div>
  );
};

export default AuthorityDashboard;
