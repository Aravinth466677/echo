import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';

const HeatmapLayer = ({ points, options = {} }) => {
  const map = useMap();
  const heatLayerRef = useRef(null);

  // Default options for the heatmap
  const defaultOptions = {
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
    },
    ...options
  };

  useEffect(() => {
    if (!map || !points || points.length === 0) {
      // Remove existing layer if no points
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    // Convert points to leaflet.heat format: [lat, lng, intensity]
    const heatPoints = points.map(point => {
      if (Array.isArray(point)) {
        // Already in [lat, lng, intensity] format
        return point;
      }
      
      // Convert from object format { lat, lng, intensity }
      return [
        point.lat || point.latitude,
        point.lng || point.longitude || point.lon,
        point.intensity || point.count || 0.5
      ];
    }).filter(point => 
      // Filter out invalid points
      point[0] != null && 
      point[1] != null && 
      !isNaN(point[0]) && 
      !isNaN(point[1])
    );

    if (heatPoints.length === 0) {
      // Remove existing layer if no valid points
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
      return;
    }

    // Remove existing heat layer
    if (heatLayerRef.current) {
      map.removeLayer(heatLayerRef.current);
    }

    // Create new heat layer
    heatLayerRef.current = L.heatLayer(heatPoints, defaultOptions);
    
    // Add to map
    heatLayerRef.current.addTo(map);

    // Auto-fit bounds if requested
    if (options.fitBounds !== false && heatPoints.length > 0) {
      const bounds = L.latLngBounds(heatPoints.map(point => [point[0], point[1]]));
      map.fitBounds(bounds.pad(0.1));
    }

  }, [map, points, options]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (heatLayerRef.current && map) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map]);

  // This component doesn't render anything visible
  return null;
};

export default HeatmapLayer;