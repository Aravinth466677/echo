const JurisdictionDetectionService = require('../services/JurisdictionDetectionService');
const pool = require('../config/database');

/**
 * Detect jurisdiction from coordinates with GPS error tolerance
 */
const detectJurisdiction = async (req, res) => {
  try {
    const { latitude, longitude, accuracy } = req.body;

    // Validate input
    if (!latitude || !longitude) {
      return res.status(400).json({
        error: 'Latitude and longitude are required',
        received: { latitude, longitude }
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const acc = accuracy ? parseFloat(accuracy) : null;

    // Validate coordinate ranges
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        error: 'Invalid coordinate range',
        latitude: { value: lat, valid: lat >= -90 && lat <= 90 },
        longitude: { value: lng, valid: lng >= -180 && lng <= 180 }
      });
    }

    // Adjust tolerance based on GPS accuracy
    let toleranceRadius = 25; // default
    if (acc) {
      if (acc <= 10) toleranceRadius = 15;
      else if (acc <= 20) toleranceRadius = 25;
      else if (acc <= 50) toleranceRadius = 40;
      else toleranceRadius = 60;
    }

    console.log(`📍 Jurisdiction detection request: ${lat}, ${lng} (±${acc || 'unknown'}m) -> tolerance: ${toleranceRadius}m`);

    const jurisdiction = await JurisdictionDetectionService.detectJurisdiction(lng, lat, {
      toleranceRadius,
      fallbackRadius: Math.max(1000, (acc || 50) * 10), // Scale fallback with accuracy
      maxResults: 3
    });

    if (jurisdiction) {
      // Get additional details
      const details = await JurisdictionDetectionService.getJurisdictionDetails(jurisdiction.id);
      
      res.json({
        success: true,
        jurisdiction: {
          id: jurisdiction.id,
          name: jurisdiction.name,
          distance: jurisdiction.distance,
          matchType: jurisdiction.match_type,
          confidence: jurisdiction.match_type === 'exact' ? 'high' : 
                     jurisdiction.match_type === 'tolerance' ? 'medium' : 'low'
        },
        details: details,
        input: {
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          toleranceUsed: toleranceRadius
        }
      });
    } else {
      res.json({
        success: false,
        jurisdiction: null,
        message: 'No jurisdiction found within search radius',
        input: {
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          toleranceUsed: toleranceRadius
        },
        suggestions: [
          'Check if coordinates are within service area',
          'Verify GPS accuracy is reasonable',
          'Try moving to a more open area for better GPS signal'
        ]
      });
    }

  } catch (error) {
    console.error('Jurisdiction detection API error:', error);
    res.status(500).json({
      error: 'Internal server error during jurisdiction detection',
      details: error.message
    });
  }
};

/**
 * Test multiple coordinates (useful for debugging)
 */
const testCoordinates = async (req, res) => {
  try {
    const { coordinates } = req.body;

    if (!Array.isArray(coordinates)) {
      return res.status(400).json({
        error: 'coordinates must be an array of {latitude, longitude} objects'
      });
    }

    const results = await JurisdictionDetectionService.testCoordinates(
      coordinates.map(c => ({ latitude: c.latitude, longitude: c.longitude }))
    );

    res.json({
      success: true,
      results: results,
      summary: {
        total: results.length,
        found: results.filter(r => r.result !== null).length,
        notFound: results.filter(r => r.result === null).length
      }
    });

  } catch (error) {
    console.error('Test coordinates error:', error);
    res.status(500).json({
      error: 'Internal server error during coordinate testing',
      details: error.message
    });
  }
};

/**
 * Get all jurisdictions with basic info
 */
const getAllJurisdictions = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        ST_Area(boundary::geography) / 1000000 as area_sq_km,
        ST_XMin(boundary::geometry) as min_lon,
        ST_XMax(boundary::geometry) as max_lon,
        ST_YMin(boundary::geometry) as min_lat,
        ST_YMax(boundary::geometry) as max_lat
      FROM jurisdictions 
      ORDER BY name
    `);

    res.json({
      success: true,
      jurisdictions: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('Get jurisdictions error:', error);
    res.status(500).json({
      error: 'Failed to fetch jurisdictions',
      details: error.message
    });
  }
};

module.exports = {
  detectJurisdiction,
  testCoordinates,
  getAllJurisdictions
};