import React, { useState, useEffect, useRef } from 'react';
import { analyticsAPI } from '../services/api';
import HeatmapFilters from './HeatmapFilters.jsx';
import './ComplaintHeatmap.css';

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
  
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const heatLayerRef = useRef(null);
  const isInitializedRef = useRef(false);

  const defaultCenter = [11.1271, 78.6569];
  const defaultZoom = 7;

  const cleanupMap = () => {
    if (heatLayerRef.current && mapInstanceRef.current) {
      try {
        mapInstanceRef.current.removeLayer(heatLayerRef.current);
      } catch (e) {
        console.warn('Error removing heat layer:', e);
      }
      heatLayerRef.current = null;
    }
    
    if (mapInstanceRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch (e) {
        console.warn('Error removing map:', e);
      }
      mapInstanceRef.current = null;
    }
    
    if (mapContainerRef.current) {
      mapContainerRef.current.innerHTML = '';
    }
    
    isInitializedRef.current = false;
  };

  const initializeMap = async () => {
    if (isInitializedRef.current || !mapContainerRef.current) {
      return;
    }

    try {
      if (!window.L) {
        await loadLeaflet();
      }

      mapContainerRef.current.innerHTML = '';
      
      const map = window.L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: defaultZoom,
        zoomControl: true
      });

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);

      mapInstanceRef.current = map;
      isInitializedRef.current = true;
      
      loadHeatmapData();
      
    } catch (error) {
      console.error('Map initialization failed:', error);
      setError('Failed to initialize map');
    }
  };

  const loadLeaflet = () => {
    return new Promise((resolve, reject) => {
      if (window.L) {
        resolve();
        return;
      }

      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => {
        loadHeatPlugin().then(resolve).catch(reject);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  };

  const loadHeatPlugin = () => {
    return new Promise((resolve) => {
      if (window.L && window.L.heatLayer) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
      script.onload = resolve;
      script.onerror = () => {
        if (window.L) {
          window.L.heatLayer = function(points) {
            const group = window.L.layerGroup();
            points.forEach(point => {
              const intensity = point[2] || 0.5;
              const marker = window.L.circleMarker([point[0], point[1]], {
                radius: Math.max(3, intensity * 15),
                fillColor: intensity > 0.7 ? '#ff0000' : intensity > 0.4 ? '#ff8800' : '#0088ff',
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
    if (!mapInstanceRef.current) return;
    
    setLoading(true);
    setError('');
    
    try {
      const zoom = mapInstanceRef.current.getZoom();
      const response = await analyticsAPI.getHeatmapData({ ...filters, zoom });
      
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

  const updateHeatLayer = () => {
    if (!mapInstanceRef.current || !window.L || !heatmapData.length) return;

    if (heatLayerRef.current) {
      try {
        mapInstanceRef.current.removeLayer(heatLayerRef.current);
      } catch (e) {
        console.warn('Error removing layer:', e);
      }
    }

    const heatPoints = heatmapData.map(cluster => [
      cluster.lat,
      cluster.lng,
      Math.min(cluster.count / 10, 1)
    ]);

    const heatLayer = window.L.heatLayer(heatPoints, {
      radius: 25,
      blur: 15,
      maxZoom: 17
    });

    heatLayer.addTo(mapInstanceRef.current);
    heatLayerRef.current = heatLayer;

    if (heatPoints.length > 0) {
      const bounds = window.L.latLngBounds(heatPoints.map(p => [p[0], p[1]]));
      mapInstanceRef.current.fitBounds(bounds.pad(0.1));
    }
  };

  useEffect(() => {
    loadCategories();
    initializeMap();
    
    return () => {
      cleanupMap();
    };
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current) {
      loadHeatmapData();
    }
  }, [filters]);

  useEffect(() => {
    updateHeatLayer();
  }, [heatmapData]);

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
  };

  const handleRetry = () => {
    cleanupMap();
    setTimeout(() => {
      initializeMap();
    }, 100);
  };

  if (error && !mapInstanceRef.current) {
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
            <p>Loading heatmap...</p>
          </div>
        )}
        
        <div 
          ref={mapContainerRef}
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

export default ClusteredHeatmap;
// trigger rebuild
