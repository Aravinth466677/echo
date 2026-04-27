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
          <h1>Complaint Locations</h1>
          <button onClick={logout} className="logout-btn">
            Logout
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="heatmap-main">
        <div className="heatmap-description">
          <p>Geographic distribution of complaints with exact counts from the last 7 days</p>
        </div>
        
        <div className="heatmap-wrapper">
          <ComplaintHeatmap />
        </div>
        
        <div className="heatmap-legend">
          <h3>Complaint Count</h3>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-color" style={{ background: '#3388ff', borderRadius: '50%', width: '20px', height: '20px' }}></div>
              <span>Low (1-2 complaints)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ background: '#ff8800', borderRadius: '50%', width: '20px', height: '20px' }}></div>
              <span>Medium (3-9 complaints)</span>
            </div>
            <div className="legend-item">
              <div className="legend-color" style={{ background: '#ff0000', borderRadius: '50%', width: '20px', height: '20px' }}></div>
              <span>High (10+ complaints)</span>
            </div>
          </div>
          <p className="legend-note">Click on markers to see complaint details</p>
        </div>
      </main>
    </div>
  );
};

export default HeatmapDashboard;