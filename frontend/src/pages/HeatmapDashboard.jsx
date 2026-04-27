import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import ComplaintHeatmap from '../components/ClusteredHeatmap.jsx';
import './HeatmapDashboard.css';

const HeatmapDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const goBack = () => {
    if (user?.role === 'authority') {
      navigate('/authority/dashboard');
    } else if (user?.role === 'admin') {
      navigate('/admin/dashboard');
    } else {
      navigate('/citizen/dashboard');
    }
  };

  return (
    <div className="heatmap-dashboard">
      {/* Header */}
      <header className="heatmap-header">
        <div className="header-content">
          <button onClick={goBack} className="back-btn">
            ← Back
          </button>
          <h1>Complaint Heatmap</h1>
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="heatmap-main">
        <div className="heatmap-description">
          <p>Geographic distribution of complaints from the last 7 days</p>
        </div>
        
        <div className="heatmap-wrapper">
          <ComplaintHeatmap />
        </div>
        
        <div className="heatmap-legend">
          <h3>Heat Intensity</h3>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-color" style={{ background: 'blue' }}></div>
              <span>Low</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ background: 'yellow' }}></div>
              <span>Medium</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ background: 'red' }}></div>
              <span>High</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default HeatmapDashboard;