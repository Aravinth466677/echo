import React, { useState, useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
import { analyticsAPI } from '../services/api';
import AnalyticsHeatmap from '../components/AnalyticsHeatmap.jsx';
import './AnalyticsDashboard.css';

const AnalyticsDashboard = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [heatmapData, setHeatmapData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAnalyticsData();
  }, []);

  const loadAnalyticsData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const [summaryResponse, heatmapResponse] = await Promise.all([
        analyticsAPI.getSummary(),
        analyticsAPI.getHeatmapData()
      ]);

      setSummary(summaryResponse.data.data);
      setHeatmapData(heatmapResponse.data.data || []);
    } catch (err) {
      console.error('Analytics data error:', err);
      setError(err.response?.data?.error || 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const formatResolutionTime = (hours) => {
    if (!hours || hours === 0) return 'N/A';
    if (hours < 24) return `${Math.round(hours)}h`;
    return `${Math.round(hours / 24)}d`;
  };

  const calculateResolutionRate = () => {
    if (!summary) return 0;
    const total = summary.resolved + summary.pending + summary.rejected;
    return total > 0 ? Math.round((summary.resolved / total) * 100) : 0;
  };

  if (loading) {
    return (
      <div className="analytics-dashboard">
        <header className="dashboard-header">
          <h1>Analytics Dashboard</h1>
          <div className="user-info">
            <span>Welcome, {user?.fullName}</span>
            <button onClick={() => navigate('/authority/dashboard')}>Back to Dashboard</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        <div className="loading-container">
          <div className="spinner"></div>
          <p>Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-dashboard">
        <header className="dashboard-header">
          <h1>Analytics Dashboard</h1>
          <div className="user-info">
            <button onClick={() => navigate('/authority/dashboard')}>Back to Dashboard</button>
            <button onClick={logout}>Logout</button>
          </div>
        </header>
        <div className="error-container">
          <div className="error-message">{error}</div>
          <button onClick={loadAnalyticsData} className="retry-btn">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-dashboard">
      <header className="dashboard-header">
        <h1>Analytics Dashboard</h1>
        <div className="user-info">
          <span>Welcome, {user?.fullName}</span>
          <button onClick={() => navigate('/authority/dashboard')}>Back to Dashboard</button>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <div className="dashboard-content">
        {/* Metrics Cards */}
        <div className="metrics-grid">
          <div className="metric-card">
            <div className="metric-icon">📊</div>
            <div className="metric-content">
              <h3>{summary?.totalComplaints || 0}</h3>
              <p>Total Complaints</p>
              <span className="metric-period">Last 30 days</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">✅</div>
            <div className="metric-content">
              <h3>{summary?.resolved || 0}</h3>
              <p>Resolved Issues</p>
              <span className="metric-period">{calculateResolutionRate()}% resolution rate</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">⏳</div>
            <div className="metric-content">
              <h3>{summary?.pending || 0}</h3>
              <p>Pending Issues</p>
              <span className="metric-period">Awaiting action</span>
            </div>
          </div>

          <div className="metric-card">
            <div className="metric-icon">⚡</div>
            <div className="metric-content">
              <h3>{formatResolutionTime(summary?.avgResolutionHours)}</h3>
              <p>Avg Resolution Time</p>
              <span className="metric-period">For resolved issues</span>
            </div>
          </div>
        </div>

        {/* Heatmap Section */}
        <div className="heatmap-section">
          <div className="section-header">
            <h2>Complaint Heatmap</h2>
            <p>Geographic distribution of complaints (Last 7 days)</p>
          </div>
          <div className="heatmap-container">
            <AnalyticsHeatmap data={heatmapData} />
          </div>
        </div>

        {/* Additional Insights */}
        <div className="insights-grid">
          {/* Daily Trend */}
          {summary?.dailyTrend && summary.dailyTrend.length > 0 && (
            <div className="insight-card">
              <h3>Daily Trend (Last 7 days)</h3>
              <div className="trend-list">
                {summary.dailyTrend.map((day, index) => (
                  <div key={index} className="trend-item">
                    <span className="trend-date">{new Date(day.date).toLocaleDateString()}</span>
                    <span className="trend-count">{day.complaints} complaints</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Categories */}
          {summary?.topCategories && summary.topCategories.length > 0 && (
            <div className="insight-card">
              <h3>Top Categories</h3>
              <div className="category-list">
                {summary.topCategories.map((category, index) => (
                  <div key={index} className="category-item">
                    <span className="category-name">{category.category}</span>
                    <span className="category-count">{category.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <div className="refresh-section">
          <button onClick={loadAnalyticsData} className="refresh-btn">
            🔄 Refresh Data
          </button>
          <span className="last-updated">Last updated: {new Date().toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;