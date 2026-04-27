import React from 'react';
import { MapContainer, TileLayer } from 'react-leaflet';
import MarkerLayer from './MarkerLayer';
import 'leaflet/dist/leaflet.css';

// Fix for default markers in react-leaflet
import L from 'leaflet';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const AnalyticsHeatmap = ({ data }) => {
  // Default center (Tamil Nadu, India - adjust as needed)
  const defaultCenter = [11.1271, 78.6569];
  const defaultZoom = 7;

  // Transform data to marker format if needed
  const transformedData = data?.map(point => {
    if (Array.isArray(point)) {
      // Already in [lat, lng, intensity] format - convert to object
      return {
        lat: point[0],
        lng: point[1],
        count: Math.round((point[2] || 0.5) * 10) // Convert intensity back to count
      };
    }
    
    // Transform from backend format to marker format
    return {
      lat: point.latitude || point.lat,
      lng: point.longitude || point.lng || point.lon,
      count: point.count || Math.round((point.intensity || 0.5) * 10)
    };
  }) || [];

  return (
    <div className="heatmap-wrapper">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        style={{ height: '400px', width: '100%', borderRadius: '8px' }}
        className="heatmap-container"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={18}
        />
        
        {transformedData.length > 0 && (
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
      
      {transformedData.length === 0 && (
        <div className="heatmap-empty">
          <p>No complaint data available for the last 7 days</p>
        </div>
      )}
      
      {transformedData.length > 0 && (
        <div className="heatmap-info">
          <p>{transformedData.reduce((sum, item) => sum + item.count, 0)} complaints in {transformedData.length} locations</p>
        </div>
      )}
    </div>
  );
};

export default AnalyticsHeatmap;