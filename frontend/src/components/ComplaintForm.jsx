import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import LocationPicker from './LocationPicker.jsx';
import { complaintAPI } from '../services/api';
import './ComplaintForm.css';

const ComplaintForm = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Core state
  const [category, setCategory] = useState('');
  const [mode, setMode] = useState('NEARBY');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [image, setImage] = useState(null);
  const [description, setDescription] = useState('');

  // UI state
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [distance, setDistance] = useState(null);

  // Load categories on mount
  useEffect(() => {
    loadCategories();
  }, []);

  // Handle image preview
  useEffect(() => {
    if (!image) {
      setImagePreview('');
      return;
    }
    const url = URL.createObjectURL(image);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const loadCategories = async () => {
    try {
      const response = await complaintAPI.getCategories();
      setCategories(response.data?.categories || []);
    } catch (err) {
      setError('Failed to load categories');
    }
  };

  const getConfidenceLevel = (acc) => {
    if (!acc) return 'LOW';
    if (acc <= 10) return 'HIGH';
    if (acc <= 30) return 'MEDIUM';
    return 'LOW';
  };

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const getCurrentLocation = () => {
    setLoading(true);
    setError('');

    if (!navigator.geolocation) {
      setError('Geolocation not supported');
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude: lat, longitude: lng, accuracy: acc } = position.coords;
        setLatitude(lat);
        setLongitude(lng);
        setAccuracy(acc);
        setConfidence(getConfidenceLevel(acc));
        setUserLocation({ latitude: lat, longitude: lng });
        setLoading(false);
      },
      (err) => {
        setError('Unable to get location');
        setLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    setError('');
    setShowConfirmation(false);
    
    if (newMode === 'NEARBY') {
      getCurrentLocation();
    } else {
      // For remote, get user location for distance calculation
      if (!userLocation) {
        getCurrentLocation();
      }
      setLatitude(null);
      setLongitude(null);
      setAccuracy(null);
      setConfidence(null);
    }
  };

  const handleLocationSelect = (location) => {
    setLatitude(location.latitude);
    setLongitude(location.longitude);
    setShowLocationPicker(false);
    
    if (userLocation) {
      const dist = calculateDistance(
        userLocation.latitude, userLocation.longitude,
        location.latitude, location.longitude
      );
      setDistance(dist);
      setConfidence('LOW');
      
      if (dist > 2000) {
        setError('This location is far from you');
      }
      setShowConfirmation(true);
    }
  };

  const handleImageCapture = (event) => {
    const file = event.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setImage(file);
      setError('');
    }
  };

  const handleSubmit = async () => {
    setError('');

    // Validation
    if (!category) {
      setError('Category required');
      return;
    }
    if (!latitude || !longitude) {
      setError('Location required');
      return;
    }
    if (!image) {
      setError('Image required');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('categoryId', category);
      formData.append('latitude', latitude.toString());
      formData.append('longitude', longitude.toString());
      formData.append('description', description);
      formData.append('evidence', image);
      formData.append('reportMode', mode === 'NEARBY' ? 'in_place' : 'remote');
      formData.append('locationVerificationStatus', 'verified');
      formData.append('evidenceType', 'photo');
      
      if (userLocation) {
        formData.append('reporterLatitude', userLocation.latitude.toString());
        formData.append('reporterLongitude', userLocation.longitude.toString());
      }

      await complaintAPI.submit(formData);
      navigate('/citizen/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit complaint');
    } finally {
      setLoading(false);
    }
  };

  const selectedCategoryName = categories.find(c => c.id.toString() === category)?.name || '';

  return (
    <div className="complaint-form">
      <header className="complaint-header">
        <button onClick={() => navigate('/citizen/dashboard')} className="back-btn">
          ← Back
        </button>
        <h1>Report Issue</h1>
      </header>

      <div className="complaint-content">
        {error && <div className="error-message">{error}</div>}

        {/* Step 1: Category Selection */}
        <section className="form-section">
          <h2>Select Category</h2>
          <div className="category-grid">
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`category-card ${category === cat.id.toString() ? 'selected' : ''}`}
                onClick={() => setCategory(cat.id.toString())}
              >
                <h3>{cat.name}</h3>
                <p>{cat.description}</p>
              </button>
            ))}
          </div>
          {selectedCategoryName && (
            <div className="selected-info">Selected: {selectedCategoryName}</div>
          )}
        </section>

        {/* Step 2: Mode Selection */}
        {category && (
          <section className="form-section">
            <h2>Report Mode</h2>
            <div className="mode-toggle">
              <button
                className={`mode-btn ${mode === 'NEARBY' ? 'active' : ''}`}
                onClick={() => handleModeChange('NEARBY')}
              >
                Nearby
              </button>
              <button
                className={`mode-btn ${mode === 'REMOTE' ? 'active' : ''}`}
                onClick={() => handleModeChange('REMOTE')}
              >
                Remote
              </button>
            </div>
          </section>
        )}

        {/* Step 3: Location Handling */}
        {category && (
          <section className="form-section">
            <h2>Location</h2>
            
            {mode === 'NEARBY' ? (
              <div className="location-section">
                <p>Using your current GPS location</p>
                <button 
                  onClick={getCurrentLocation} 
                  disabled={loading}
                  className="location-btn"
                >
                  {loading ? 'Getting Location...' : 'Get Current Location'}
                </button>
                
                {accuracy && (
                  <div className="gps-info">
                    <div className="accuracy">Accuracy: {Math.round(accuracy)}m</div>
                    <div className={`confidence confidence-${confidence.toLowerCase()}`}>
                      Confidence: {confidence}
                    </div>
                  </div>
                )}
                
                {latitude && longitude && (
                  <div className="location-coords">
                    {latitude.toFixed(6)}, {longitude.toFixed(6)}
                  </div>
                )}
              </div>
            ) : (
              <div className="location-section">
                <p>Select the issue location on the map</p>
                <button 
                  onClick={() => setShowLocationPicker(true)}
                  className="location-btn"
                >
                  Choose Location on Map
                </button>
                
                {latitude && longitude && (
                  <>
                    <div className="location-coords">
                      {latitude.toFixed(6)}, {longitude.toFixed(6)}
                    </div>
                    {distance && (
                      <div className="distance-info">
                        Distance from you: {distance > 1000 ? 
                          `${(distance/1000).toFixed(1)}km` : 
                          `${Math.round(distance)}m`}
                      </div>
                    )}
                  </>
                )}
                
                {showConfirmation && (
                  <div className="confirmation-dialog">
                    <p>You are reporting at a different location. Confirm?</p>
                    <div className="confirmation-buttons">
                      <button onClick={() => setShowConfirmation(false)}>Cancel</button>
                      <button onClick={() => setShowConfirmation(false)}>Confirm</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* Step 4: Image Capture */}
        {category && (latitude && longitude) && (
          <section className="form-section">
            <h2>Capture Evidence</h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleImageCapture}
              style={{ display: 'none' }}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="camera-btn"
            >
              📷 {image ? 'Retake Photo' : 'Take Photo'}
            </button>
            
            {imagePreview && (
              <div className="image-preview">
                <img src={imagePreview} alt="Preview" />
              </div>
            )}
          </section>
        )}

        {/* Description */}
        {image && (
          <section className="form-section">
            <h2>Description</h2>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the issue..."
              rows={4}
              className="description-input"
            />
          </section>
        )}

        {/* Step 5: Submit */}
        {category && latitude && longitude && image && (
          <section className="form-section">
            <button 
              onClick={handleSubmit}
              disabled={loading}
              className="submit-btn"
            >
              {loading ? 'Submitting...' : 'Submit Complaint'}
            </button>
          </section>
        )}
      </div>

      {/* Location Picker Modal */}
      {showLocationPicker && (
        <LocationPicker
          initialLat={userLocation?.latitude}
          initialLng={userLocation?.longitude}
          onConfirm={handleLocationSelect}
          onCancel={() => setShowLocationPicker(false)}
        />
      )}
    </div>
  );
};

export default ComplaintForm;