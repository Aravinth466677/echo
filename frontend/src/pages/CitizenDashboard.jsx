import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { complaintAPI } from '../services/api';
import RoutingHistory from '../components/RoutingHistory.jsx';
import SLAStatus from '../components/SLAStatus.jsx';
import NotificationBell from '../components/NotificationBellFixed.jsx';
import './Dashboard.css';

const CitizenDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [complaints, setComplaints] = useState([]);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const navigate = useNavigate();
  const logoutIcon = String.fromCodePoint(0x21AA);

  useEffect(() => {
    loadComplaints();
  }, []);

  const loadComplaints = async () => {
    try {
      const response = await complaintAPI.getMyComplaints();
      const serverComplaints = Array.isArray(response.data?.complaints) ? response.data.complaints : [];
      setComplaints(serverComplaints);
    } catch (error) {
      console.error('Failed to load complaints:', error);
      setComplaints([]);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-title-block">
          <h1>Echo</h1>
          <span className="dashboard-subtitle">Welcome, {user?.fullName}</span>
        </div>
        <div className="user-info">
          <NotificationBell />
          <button
            type="button"
            className="header-icon-button"
            onClick={logout}
            aria-label="Logout"
            title="Logout"
          >
            <span>{logoutIcon}</span>
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="cta-section">
          <button 
            className="primary-cta"
            onClick={() => navigate('/citizen/report-issue')}
          >
            + Report New Issue
          </button>
        </div>

        <section className="complaints-section">
          <h2>My Complaints</h2>
          {complaints.length === 0 ? (
            <p>No complaints submitted yet.</p>
          ) : (
            <div className="complaints-list">
              {complaints.map((complaint) => (
                <div key={complaint.id} className="complaint-card">
                  <div className="complaint-header">
                    <span className="category">{complaint.category_name}</span>
                    <span className={`status status-${complaint.issue_status}`}>
                      {complaint.issue_status}
                    </span>
                  </div>
                  
                  {complaint.sla_status && (
                    <div className="sla-container">
                      <SLAStatus slaStatus={complaint.sla_status} />
                    </div>
                  )}
                  
                  <p className="description">{complaint.description || 'No description'}</p>
                  <div className="complaint-meta-grid">
                    <div className="complaint-meta-item">
                      <span className="meta-label">Echo Count</span>
                      <span className="meta-value">{complaint.echo_count}</span>
                    </div>
                    <div className="complaint-meta-item">
                      <span className="meta-label">Date</span>
                      <span className="meta-value">{new Date(complaint.created_at).toLocaleDateString()}</span>
                    </div>
                    {complaint.authority_name && (
                      <div className="complaint-meta-item complaint-meta-item--wide">
                        <span className="meta-label">Assigned To</span>
                        <span className="meta-value">{complaint.authority_name}</span>
                      </div>
                    )}
                  </div>
                  <div className="complaint-actions">
                    <button 
                      className="routing-btn"
                      onClick={() => setSelectedComplaint(complaint)}
                    >
                      View Routing History
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="area-section">
          <h2>Area Issues</h2>
          <button onClick={() => navigate('/citizen/area-issues')}>
            View Issues in My Area
          </button>
        </section>
      </div>
      
      {selectedComplaint && (
        <RoutingHistory 
          complaintId={selectedComplaint.id}
          complaint={selectedComplaint}
          onClose={() => setSelectedComplaint(null)}
        />
      )}
    </div>
  );
};

export default CitizenDashboard;
