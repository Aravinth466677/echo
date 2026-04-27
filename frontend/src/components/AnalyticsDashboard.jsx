import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import HeatmapLayer from 'react-leaflet-heatmap-layer';
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
      const [heatmapResponse, summaryResponse] = await Promise.all([
        analyticsAPI.getHeatmapData(),
        analyticsAPI.getSummary()
      ]);
      
      setHeatmapData(heatmapResponse.data.heatmapData || []);
      setSummary(summaryResponse.data.summary || {});
    } catch (err) {
      setError('Failed to load analytics data');
      console.error('Analytics error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className=\"analytics-loading\">Loading analytics...</div>;
  }

  if (error) {
    return <div className=\"analytics-error\">{error}</div>;
  }

  const formatResolutionTime = (hours) => {
    if (!hours) return 'N/A';
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24 * 10) / 10}d`;
  };

  return (
    <div className=\"analytics-dashboard\">\n      <h2>Analytics Dashboard</h2>\n      \n      {/* Metrics Cards */}\n      <div className=\"metrics-grid\">\n        <div className=\"metric-card\">\n          <h3>Total Complaints</h3>\n          <div className=\"metric-value\">{summary.totalComplaints || 0}</div>\n          <div className=\"metric-subtitle\">Last 7 days</div>\n        </div>\n        \n        <div className=\"metric-card\">\n          <h3>Resolved</h3>\n          <div className=\"metric-value\">{summary.resolvedCount || 0}</div>\n          <div className=\"metric-subtitle\">\n            {summary.totalComplaints > 0 \n              ? `${Math.round((summary.resolvedCount / summary.totalComplaints) * 100)}% resolved`\n              : '0% resolved'\n            }\n          </div>\n        </div>\n        \n        <div className=\"metric-card\">\n          <h3>Pending</h3>\n          <div className=\"metric-value\">{summary.pendingCount || 0}</div>\n          <div className=\"metric-subtitle\">\n            {summary.totalComplaints > 0 \n              ? `${Math.round((summary.pendingCount / summary.totalComplaints) * 100)}% pending`\n              : '0% pending'\n            }\n          </div>\n        </div>\n        \n        <div className=\"metric-card\">\n          <h3>Avg Resolution Time</h3>\n          <div className=\"metric-value\">{formatResolutionTime(summary.avgResolutionTime)}</div>\n          <div className=\"metric-subtitle\">Last 30 days</div>\n        </div>\n      </div>\n\n      {/* Heatmap */}\n      <div className=\"heatmap-section\">\n        <h3>Complaint Heatmap (Last 7 Days)</h3>\n        <div className=\"map-container\">\n          {heatmapData.length > 0 ? (\n            <MapContainer\n              center={[heatmapData[0].latitude, heatmapData[0].longitude]}\n              zoom={12}\n              style={{ height: '400px', width: '100%' }}\n            >\n              <TileLayer\n                url=\"https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png\"\n                attribution='&copy; <a href=\"https://www.openstreetmap.org/copyright\">OpenStreetMap</a> contributors'\n              />\n              <HeatmapLayer\n                points={heatmapData}\n                longitudeExtractor={point => point.longitude}\n                latitudeExtractor={point => point.latitude}\n                intensityExtractor={point => point.intensity}\n                radius={20}\n                blur={15}\n                maxZoom={18}\n              />\n            </MapContainer>\n          ) : (\n            <div className=\"no-data\">\n              <p>No complaint data available for heatmap</p>\n            </div>\n          )}\n        </div>\n      </div>\n    </div>\n  );\n};\n\nexport default AnalyticsDashboard;