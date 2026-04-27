import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Popup, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { jurisdictionAPI } from '../services/api';
import { getStoredToken, getStoredUser } from '../utils/authStorage.js';
import './JurisdictionMap.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
  iconUrl: require('leaflet/dist/images/marker-icon.png'),
  shadowUrl: require('leaflet/dist/images/marker-shadow.png'),
});

const DrawControl = ({ onCreated, jurisdictionName }) => {
  const map = useMap();
  const drawnItemsRef = useRef(null);
  const drawControlRef = useRef(null);

  useEffect(() => {
    if (!map) return;

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      position: 'topright',
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          metric: true
        },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false
      },
      edit: {
        featureGroup: drawnItems,
        edit: false,
        remove: false
      }
    });
    map.addControl(drawControl);
    drawControlRef.current = drawControl;

    const handleCreated = (e) => {
      const layer = e.layer;
      onCreated(layer);
    };

    map.on(L.Draw.Event.CREATED, handleCreated);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      if (drawControlRef.current) {
        map.removeControl(drawControlRef.current);
      }
      if (drawnItemsRef.current) {
        map.removeLayer(drawnItemsRef.current);
      }
    };
  }, [map, onCreated]);

  return null;
};

const MapNavigator = ({ searchTarget }) => {
  const map = useMap();
  const previousTargetRef = useRef(null);

  useEffect(() => {
    if (!map || !searchTarget) {
      return;
    }

    const nextPosition = [searchTarget.latitude, searchTarget.longitude];
    const wasLiveLocationUpdate =
      previousTargetRef.current?.id === searchTarget.id && searchTarget.isLiveLocation;

    if (wasLiveLocationUpdate) {
      map.panTo(nextPosition, {
        animate: true,
        duration: 0.8
      });
    } else {
      map.flyTo(nextPosition, 15, {
        duration: 1.2
      });
    }

    previousTargetRef.current = searchTarget;
  }, [map, searchTarget]);

  return null;
};

const JurisdictionMap = () => {
  const [jurisdictions, setJurisdictions] = useState([]);
  const [newJurisdictionName, setNewJurisdictionName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchTarget, setSearchTarget] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [isLiveLocationActive, setIsLiveLocationActive] = useState(false);
  const liveLocationWatchRef = useRef(null);

  useEffect(() => {
    loadJurisdictions();
  }, []);

  useEffect(() => {
    return () => {
      if (liveLocationWatchRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(liveLocationWatchRef.current);
      }
    };
  }, []);

  const loadJurisdictions = async () => {
    try {
      const response = await jurisdictionAPI.getAll();
      setJurisdictions(response.data.jurisdictions);
    } catch (err) {
      setError('Failed to load jurisdictions');
    }
  };

  const handleCreated = async (layer) => {
    const geojson = layer.toGeoJSON();

    if (!newJurisdictionName.trim()) {
      alert('Please enter a jurisdiction name first');
      return;
    }

    // Check for polygon intersection with existing jurisdictions
    const newPolygon = L.polygon(layer.getLatLngs());
    let hasIntersection = false;
    let intersectingJurisdiction = '';

    for (const jurisdiction of jurisdictions) {
      const existingCoords = jurisdiction.boundary.coordinates[0].map(coord => [coord[1], coord[0]]);
      const existingPolygon = L.polygon(existingCoords);
      
      // Check if polygons intersect
      const newBounds = newPolygon.getBounds();
      const existingBounds = existingPolygon.getBounds();
      
      if (newBounds.intersects(existingBounds)) {
        // More precise check: check if any point of new polygon is inside existing
        const newLatLngs = layer.getLatLngs()[0];
        for (const point of newLatLngs) {
          if (existingPolygon.getBounds().contains(point)) {
            hasIntersection = true;
            intersectingJurisdiction = jurisdiction.name;
            break;
          }
        }
        
        // Check if any point of existing polygon is inside new
        if (!hasIntersection) {
          for (const point of existingCoords) {
            if (newPolygon.getBounds().contains(L.latLng(point[0], point[1]))) {
              hasIntersection = true;
              intersectingJurisdiction = jurisdiction.name;
              break;
            }
          }
        }
      }
      
      if (hasIntersection) break;
    }

    if (hasIntersection) {
      setError(`Polygon intersects with existing jurisdiction: ${intersectingJurisdiction}. Please draw a non-overlapping boundary.`);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const token = getStoredToken();
      const user = getStoredUser() || {};
      console.log('Creating jurisdiction with token:', token ? 'Present' : 'Missing');
      console.log('User role:', user.role);
      
      await jurisdictionAPI.create({
        name: newJurisdictionName.trim(),
        geojson: geojson.geometry
      });

      setNewJurisdictionName('');
      await loadJurisdictions();
    } catch (err) {
      console.error('Create jurisdiction error:', err);
      console.error('Error response status:', err.response?.status);
      console.error('Error response data:', err.response?.data);
      console.error('Error response headers:', err.response?.headers);
      const errorMsg = err.response?.data?.error || err.message || 'Failed to create jurisdiction';
      
      if (err.response?.status === 403) {
        const currentUser = getStoredUser() || {};
        setError(`Access denied. Current role: ${currentUser.role || 'unknown'}. Backend says: ${err.response.data.error}`);
      } else if (err.response?.status === 401) {
        setError('Session expired. Please logout and login again as admin.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const stopLiveLocationTracking = () => {
    if (liveLocationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(liveLocationWatchRef.current);
      liveLocationWatchRef.current = null;
    }

    setIsLocating(false);
    setIsLiveLocationActive(false);
  };

  const getGeolocationErrorMessage = (locationError) => {
    switch (locationError.code) {
      case locationError.PERMISSION_DENIED:
        return 'Location access was denied';
      case locationError.POSITION_UNAVAILABLE:
        return 'Current location is unavailable';
      case locationError.TIMEOUT:
        return 'Timed out while fetching current location';
      default:
        return 'Failed to fetch current location';
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();

    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setError('Enter a location name to search');
      return;
    }

    stopLiveLocationTracking();
    setIsSearching(true);
    setError('');

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=${encodeURIComponent(trimmedQuery)}`
      );

      if (!response.ok) {
        throw new Error('Location search failed');
      }

      const results = await response.json();

      if (!Array.isArray(results) || results.length === 0) {
        setSearchResults([]);
        setError('No matching locations found');
        return;
      }

      const formattedResults = results.map((result) => ({
        id: result.place_id,
        label: result.display_name,
        latitude: Number(result.lat),
        longitude: Number(result.lon)
      }));

      setSearchResults(formattedResults);
      setSearchTarget(formattedResults[0]);
    } catch (err) {
      setSearchResults([]);
      setError(err.message || 'Failed to search location');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = (result) => {
    stopLiveLocationTracking();
    setSearchTarget(result);
    setSearchQuery(result.label);
    setSearchResults([]);
    setError('');
  };

  const handleUseLiveLocation = () => {
    if (isLiveLocationActive || isLocating) {
      stopLiveLocationTracking();
      return;
    }

    if (!navigator.geolocation) {
      setError('Live location is not supported in this browser');
      return;
    }

    setIsLocating(true);
    setError('');
    setSearchResults([]);

    liveLocationWatchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setSearchTarget({
          id: 'live-location',
          label: 'Your location',
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: Math.round(position.coords.accuracy),
          isLiveLocation: true
        });
        setIsLocating(false);
        setIsLiveLocationActive(true);
        setError('');
      },
      (locationError) => {
        stopLiveLocationTracking();
        setError(getGeolocationErrorMessage(locationError));
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 1000
      }
    );
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this jurisdiction?')) return;

    try {
      await jurisdictionAPI.delete(id);
      await loadJurisdictions();
    } catch (err) {
      setError('Failed to delete jurisdiction');
    }
  };

  const getColor = (index) => {
    const colors = ['#3388ff', '#ff3838', '#38ff38', '#ff38ff', '#ffff38', '#38ffff'];
    return colors[index % colors.length];
  };

  return (
    <div className="jurisdiction-map-container">
      <div className="map-controls">
        <h3>Jurisdiction Boundary Management</h3>
        <form className="location-search" onSubmit={handleSearch}>
          <div className="search-row">
            <input
              type="text"
              placeholder="Search area, landmark, or address"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isSearching}
            />
            <button type="submit" disabled={isSearching}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            <button
              type="button"
              className={`live-location-button${isLiveLocationActive ? ' active' : ''}`}
              onClick={handleUseLiveLocation}
            >
              {isLocating ? 'Locating...' : isLiveLocationActive ? 'Stop Live Location' : 'Use Live Location'}
            </button>
          </div>
          <p className="hint">Search a location or use live location to move the map before drawing a jurisdiction</p>
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="search-result"
                  onClick={() => handleSelectSearchResult(result)}
                >
                  {result.label}
                </button>
              ))}
            </div>
          )}
        </form>
        <div className="control-group">
          <input
            type="text"
            placeholder="Enter jurisdiction name"
            value={newJurisdictionName}
            onChange={(e) => setNewJurisdictionName(e.target.value)}
            disabled={loading}
          />
          <p className="hint">Enter name, then draw polygon on map</p>
        </div>
        {error && <div className="error-message">{error}</div>}
      </div>

      <MapContainer
        center={[12.9716, 77.5946]}
        zoom={12}
        preferCanvas={true}
        style={{ height: '500px', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          maxZoom={18}
        />

        <MapNavigator searchTarget={searchTarget} />
        <DrawControl onCreated={handleCreated} jurisdictionName={newJurisdictionName} />

        {searchTarget && (
          <>
            <Marker position={[searchTarget.latitude, searchTarget.longitude]}>
              <Popup>
                <div>
                  <strong>{searchTarget.label}</strong>
                  {searchTarget.accuracy ? (
                    <p>Accuracy: about {searchTarget.accuracy} meters</p>
                  ) : null}
                </div>
              </Popup>
            </Marker>
            {searchTarget.isLiveLocation && searchTarget.accuracy ? (
              <Circle
                center={[searchTarget.latitude, searchTarget.longitude]}
                radius={searchTarget.accuracy}
                pathOptions={{ color: '#1f6feb', fillColor: '#1f6feb', fillOpacity: 0.12 }}
              />
            ) : null}
          </>
        )}

        {jurisdictions.map((jurisdiction, index) => {
          const coords = jurisdiction.boundary.coordinates[0].map(coord => [coord[1], coord[0]]);
          return (
            <Polygon
              key={jurisdiction.id}
              positions={coords}
              pathOptions={{ color: getColor(index), fillOpacity: 0.2 }}
            >
              <Popup>
                <div style={{ minWidth: '150px' }}>
                  <strong>{jurisdiction.name}</strong>
                  <p style={{ margin: '5px 0' }}>Area: {(jurisdiction.area_sq_meters / 1000000).toFixed(2)} km²</p>
                  <button 
                    onClick={() => handleDelete(jurisdiction.id)}
                    style={{
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      padding: '5px 10px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      width: '100%',
                      marginTop: '5px'
                    }}
                  >
                    Delete Jurisdiction
                  </button>
                </div>
              </Popup>
            </Polygon>
          );
        })}
      </MapContainer>

      <div className="jurisdiction-list">
        <h4>Existing Jurisdictions ({jurisdictions.length})</h4>
        <ul>
          {jurisdictions.map((j, index) => (
            <li key={j.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <span>
                <span style={{ color: getColor(index), fontSize: '20px', marginRight: '8px' }}>●</span>
                {j.name} ({(j.area_sq_meters / 1000000).toFixed(2)} km²)
              </span>
              <button 
                onClick={() => handleDelete(j.id)}
                style={{
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  padding: '4px 12px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default JurisdictionMap;
