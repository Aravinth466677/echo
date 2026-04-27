import React, { useState, useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './LocationPicker.css';

// Fix Leaflet default icon paths broken by webpack
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const MIN_ZOOM = 16;
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';

async function reverseGeocode(lat, lng) {
  const res = await fetch(
    `${NOMINATIM_URL}?lat=${lat}&lon=${lng}&format=json`,
    { headers: { 'Accept-Language': 'en' } }
  );
  if (!res.ok) throw new Error('Geocoding failed');
  return res.json();
}

function parseAddress(data) {
  const a = data.address || {};
  return {
    street: [a.road, a.house_number].filter(Boolean).join(' ') || '',
    area: a.suburb || a.neighbourhood || a.village || a.town || '',
    city: a.city || a.county || a.state_district || '',
    postcode: a.postcode || '',
    display: data.display_name || '',
  };
}

// Step constants
const STEP_MAP = 'map';
const STEP_DESCRIBE = 'describe';
const STEP_CONFIRM = 'confirm';

const LocationPicker = ({ initialLat, initialLng, onConfirm, onCancel }) => {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const isMountedRef = useRef(true);

  const [step, setStep] = useState(STEP_MAP);
  const [position, setPosition] = useState(
    initialLat && initialLng ? { lat: initialLat, lng: initialLng } : null
  );
  const [zoom, setZoom] = useState(initialLat ? MIN_ZOOM : 13);
  const [address, setAddress] = useState(null);
  const [addressError, setAddressError] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [geocoding, setGeocoding] = useState(false);
  const [landmark, setLandmark] = useState('');
  const [landmarkError, setLandmarkError] = useState(false);
  const [exactLocationConfirmed, setExactLocationConfirmed] = useState(false);

  const fetchAddress = useCallback(async (lat, lng) => {
    if (!isMountedRef.current) {
      return;
    }

    setGeocoding(true);
    setAddressError(false);
    try {
      const data = await reverseGeocode(lat, lng);
      if (!isMountedRef.current) {
        return;
      }
      setAddress(parseAddress(data));
      setManualAddress('');
    } catch {
      if (!isMountedRef.current) {
        return;
      }
      setAddressError(true);
      setAddress(null);
    } finally {
      if (isMountedRef.current) {
        setGeocoding(false);
      }
    }
  }, []);

  const placeMarker = useCallback((lat, lng, map) => {
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lng]);
    } else {
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      marker.on('dragend', (e) => {
        const { lat: newLat, lng: newLng } = e.target.getLatLng();
        setPosition({ lat: newLat, lng: newLng });
        fetchAddress(newLat, newLng);
      });
      markerRef.current = marker;
    }
    setPosition({ lat, lng });
    fetchAddress(lat, lng);
  }, [fetchAddress]);

  useEffect(() => {
    isMountedRef.current = true;

    if (mapInstanceRef.current) return;

    const center = initialLat && initialLng
      ? [initialLat, initialLng]
      : [20.5937, 78.9629]; // India center fallback

    const map = L.map(mapRef.current, { zoomControl: true }).setView(center, zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    map.on('zoomend', () => setZoom(map.getZoom()));

    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      placeMarker(lat, lng, map);
      if (map.getZoom() < MIN_ZOOM) {
        map.setView([lat, lng], MIN_ZOOM, { animate: false });
      }
    });

    mapInstanceRef.current = map;

    if (initialLat && initialLng) {
      placeMarker(initialLat, initialLng, map);
    }

    return () => {
      isMountedRef.current = false;
      markerRef.current?.off();
      map.off();
      map.stop();
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [initialLat, initialLng, placeMarker]);

  const handleProceed = () => {
    if (!position) return;
    if (zoom < MIN_ZOOM) {
      alert(`Please zoom in to at least level ${MIN_ZOOM} for precision. Current: ${zoom}`);
      mapInstanceRef.current?.setView([position.lat, position.lng], MIN_ZOOM, { animate: false });
      return;
    }
    setStep(STEP_DESCRIBE);
  };

  const handleDescribeProceed = () => {
    if (!landmark.trim()) {
      setLandmarkError(true);
      return;
    }
    setLandmarkError(false);
    setExactLocationConfirmed(false);
    setStep(STEP_CONFIRM);
  };

  const handleConfirm = () => {
    const resolvedAddress = address
      ? [address.street, address.area, address.city, address.postcode].filter(Boolean).join(', ')
      : manualAddress;

    onConfirm({
      latitude: position.lat,
      longitude: position.lng,
      address: resolvedAddress,
      landmark_note: landmark,
    });
  };

  const addressDisplay = address
    ? [address.street, address.area, address.city, address.postcode].filter(Boolean).join(', ')
    : manualAddress;

  return (
    <div className="lp-overlay">
      <div className="lp-modal">
        <div className="lp-header">
          <h3>Set Verified Location</h3>
          <div className="lp-steps">
            <span className={step === STEP_MAP ? 'active' : ''}>1. Pin</span>
            <span className={step === STEP_DESCRIBE ? 'active' : ''}>2. Describe</span>
            <span className={step === STEP_CONFIRM ? 'active' : ''}>3. Confirm</span>
          </div>
        </div>

        {step === STEP_MAP && (
          <>
            <p className="lp-hint">Click on the map to place a marker. Drag to refine. Zoom ≥ {MIN_ZOOM} required.</p>
            <div className="lp-map-wrap">
              <div ref={mapRef} className="lp-map" />
              {zoom < MIN_ZOOM && position && (
                <div className="lp-zoom-warn">⚠ Zoom in for better precision (current: {zoom})</div>
              )}
            </div>

            {position && (
              <div className="lp-address-box">
                {geocoding && <span className="lp-geocoding">Fetching address…</span>}
                {!geocoding && address && (
                  <>
                    {address.street && <div><strong>Street:</strong> {address.street}</div>}
                    {address.area && <div><strong>Area:</strong> {address.area}</div>}
                    {address.city && <div><strong>City:</strong> {address.city}</div>}
                    {address.postcode && <div><strong>Postcode:</strong> {address.postcode}</div>}
                  </>
                )}
                {!geocoding && addressError && (
                  <div className="lp-addr-error">
                    <span>Could not fetch address. Enter manually:</span>
                    <input
                      value={manualAddress}
                      onChange={e => setManualAddress(e.target.value)}
                      placeholder="Type address here…"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="lp-actions">
              <button className="lp-btn-secondary" onClick={onCancel}>Cancel</button>
              <button
                className="lp-btn-primary"
                disabled={!position || geocoding || (addressError && !manualAddress.trim())}
                onClick={handleProceed}
              >
                Next →
              </button>
            </div>
          </>
        )}

        {step === STEP_DESCRIBE && (
          <div className="lp-describe">
            <div className="lp-address-summary">
              <strong>📍 Address:</strong> {addressDisplay || 'Not available'}
            </div>
            <label>
              Landmark / Description <span className="lp-required">*</span>
              <textarea
                rows={3}
                value={landmark}
                onChange={e => { setLandmark(e.target.value); setLandmarkError(false); }}
                placeholder="e.g. Near main gate of City Hospital, behind the bus stop"
                className={landmarkError ? 'lp-input-error' : ''}
              />
              {landmarkError && <span className="lp-error-msg">This field is required.</span>}
            </label>
            <p className="lp-hint">Include building name, nearby reference, or directional hints.</p>
            <div className="lp-actions">
              <button className="lp-btn-secondary" onClick={() => setStep(STEP_MAP)}>← Back</button>
              <button className="lp-btn-primary" onClick={handleDescribeProceed}>Review →</button>
            </div>
          </div>
        )}

        {step === STEP_CONFIRM && (
          <div className="lp-confirm">
            <p className="lp-hint">Review the location before confirming.</p>
            <div className="lp-confirm-map-wrap">
              <ConfirmMap lat={position.lat} lng={position.lng} />
            </div>
            <div className="lp-confirm-details">
              <div><strong>Coordinates:</strong> {position.lat.toFixed(6)}, {position.lng.toFixed(6)}</div>
              <div><strong>Address:</strong> {addressDisplay || '—'}</div>
              <div><strong>Landmark / Note:</strong> {landmark}</div>
            </div>
            <label className="lp-confirm-check">
              <input
                type="checkbox"
                id="lp-exact-confirm"
                checked={exactLocationConfirmed}
                onChange={e => setExactLocationConfirmed(e.target.checked)}
              />
              This is the exact location
            </label>
            <div className="lp-actions">
              <button className="lp-btn-secondary" onClick={() => setStep(STEP_DESCRIBE)}>← Back</button>
              <button
                id="lp-confirm-btn"
                className="lp-btn-primary"
                disabled={!exactLocationConfirmed}
                onClick={handleConfirm}
              >
                Confirm Location
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Small static map for confirmation preview
const ConfirmMap = ({ lat, lng }) => {
  const ref = useRef(null);
  useEffect(() => {
    const map = L.map(ref.current, { zoomControl: false, dragging: false, scrollWheelZoom: false })
      .setView([lat, lng], MIN_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    L.marker([lat, lng]).addTo(map);
    return () => {
      map.off();
      map.stop();
      map.remove();
    };
  }, [lat, lng]);
  return <div ref={ref} className="lp-confirm-map" />;
};

export default LocationPicker;
