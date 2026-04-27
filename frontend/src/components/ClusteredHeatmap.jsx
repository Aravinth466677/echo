import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import { analyticsAPI } from '../services/api';
import HeatmapFilters from './HeatmapFilters.jsx';
import MarkerLayer from './MarkerLayer';
import 'leaflet/dist/leaflet.css';
import './ComplaintHeatmap.css';

// Fix for default markers in react-leaflet
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const ClusteredHeatmap = () => {
  const [heatmapData, setHeatmapData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    categoryId: 'all',
    days: 7,
    status: 'all'
  });
  const [mapKey, setMapKey] = useState(0); // For forcing map re-render

  const defaultCenter = [11.1271, 78.6569]; // Tamil Nadu, India
  const defaultZoom = 7;

  useEffect(() => {
    loadCategories();
    loadHeatmapData();
  }, []);

  useEffect(() => {
    loadHeatmapData();
  }, [filters]);

  const loadCategories = async () => {
    try {
      const response = await analyticsAPI.getCategories();
      if (response.data.success) {
        setCategories(response.data.categories || []);
      }
    } catch (err) {
      console.error('Categories error:', err);
    }
  };

  const loadHeatmapData = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await analyticsAPI.getHeatmapData({ ...filters, zoom: defaultZoom });
      
      if (response.data.success) {
        setHeatmapData(response.data.clusters || []);
      } else {
        setError('No data available');
      }
    } catch (err) {
      console.error('Heatmap data error:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  // Transform backend data to marker format
  const transformedData = heatmapData.map(cluster => ({
    lat: cluster.lat,
    lng: cluster.lng,
    count: cluster.count // Use actual count instead of intensity
  }));

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleRetry = () => {
    setMapKey(prev => prev + 1); // Force map re-render
    loadHeatmapData();
  };

  if (error && heatmapData.length === 0) {
    return (
      <div className="heatmap-container">
        <div className="heatmap-error">
          <p>{error}</p>
          <button onClick={handleRetry} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="heatmap-wrapper">
      <HeatmapFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        categories={categories}
        loading={loading}
      />
      
      <div className="heatmap-container">
        {loading && (
          <div className="heatmap-loading">
            <div className="spinner"></div>
            <p>Loading complaint locations...</p>
          </div>
        )}
        
        <MapContainer
          key={mapKey}
          center={defaultCenter}
          zoom={defaultZoom}
          style={{ height: '500px', width: '100%' }}
          className="heatmap-map"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          />
          
          {!loading && transformedData.length > 0 && (
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
          )}
        </MapContainer>
        
        {!loading && heatmapData.length === 0 && (
          <div className="heatmap-empty">
            <p>No complaints for selected filters</p>
          </div>
        )}
        
        {!loading && heatmapData.length > 0 && (
          <div className="heatmap-info">
            <p>{heatmapData.reduce((sum, cluster) => sum + cluster.count, 0)} complaints in {heatmapData.length} locations</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClusteredHeatmap;
