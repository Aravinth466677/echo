import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { complaintAPI } from '../services/api';
import './Dashboard.css';

const CitizenDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const [complaints, setComplaints] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    loadComplaints();
  }, []);

  const loadComplaints = async () => {
    try {
      const response = await complaintAPI.getMyComplaints();
      setComplaints(response.data.complaints);
    } catch (error) {
      console.error('Failed to load complaints:', error);
    }
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Echo - Citizen Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user?.fullName}</span>
          <button onClick={logout}>Logout</button>
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
                  <p className="description">{complaint.description || 'No description'}</p>
                  <div className="complaint-meta">
                    <span>Echo Count: {complaint.echo_count}</span>
                    <span>{new Date(complaint.created_at).toLocaleDateString()}</span>
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
    </div>
  );
};

export default CitizenDashboard;
