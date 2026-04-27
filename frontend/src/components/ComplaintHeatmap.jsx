import React, { useState, useEffect, useRef } from 'react';
import { analyticsAPI } from '../services/api';
import HeatmapFilters from './HeatmapFilters.jsx';
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

const ComplaintHeatmap = () => {
  const [heatmapData, setHeatmapData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    categoryId: 'all',
    days: 7,
    status: 'all'
  });
  
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const heatLayerRef = useRef(null);
  const containerRef = useRef(null);

  // Default center for Tamil Nadu, India
  const defaultCenter = [11.1271, 78.6569];
  const defaultZoom = 7;

  useEffect(() => {
    loadCategories();
    initializeMap();
    
    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current) {
      loadHeatmapData();
    }
  }, [filters]);

  useEffect(() => {
    if (mapInstanceRef.current && heatmapData.length > 0) {
      updateHeatLayer();
    }
  }, [heatmapData]);

  const cleanup = () => {
    if (heatLayerRef.current && mapInstanceRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
    }
  };

  const initializeMap = async () => {
    if (mapInstanceRef.current || !containerRef.current) return;
    
    // Load leaflet.heat first
    await loadLeafletHeat();
    
    try {
      const map = L.map(containerRef.current).setView(defaultCenter, defaultZoom);
      
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      
      mapInstanceRef.current = map;
      loadHeatmapData();
    } catch (error) {
      console.error('Map initialization error:', error);
      setError('Failed to initialize map');
    }
  };

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
      const zoom = mapInstanceRef.current ? mapInstanceRef.current.getZoom() : defaultZoom;
      const response = await analyticsAPI.getHeatmapData({ ...filters, zoom });
      if (response.data.success) {
        setHeatmapData(response.data.clusters || []);
      } else {
        setError('Failed to load heatmap data');
      }
    } catch (err) {
      console.error('Heatmap data error:', err);
      setError('Failed to load heatmap');
    } finally {
      setLoading(false);
    }
  };

  const updateHeatLayer = () => {
    if (!mapInstanceRef.current || !window.L.heatLayer) return;

    // Remove existing heat layer
    if (heatLayerRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current);
      heatLayerRef.current = null;
    }

    // Convert clusters to heat layer format: [lat, lng, intensity]
    const heatPoints = heatmapData.map(cluster => [
      cluster.lat,
      cluster.lng,
      Math.min(cluster.count / 10, 1) // Scale intensity based on cluster size
    ]);

    // Create new heat layer
    const newHeatLayer = L.heatLayer(heatPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      gradient: {
        0.0: 'blue',
        0.2: 'cyan',
        0.4: 'lime',
        0.6: 'yellow',
        0.8: 'orange',
        1.0: 'red'
      }
    });

    newHeatLayer.addTo(mapInstanceRef.current);
    heatLayerRef.current = newHeatLayer;

    // Fit map to data bounds if we have points
    if (heatPoints.length > 0) {
      const group = new L.featureGroup(
        heatPoints.map(point => L.marker([point[0], point[1]]))
      );
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  };

  const loadLeafletHeat = () => {
    return new Promise((resolve, reject) => {
      if (window.L && window.L.heatLayer) {
        resolve();
        return;
      }

      // Try to load from CDN, fallback to inline implementation
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
      script.onload = resolve;
      script.onerror = () => {
        // Fallback: Simple inline heatmap implementation
        console.warn('CDN blocked, using fallback heatmap');
        if (window.L && !window.L.heatLayer) {
          // Minimal heatmap fallback - just show markers
          window.L.heatLayer = function(points, options) {
            const group = L.layerGroup();
            points.forEach(point => {
              const marker = L.circleMarker([point[0], point[1]], {
                radius: Math.max(5, (point[2] || 0.5) * 20),
                fillColor: point[2] > 0.7 ? 'red' : point[2] > 0.4 ? 'orange' : 'blue',
                fillOpacity: 0.6,
                stroke: false
              });
              group.addLayer(marker);
            });
            return group;
          };
        }
        resolve();
      };
      document.head.appendChild(script);
    });
  };

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  if (error) {
    return (
      <div className="heatmap-container">
        <div className="heatmap-error">
          <p>{error}</p>
          <button onClick={loadHeatmapData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="heatmap-wrapper">
      {/* Filters */}
      <HeatmapFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        categories={categories}
        loading={loading}
      />
      
      {/* Map Container */}
      <div className="heatmap-container">
        {loading && (
          <div className="heatmap-loading">
            <div className="spinner"></div>
            <p>Loading heatmap...</p>
          </div>
        )}
        
        <div 
          ref={containerRef}
          className="heatmap-map"
          style={{ height: '500px', width: '100%' }}
        />
        
        {!loading && heatmapData.length === 0 && (
          <div className="heatmap-empty">
            <p>No complaints for selected filters</p>
          </div>
        )}
        
        {!loading && heatmapData.length > 0 && (
          <div className="heatmap-info">
            <p>{heatmapData.reduce((sum, cluster) => sum + cluster.count, 0)} complaints in {heatmapData.length} clusters</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComplaintHeatmap;