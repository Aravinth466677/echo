import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { complaintAPI } from '../services/api';
import { useLocationDetection } from '../hooks/useLocationDetection';
import './Dashboard.css';

const AreaIssues = () => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  const {
    detectLocation,
    stopWatching,
    reset: resetLocation,
    location,
    accuracy,
    error: locationError,
    isDetecting
  } = useLocationDetection();

  useEffect(() => {
    detectLocation();
    return () => resetLocation();
  }, [detectLocation, resetLocation]);

  useEffect(() => {
    if (location) {
      loadAreaIssues(location.latitude, location.longitude);
    }
  }, [location]);

  const loadAreaIssues = async (lat, lng) => {
    setLoading(true);
    setError('');
    
    try {
      const response = await complaintAPI.getAreaIssues(lat, lng, 5000); // 5km radius
      setIssues(response.data.issues || []);
    } catch (err) {
      console.error('Failed to load area issues:', err);
      setError('Failed to load area issues. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    const distance = R * c;
    
    if (distance < 1000) return `${Math.round(distance)}m away`;
    return `${(distance / 1000).toFixed(1)}km away`;
  };

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <h1>Area Issues</h1>
        <div className="user-info">
          <button onClick={() => navigate('/citizen/dashboard')}>← Back to Dashboard</button>
        </div>
      </header>

      <div className="dashboard-content">
        {!location && !locationError && (
          <div className="location-detecting">
            <p>Detecting your location...</p>
            {isDetecting && accuracy && <p>GPS accuracy: ±{accuracy}m</p>}
          </div>
        )}

        {locationError && (
          <div className="error-message">
            <p>{locationError}</p>
            <button onClick={detectLocation}>Try Again</button>
          </div>
        )}

        {location && (
          <section className="complaints-section">
            <h2>Issues in Your Area</h2>
            <p className="location-info">
              Showing issues within 5km of your location ({location.latitude.toFixed(4)}, {location.longitude.toFixed(4)})
            </p>
            
            {loading && <p>Loading area issues...</p>}
            
            {error && <div className="error-message">{error}</div>}
            
            {!loading && issues.length === 0 && (
              <p>No issues reported in your area yet.</p>
            )}
            
            {!loading && issues.length > 0 && (
              <div className="complaints-list">
                {issues.map((issue) => (
                  <div key={issue.id} className="complaint-card">
                    <div className="complaint-header">
                      <span className="category">{issue.category_name}</span>
                      <span className={`status status-${issue.status}`}>
                        {issue.status}
                      </span>
                    </div>
                    <div className="complaint-meta">
                      <span>Echo Count: {issue.echo_count}</span>
                      <span>Reports: {issue.report_count}</span>
                      <span>{formatDistance(location.latitude, location.longitude, issue.latitude, issue.longitude)}</span>
                      <span>{new Date(issue.first_reported_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default AreaIssues;