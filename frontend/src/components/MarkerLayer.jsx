import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import './MarkerLayer.css';

const MarkerLayer = ({ points, options = {} }) => {
  const map = useMap();
  const markersRef = useRef([]);

  // Default options for the markers
  const defaultOptions = {
    showCount: true,
    minRadius: 15,
    maxRadius: 40,
    colors: {
      low: '#3388ff',     // Blue for low count (1-2)
      medium: '#ff8800',  // Orange for medium count (3-9) 
      high: '#ff0000'     // Red for high count (10+)
    },
    fitBounds: true,
    ...options
  };

  useEffect(() => {
    if (!map || !points || points.length === 0) {
      // Remove existing markers if no points
      clearMarkers();
      return;
    }

    // Clear existing markers
    clearMarkers();

    // Convert points to marker format
    const markerData = points.map(point => {
      if (Array.isArray(point)) {
        // [lat, lng, intensity] format
        return {
          lat: point[0],
          lng: point[1],
          count: Math.round((point[2] || 0.5) * 10) // Convert intensity back to count
        };
      }
      
      // Object format { lat, lng, intensity/count }
      return {
        lat: point.lat || point.latitude,
        lng: point.lng || point.longitude || point.lon,
        count: point.count || Math.round((point.intensity || 0.5) * 10)
      };
    }).filter(point => 
      // Filter out invalid points
      point.lat != null && 
      point.lng != null && 
      !isNaN(point.lat) && 
      !isNaN(point.lng)
    );

    if (markerData.length === 0) {
      return;
    }

    // Create markers for each point
    markerData.forEach(point => {
      const count = Math.max(1, point.count); // Ensure minimum count of 1
      
      // Determine color based on count
      let color = defaultOptions.colors.low;
      if (count >= 10) {
        color = defaultOptions.colors.high;
      } else if (count >= 3) {
        color = defaultOptions.colors.medium;
      }

      // Calculate radius based on count
      const radius = Math.min(
        defaultOptions.maxRadius,
        Math.max(defaultOptions.minRadius, defaultOptions.minRadius + (count * 2))
      );

      // Create custom marker with count
      const marker = L.circleMarker([point.lat, point.lng], {
        radius: radius,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      });

      // Add count label if enabled
      if (defaultOptions.showCount) {
        const countLabel = L.divIcon({
          className: 'complaint-count-label',
          html: `<div style="
            background: ${color};
            color: white;
            border: 2px solid white;
            border-radius: 50%;
            width: ${Math.max(24, radius)}px;
            height: ${Math.max(24, radius)}px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: ${count > 99 ? '10px' : count > 9 ? '12px' : '14px'};
            box-shadow: 0 2px 4px rgba(0,0,0,0.3);
          ">${count > 99 ? '99+' : count}</div>`,
          iconSize: [Math.max(24, radius), Math.max(24, radius)],
          iconAnchor: [Math.max(12, radius/2), Math.max(12, radius/2)]
        });

        const countMarker = L.marker([point.lat, point.lng], { 
          icon: countLabel,
          zIndexOffset: 1000 // Ensure labels appear on top
        });

        // Add popup with details
        const popupContent = `
          <div style="text-align: center; padding: 5px;">
            <strong>${count} Complaint${count > 1 ? 's' : ''}</strong><br>
            <small>Location: ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</small>
          </div>
        `;
        
        countMarker.bindPopup(popupContent);
        countMarker.addTo(map);
        markersRef.current.push(countMarker);
      } else {
        // Just add the circle marker with popup
        const popupContent = `
          <div style="text-align: center; padding: 5px;">
            <strong>${count} Complaint${count > 1 ? 's' : ''}</strong><br>
            <small>Location: ${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</small>
          </div>
        `;
        
        marker.bindPopup(popupContent);
        marker.addTo(map);
        markersRef.current.push(marker);
      }
    });

    // Auto-fit bounds if requested
    if (defaultOptions.fitBounds && markerData.length > 0) {
      const bounds = L.latLngBounds(markerData.map(point => [point.lat, point.lng]));
      map.fitBounds(bounds.pad(0.1));
    }

  }, [map, points, options]);

  const clearMarkers = () => {
    markersRef.current.forEach(marker => {
      if (map && marker) {
        map.removeLayer(marker);
      }
    });
    markersRef.current = [];
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearMarkers();
    };
  }, [map]);

  // This component doesn't render anything visible
  return null;
};

export default MarkerLayer;