// GPS Accuracy Monitor Usage Examples

// ===== 1. SIMPLE USAGE =====

import GPSAccuracyMonitor from '../utils/GPSAccuracyMonitor';

// Quick usage - wait for 20m accuracy with 60s timeout
const getHighAccuracyLocation = async () => {
  try {
    const result = await GPSAccuracyMonitor.waitForAccuracy(20, 60000);
    console.log('Got high accuracy location:', result.position);
    console.log('Final accuracy:', result.accuracy + 'm');
    return result.position;
  } catch (error) {
    console.error('Failed to get accurate location:', error);
    // Handle fallback
  }
};

// ===== 2. ADVANCED USAGE WITH CALLBACKS =====

const advancedGPSMonitoring = () => {
  const monitor = new GPSAccuracyMonitor({
    targetAccuracy: 15,     // Want 15m accuracy
    maxWaitTime: 90000,     // Wait up to 90 seconds
    fallbackAccuracy: 50    // Accept 50m if timeout approaching
  });

  // Set up progress callback for UI updates
  monitor.onProgress = (progress) => {
    updateUI({
      status: progress.message,
      accuracy: progress.currentAccuracy,
      progress: progress.progress,
      elapsed: Math.round(progress.elapsed / 1000) + 's'
    });
  };

  // Set up update callback for real-time position
  monitor.onUpdate = (update) => {
    console.log(`Current: ${update.accuracy}m, Best: ${update.bestAccuracy}m`);
    // Update map marker position
    updateMapMarker(update.position);
  };

  return monitor.startMonitoring();
};

// ===== 3. REACT COMPONENT INTEGRATION =====

import React, { useState } from 'react';
import GPSAccuracyComponent, { useGPSAccuracy } from '../components/GPSAccuracyComponent';

const ReportIssueForm = () => {
  const [location, setLocation] = useState(null);
  const [showGPSMonitor, setShowGPSMonitor] = useState(false);

  const handleGPSSuccess = (result) => {
    setLocation({
      latitude: result.position.coords.latitude,
      longitude: result.position.coords.longitude,
      accuracy: result.position.coords.accuracy
    });
    setShowGPSMonitor(false);
  };

  const handleGPSTimeout = (result) => {
    // Offer to use best available location
    if (result.bestAccuracy < 100) {
      const useAnyway = window.confirm(
        `GPS timeout, but we got ${result.bestAccuracy}m accuracy. Use this location?`
      );
      if (useAnyway && result.bestPosition) {
        handleGPSSuccess({ position: result.bestPosition });
      }
    }
  };

  return (
    <div className="report-form">
      <h2>Report Issue</h2>
      
      {/* Location Section */}
      <div className="location-section">
        <h3>📍 Location</h3>
        
        {!location && !showGPSMonitor && (
          <div className="location-options">
            <button 
              onClick={() => setShowGPSMonitor(true)}
              className="btn btn-primary"
            >
              🎯 Get High-Accuracy GPS
            </button>
            <button 
              onClick={() => getCurrentPosition()}
              className="btn btn-secondary"
            >
              📍 Use Current Location
            </button>
          </div>
        )}
        
        {showGPSMonitor && (
          <GPSAccuracyComponent
            targetAccuracy={20}
            maxWaitTime={60000}
            onSuccess={handleGPSSuccess}
            onTimeout={handleGPSTimeout}
            onError={(error) => console.error('GPS Error:', error)}
            showProgress={true}
          />
        )}
        
        {location && (
          <div className="location-display">
            ✅ Location set with {Math.round(location.accuracy)}m accuracy
            <button 
              onClick={() => { setLocation(null); setShowGPSMonitor(true); }}
              className="btn btn-small"
            >
              🔄 Get Better Accuracy
            </button>
          </div>
        )}
      </div>
      
      {/* Rest of form... */}
    </div>
  );
};

// ===== 4. CUSTOM HOOK USAGE =====

const CustomGPSComponent = () => {
  const { 
    status, 
    position, 
    error, 
    startMonitoring, 
    stopMonitoring, 
    isMonitoring 
  } = useGPSAccuracy({
    targetAccuracy: 10,  // Very high accuracy
    maxWaitTime: 120000  // 2 minutes
  });

  return (
    <div>
      <div>Status: {status.message}</div>
      {status.currentAccuracy && (
        <div>Current Accuracy: {status.currentAccuracy}m</div>
      )}
      {!isMonitoring && !position && (
        <button onClick={startMonitoring}>Start GPS</button>
      )}
      {isMonitoring && (
        <button onClick={stopMonitoring}>Stop GPS</button>
      )}
      {position && (
        <div>✅ Got location: {position.coords.accuracy}m accuracy</div>
      )}
    </div>
  );
};

// ===== 5. INTEGRATION WITH COMPLAINT SUBMISSION =====

const submitComplaintWithAccurateGPS = async (complaintData) => {
  try {
    // Step 1: Get high-accuracy GPS
    console.log('🎯 Getting high-accuracy GPS location...');
    const gpsResult = await GPSAccuracyMonitor.waitForAccuracy(20, 60000);
    
    // Step 2: Prepare form data with accurate location
    const formData = new FormData();
    formData.append('latitude', gpsResult.position.coords.latitude);
    formData.append('longitude', gpsResult.position.coords.longitude);
    formData.append('gpsAccuracy', gpsResult.position.coords.accuracy);
    formData.append('locationMethod', 'high_accuracy_gps');
    
    // Add other complaint data
    Object.keys(complaintData).forEach(key => {
      formData.append(key, complaintData[key]);
    });
    
    // Step 3: Submit complaint
    const response = await fetch('/api/complaints/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const result = await response.json();
    
    if (result.validation?.confidence === 'HIGH') {
      console.log('✅ Complaint submitted with HIGH confidence!');
    }
    
    return result;
    
  } catch (error) {
    if (error.message?.includes('timeout')) {
      // Handle GPS timeout - offer alternatives
      const useManual = window.confirm(
        'GPS accuracy timeout. Would you like to select location manually on map?'
      );
      if (useManual) {
        // Show map picker
        return showMapPicker();
      }
    }
    throw error;
  }
};

// Export for use
export {
  getHighAccuracyLocation,
  advancedGPSMonitoring,
  submitComplaintWithAccurateGPS,
  ReportIssueForm,
  CustomGPSComponent
};