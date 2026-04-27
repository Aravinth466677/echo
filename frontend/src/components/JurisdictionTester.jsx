import React, { useState } from 'react';
import api from '../services/api';

const JurisdictionTester = () => {
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const testCoordinates = async () => {
    if (!latitude || !longitude) {
      alert('Please enter both latitude and longitude');
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      console.log('Testing coordinates:', { latitude, longitude });
      
      const response = await api.get('/api/jurisdictions/test-point', {
        params: { lat: latitude, lon: longitude }
      });
      
      console.log('Test result:', response.data);
      setResult(response.data);
    } catch (error) {
      console.error('Test failed:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);
      setResult({ error: error.response?.data?.error || error.message || 'Failed to test coordinates' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', border: '1px solid #ddd', borderRadius: '8px', margin: '20px 0' }}>
      <h3>🔍 Jurisdiction Coordinate Tester</h3>
      <p style={{ color: '#666', fontSize: '14px' }}>
        Test if complaint coordinates fall within any jurisdiction polygon
      </p>

      <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
        <input
          type="number"
          step="any"
          placeholder="Latitude (e.g., 10.656299)"
          value={latitude}
          onChange={(e) => setLatitude(e.target.value)}
          style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <input
          type="number"
          step="any"
          placeholder="Longitude (e.g., 78.744611)"
          value={longitude}
          onChange={(e) => setLongitude(e.target.value)}
          style={{ flex: 1, padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
        />
        <button
          onClick={testCoordinates}
          disabled={loading}
          style={{
            padding: '8px 20px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          {loading ? 'Testing...' : 'Test'}
        </button>
      </div>

      {result && (
        <div style={{
          marginTop: '20px',
          padding: '15px',
          backgroundColor: result.found ? '#d4edda' : '#f8d7da',
          border: `1px solid ${result.found ? '#c3e6cb' : '#f5c6cb'}`,
          borderRadius: '4px'
        }}>
          {result.error ? (
            <p style={{ color: '#721c24', margin: 0 }}>{result.error}</p>
          ) : result.found ? (
            <>
              <h4 style={{ color: '#155724', margin: '0 0 10px 0' }}>✓ Jurisdiction Found</h4>
              <p><strong>Name:</strong> {result.jurisdiction.name}</p>
              <p><strong>ID:</strong> {result.jurisdiction.id}</p>
              <p><strong>Method:</strong> {result.method}</p>
              {result.distance && <p><strong>Distance:</strong> {result.distance}m</p>}
            </>
          ) : (
            <>
              <h4 style={{ color: '#721c24', margin: '0 0 10px 0' }}>✗ No Jurisdiction Found</h4>
              <p>This coordinate is not within any jurisdiction polygon.</p>
              {result.nearest && (
                <p><strong>Nearest:</strong> {result.nearest.name} ({result.nearest.distance}m away)</p>
              )}
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <strong>Quick Test Coordinates:</strong>
        <p style={{ fontSize: '12px', color: '#666', margin: '5px 0' }}>These are example coordinates from your complaints</p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '5px', flexWrap: 'wrap' }}>  
          <button
            type="button"
            onClick={() => { setLatitude('10.656299'); setLongitude('78.744611'); }}
            style={{ padding: '5px 10px', fontSize: '12px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px', background: 'white' }}
          >
            📍 Location 1: 10.656299, 78.744611
          </button>
          <button
            type="button"
            onClick={() => { setLatitude('11.412800'); setLongitude('78.712100'); }}
            style={{ padding: '5px 10px', fontSize: '12px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px', background: 'white' }}
          >
            📍 Location 2: 11.412800, 78.712100
          </button>
          <button
            type="button"
            onClick={() => { setLatitude('10.656432'); setLongitude('78.744612'); }}
            style={{ padding: '5px 10px', fontSize: '12px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px', background: 'white' }}
          >
            📍 Location 3: 10.656432, 78.744612
          </button>
        </div>
        <p style={{ fontSize: '11px', color: '#999', marginTop: '8px' }}>💡 Tip: Copy coordinates from complaint submission console logs</p>
      </div>
    </div>
  );
};

export default JurisdictionTester;
