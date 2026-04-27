import React, { useEffect, useRef } from 'react';

const AnalyticsHeatmap = ({ data }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const heatLayerRef = useRef(null);

  useEffect(() => {
    // Load Leaflet dynamically
    const loadLeaflet = async () => {
      if (typeof window === 'undefined') return;

      // Load Leaflet CSS
      if (!document.querySelector('link[href*="leaflet.css"]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
      }

      // Load Leaflet JS
      if (!window.L) {
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }

      // Load Leaflet Heatmap plugin
      if (!window.L.heatLayer) {
        await new Promise((resolve) => {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js';
          script.onload = resolve;
          document.head.appendChild(script);
        });
      }

      initializeMap();
    };

    loadLeaflet();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (mapInstanceRef.current && window.L && data.length > 0) {
      updateHeatmap();
    }
  }, [data]);

  const initializeMap = () => {
    if (!mapRef.current || !window.L) return;

    // Default center (can be adjusted based on your region)
    const defaultCenter = [40.7128, -74.0060]; // New York City
    const defaultZoom = 10;

    // Create map
    mapInstanceRef.current = window.L.map(mapRef.current).setView(defaultCenter, defaultZoom);

    // Add tile layer
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 18
    }).addTo(mapInstanceRef.current);

    // Initialize heatmap if data exists
    if (data.length > 0) {
      updateHeatmap();
    }
  };

  const updateHeatmap = () => {
    if (!mapInstanceRef.current || !window.L.heatLayer || data.length === 0) return;

    // Remove existing heat layer
    if (heatLayerRef.current) {
      mapInstanceRef.current.removeLayer(heatLayerRef.current);
    }

    // Create new heat layer
    heatLayerRef.current = window.L.heatLayer(data, {
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
    }).addTo(mapInstanceRef.current);

    // Fit map to data bounds if we have data points
    if (data.length > 0) {
      const group = new window.L.featureGroup(data.map(point => 
        window.L.marker([point[0], point[1]])
      ));
      mapInstanceRef.current.fitBounds(group.getBounds().pad(0.1));
    }
  };

  return (
    <div className="heatmap-wrapper">
      <div 
        ref={mapRef} 
        className="heatmap-container"
        style={{ height: '400px', width: '100%', borderRadius: '8px' }}
      />
      {data.length === 0 && (
        <div className="heatmap-empty">
          <p>No complaint data available for the last 7 days</p>
        </div>
      )}
      {data.length > 0 && (
        <div className="heatmap-info">
          <p>{data.length} complaint locations shown</p>
        </div>
      )}
    </div>
  );
};

export default AnalyticsHeatmap;