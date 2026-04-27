import React, { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './InteractiveMap.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const reporterIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const issueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const MapClickHandler = ({ disabled, onLocationSelect }) => {
  const map = useMap();

  useEffect(() => {
    const handleClick = (event) => {
      if (disabled || !onLocationSelect) {
        return;
      }

      onLocationSelect({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    };

    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
    };
  }, [disabled, map, onLocationSelect]);

  return null;
};

const RecenterMap = ({ center }) => {
  const map = useMap();

  useEffect(() => {
    if (center) {
      map.setView(center);
    }
  }, [center, map]);

  return null;
};

const InteractiveMap = ({
  onLocationSelect,
  selectedLocation = null,
  reporterLocation = null,
  disabled = false,
  height = 320,
}) => {
  const initialCenter = useMemo(() => {
    if (selectedLocation) {
      return [selectedLocation.lat, selectedLocation.lng];
    }

    if (reporterLocation) {
      return [reporterLocation.lat, reporterLocation.lng];
    }

    return [17.385, 78.4867];
  }, [reporterLocation, selectedLocation]);

  return (
    <div className="interactive-map-shell">
      <MapContainer
        center={initialCenter}
        zoom={13}
        style={{ height: `${height}px`, width: '100%' }}
        className="interactive-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler disabled={disabled} onLocationSelect={onLocationSelect} />
        <RecenterMap center={initialCenter} />

        {reporterLocation && (
          <Marker position={[reporterLocation.lat, reporterLocation.lng]} icon={reporterIcon} />
        )}

        {selectedLocation && (
          <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={issueIcon} />
        )}
      </MapContainer>

      <div className="interactive-map-note">
        Click anywhere on the map to choose the issue location.
      </div>
    </div>
  );
};

export default InteractiveMap;
