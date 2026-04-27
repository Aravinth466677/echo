import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import MarkerLayer from './MarkerLayer';
import { analyticsAPI } from '../services/api';
import './AnalyticsDashboard.css';

const AnalyticsDashboard = () => {
  const [heatmapData, setHeatmapData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    setError('');
    
    try {
      // Use the same API endpoints as the heatmap components
      const [heatmapResponse, summaryResponse] = await Promise.all([
        analyticsAPI.getHeatmapData({ days: 7, categoryId: 'all', status: 'all' }),
        analyticsAPI.getSummary()
      ]);
      
      // Handle the response format from heatmap API
      if (heatmapResponse.data.success) {
        setHeatmapData(heatmapResponse.data.clusters || []);
      } else {
        setHeatmapData([]);
      }
      
      setSummary(summaryResponse.data.summary || {});
    } catch (err) {
      setError('Failed to load analytics data');
      console.error('Analytics error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="analytics-loading">Loading analytics...</div>;
  }

  if (error) {
    return <div className="analytics-error">{error}</div>;
  }

  const formatResolutionTime = (hours) => {
    if (!hours) return 'N/A';
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24 * 10) / 10}d`;
  };

  // Transform heatmap data to marker format
  const transformedData = heatmapData.map(cluster => ({
    lat: cluster.lat,
    lng: cluster.lng,
    count: cluster.count
  }));

  // Default center for Tamil Nadu, India
  const defaultCenter = [11.1271, 78.6569];
  const mapCenter = transformedData.length > 0 
    ? [transformedData[0].lat, transformedData[0].lng] 
    : defaultCenter;

  return (
    <div className="analytics-dashboard">
      <h2>Analytics Dashboard</h2>
      
      {/* Metrics Cards */}
      <div className="metrics-grid">
        <div className="metric-card">
          <h3>Total Complaints</h3>
          <div className="metric-value">{summary.totalComplaints || 0}</div>
          <div className="metric-subtitle">Last 7 days</div>
        </div>
        
        <div className="metric-card">
          <h3>Resolved</h3>
          <div className="metric-value">{summary.resolvedCount || 0}</div>
          <div className="metric-subtitle">
            {summary.totalComplaints > 0 
              ? `${Math.round((summary.resolvedCount / summary.totalComplaints) * 100)}% resolved`
              : '0% resolved'
            }
          </div>
        </div>
        
        <div className="metric-card">
          <h3>Pending</h3>
          <div className="metric-value">{summary.pendingCount || 0}</div>
          <div className="metric-subtitle">
            {summary.totalComplaints > 0 
              ? `${Math.round((summary.pendingCount / summary.totalComplaints) * 100)}% pending`
              : '0% pending'
            }
          </div>
        </div>
        
        <div className="metric-card">
          <h3>Avg Resolution Time</h3>
          <div className="metric-value">{formatResolutionTime(summary.avgResolutionTime)}</div>
          <div className="metric-subtitle">Last 30 days</div>
        </div>
      </div>

      {/* Complaint Locations Map */}
      <div className="heatmap-section">
        <h3>Complaint Locations (Last 7 Days)</h3>
        <div className="map-container">
          {transformedData.length > 0 ? (
            <MapContainer
              center={mapCenter}
              zoom={12}
              style={{ height: '400px', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              <MarkerLayer 
                points={transformedData}
                options={{
                  showCount: true,
                  minRadius: 15,
                  maxRadius: 40,
                  colors: {
                    low: '#3388ff',     // Blue for 1-2 complaints
                    medium: '#ff8800',  // Orange for 3-9 complaints
                    high: '#ff0000'     // Red for 10+ complaints
                  },
                  fitBounds: true
                }}
              />
            </MapContainer>
          ) : (
            <div className="no-data">
              <p>No complaint data available for the last 7 days</p>
            </div>
          )}
        </div>
        
        {transformedData.length > 0 && (
          <div className="map-legend">
            <h4>Complaint Count Legend</h4>
            <div className="legend-items">
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#3388ff', borderRadius: '50%', width: '16px', height: '16px' }}></div>
                <span>1-2 complaints</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#ff8800', borderRadius: '50%', width: '16px', height: '16px' }}></div>
                <span>3-9 complaints</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#ff0000', borderRadius: '50%', width: '16px', height: '16px' }}></div>
                <span>10+ complaints</span>
              </div>
            </div>
            <p className="legend-note">Total: {transformedData.reduce((sum, item) => sum + item.count, 0)} complaints in {transformedData.length} locations</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;