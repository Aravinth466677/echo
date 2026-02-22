import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { complaintAPI } from '../services/api';
import './ReportIssue.css';

const ReportIssue = () => {
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [formData, setFormData] = useState({
    categoryId: '',
    latitude: null,
    longitude: null,
    description: '',
    evidenceType: 'photo',
    wardId: 1
  });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await complaintAPI.getCategories();
      console.log('Categories loaded:', response.data);
      setCategories(response.data.categories);
    } catch (error) {
      console.error('Failed to load categories:', error);
      setError('Failed to load categories. Please check if backend is running.');
    }
  };

  const getCurrentLocation = () => {
    setLoading(true);
    setError('');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setFormData({
            ...formData,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          });
          setLoading(false);
        },
        (error) => {
          setError('Unable to get location. Please enable GPS or enter manually.');
          setLoading(false);
        }
      );
    } else {
      setError('Geolocation is not supported. Please enter location manually.');
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      const fileType = selectedFile.type.startsWith('image/') ? 'photo' : 'video';
      setFile(selectedFile);
      setFormData({ ...formData, evidenceType: fileType });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const submitData = new FormData();
    submitData.append('categoryId', formData.categoryId);
    submitData.append('latitude', formData.latitude);
    submitData.append('longitude', formData.longitude);
    submitData.append('description', formData.description);
    submitData.append('evidenceType', formData.evidenceType);
    submitData.append('wardId', formData.wardId);
    submitData.append('evidence', file);

    try {
      await complaintAPI.submit(submitData);
      alert('Complaint submitted successfully!');
      navigate('/citizen/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit complaint');
      setLoading(false);
    }
  };

  return (
    <div className="report-issue">
      <header className="report-header">
        <h1>Report New Issue</h1>
        <button onClick={() => navigate('/citizen/dashboard')}>Back to Dashboard</button>
      </header>

      <div className="report-content">
        <div className="progress-bar">
          <div className={`step ${step >= 1 ? 'active' : ''}`}>
            <div className="step-number">1</div>
            <span>Category</span>
          </div>
          <div className="step-divider"></div>
          <div className={`step ${step >= 2 ? 'active' : ''}`}>
            <div className="step-number">2</div>
            <span>Location</span>
          </div>
          <div className="step-divider"></div>
          <div className={`step ${step >= 3 ? 'active' : ''}`}>
            <div className="step-number">3</div>
            <span>Evidence</span>
          </div>
        </div>

        {step === 1 && (
          <div className="step-content">
            <h2>Select Issue Category</h2>
            <p>Choose the type of civic issue you want to report</p>
            
            {error && <div className="error">{error}</div>}
            
            {categories.length === 0 ? (
              <p style={{textAlign: 'center', padding: '40px', color: '#666'}}>
                Loading categories... If this persists, check if backend is running on port 5000.
              </p>
            ) : (
              <div className="category-grid">
                {categories.map((cat) => (
                  <div
                    key={cat.id}
                    className={`category-card ${formData.categoryId === cat.id ? 'selected' : ''}`}
                    onClick={() => setFormData({ ...formData, categoryId: cat.id })}
                  >
                    <h3>{cat.name}</h3>
                    <p>{cat.description}</p>
                  </div>
                ))}
              </div>
            )}
            
            {formData.categoryId && (
              <button 
                className="location-btn" 
                style={{marginTop: '30px'}}
                onClick={() => setStep(2)}
              >
                Continue to Location
              </button>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="step-content">
            <h2>Capture Location</h2>
            <p>We need your GPS location to report the issue accurately</p>
            
            <button 
              className="location-btn"
              onClick={getCurrentLocation}
              disabled={loading}
            >
              {loading ? 'Getting Location...' : 'Use My Current Location'}
            </button>
            
            <div className="divider">OR</div>
            
            <div className="manual-location">
              <h3>Enter Location Manually</h3>
              <div className="input-row">
                <div className="input-group">
                  <label>Latitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g., 12.9716"
                    value={formData.latitude || ''}
                    onChange={(e) => setFormData({ ...formData, latitude: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="input-group">
                  <label>Longitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g., 77.5946"
                    value={formData.longitude || ''}
                    onChange={(e) => setFormData({ ...formData, longitude: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </div>
            
            {formData.latitude && formData.longitude && (
              <>
                <p className="location-info">
                  Location set: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
                </p>
                <button 
                  className="location-btn" 
                  style={{marginTop: '20px'}}
                  onClick={() => setStep(3)}
                >
                  Continue to Evidence
                </button>
              </>
            )}
            {error && <div className="error">{error}</div>}
          </div>
        )}

        {step === 3 && (
          <div className="step-content">
            <h2>Upload Evidence</h2>
            <p>Provide photo or video evidence of the issue</p>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Photo or Video (Required)</label>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  required
                />
                {file && <p style={{marginTop: '8px', color: '#28a745', fontSize: '14px'}}>Selected: {file.name}</p>}
              </div>

              <div className="form-group">
                <label>Description (Optional)</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows="4"
                  placeholder="Add any additional details about the issue..."
                />
              </div>

              {error && <div className="error">{error}</div>}

              <button type="submit" disabled={loading || !file}>
                {loading ? 'Submitting...' : 'Submit Complaint'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportIssue;
