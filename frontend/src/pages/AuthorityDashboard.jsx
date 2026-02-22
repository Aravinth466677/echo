import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { authorityAPI } from '../services/api';
import './Dashboard.css';

const AuthorityDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [verificationQueue, setVerificationQueue] = useState([]);
  const [activeIssues, setActiveIssues] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [issueDetails, setIssueDetails] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [queueRes, activeRes] = await Promise.all([
        authorityAPI.getVerificationQueue(),
        authorityAPI.getActiveIssues()
      ]);
      setVerificationQueue(queueRes.data.issues);
      setActiveIssues(activeRes.data.issues);
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  };

  const viewIssueDetails = async (issueId) => {
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
      loadData();
    } catch (error) {
      alert('Failed to verify issue');
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
            <section className="complaints-section">
              <h2>Verification Queue ({verificationQueue.length})</h2>
              <div className="complaints-list">
                {verificationQueue.map((issue) => (
                  <div key={issue.id} className="complaint-card" onClick={() => viewIssueDetails(issue.id)}>
                    <div className="complaint-header">
                      <span className="category">{issue.category_name}</span>
                      <span className="echo-badge">Echo: {issue.echo_count}</span>
                    </div>
                    <div className="complaint-meta">
                      <span>Reports: {issue.report_count}</span>
                      <span>{new Date(issue.first_reported_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="complaints-section">
              <h2>Active Issues ({activeIssues.length})</h2>
              <div className="complaints-list">
                {activeIssues.map((issue) => (
                  <div key={issue.id} className="complaint-card" onClick={() => viewIssueDetails(issue.id)}>
                    <div className="complaint-header">
                      <span className="category">{issue.category_name}</span>
                      <span className={`status status-${issue.status}`}>{issue.status}</span>
                    </div>
                    <div className="complaint-meta">
                      <span>Echo: {issue.echo_count}</span>
                      <span>Open: {Math.floor(issue.hours_open)}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="complaints-section">
            <button onClick={() => { setSelectedIssue(null); setIssueDetails(null); }}>
              ← Back
            </button>
            
            {issueDetails && (
              <div className="issue-details">
                <h2>{issueDetails.issue.category_name}</h2>
                <p>Status: {issueDetails.issue.status}</p>
                <p>Echo Count: {issueDetails.issue.echo_count}</p>
                <p>Location: {issueDetails.issue.latitude}, {issueDetails.issue.longitude}</p>

                <h3>Evidence Timeline</h3>
                {issueDetails.complaints.map((complaint) => (
                  <div key={complaint.id} className="evidence-item">
                    <img src={`http://localhost:5000${complaint.evidence_url}`} alt="Evidence" style={{maxWidth: '300px'}} />
                    <p>{complaint.description}</p>
                    <small>{new Date(complaint.created_at).toLocaleString()}</small>
                  </div>
                ))}

                <div className="action-buttons">
                  {issueDetails.issue.status === 'pending' && (
                    <>
                      <button onClick={() => handleVerify('accept')}>Accept</button>
                      <button onClick={() => handleVerify('reject')}>Reject</button>
                    </>
                  )}
                  {issueDetails.issue.status === 'verified' && (
                    <button onClick={() => handleStatusUpdate('in_progress')}>Mark In Progress</button>
                  )}
                  {issueDetails.issue.status === 'in_progress' && (
                    <button onClick={() => handleStatusUpdate('resolved')}>Mark Resolved</button>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default AuthorityDashboard;
