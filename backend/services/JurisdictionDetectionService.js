const pool = require('../config/database');

/**
 * Production-grade jurisdiction detection with GPS error tolerance
 */
class JurisdictionDetectionService {
  
  /**
   * Detect jurisdiction with tolerance for GPS inaccuracy
   * @param {number} longitude 
   * @param {number} latitude 
   * @param {object} options - Detection options
   * @returns {object|null} Jurisdiction info or null
   */
  static async detectJurisdiction(longitude, latitude, options = {}) {
    const {
      toleranceRadius = 25, // meters
      fallbackRadius = 1000, // meters for nearest search
      maxResults = 5
    } = options;

    try {
      console.log(`🎯 Detecting jurisdiction for: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      
      // Step 1: Exact containment check
      const exactMatch = await this.findExactMatch(longitude, latitude);
      if (exactMatch) {
        console.log(`✓ Exact match: ${exactMatch.name}`);
        return exactMatch;
      }

      // Step 2: Tolerance-based search
      const toleranceMatch = await this.findWithTolerance(longitude, latitude, toleranceRadius);
      if (toleranceMatch) {
        console.log(`✓ Tolerance match: ${toleranceMatch.name} (${toleranceMatch.distance}m away)`);
        return toleranceMatch;
      }

      // Step 3: Fallback to nearest jurisdiction
      const nearestMatch = await this.findNearest(longitude, latitude, fallbackRadius, maxResults);
      if (nearestMatch) {
        console.log(`⚠ Fallback to nearest: ${nearestMatch.name} (${nearestMatch.distance}m away)`);
        return nearestMatch;
      }

      console.log('❌ No jurisdiction found within search radius');
      return null;

    } catch (error) {
      console.error('Jurisdiction detection error:', error);
      return null;
    }
  }

  /**
   * Check if point is exactly within any jurisdiction polygon
   */
  static async findExactMatch(longitude, latitude) {
    const result = await pool.query(`
      SELECT 
        id, 
        name,
        0 as distance,
        'exact' as match_type
      FROM jurisdictions 
      WHERE ST_Contains(
        boundary, 
        ST_SetSRID(ST_MakePoint($1, $2), 4326)
      )
      ORDER BY ST_Area(boundary) ASC
      LIMIT 1
    `, [longitude, latitude]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Find jurisdictions within tolerance radius using geography
   */
  static async findWithTolerance(longitude, latitude, toleranceRadius) {
    const result = await pool.query(`
      SELECT 
        id, 
        name,
        ROUND(
          ST_Distance(
            boundary::geography, 
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )
        ) as distance,
        'tolerance' as match_type
      FROM jurisdictions 
      WHERE ST_DWithin(
        boundary::geography, 
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
        $3
      )
      ORDER BY 
        ST_Distance(
          boundary::geography, 
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) ASC
      LIMIT 1
    `, [longitude, latitude, toleranceRadius]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Find nearest jurisdictions as fallback
   */
  static async findNearest(longitude, latitude, maxRadius, maxResults) {
    const result = await pool.query(`
      SELECT 
        id, 
        name,
        ROUND(
          ST_Distance(
            boundary::geography, 
            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
          )
        ) as distance,
        'nearest' as match_type
      FROM jurisdictions 
      WHERE ST_DWithin(
        boundary::geography, 
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
        $3
      )
      ORDER BY 
        ST_Distance(
          boundary::geography, 
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) ASC
      LIMIT $4
    `, [longitude, latitude, maxRadius, maxResults]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Get detailed jurisdiction info with boundary statistics
   */
  static async getJurisdictionDetails(jurisdictionId) {
    const result = await pool.query(`
      SELECT 
        id,
        name,
        ST_Area(boundary::geography) / 1000000 as area_sq_km,
        ST_XMin(boundary::geometry) as min_lon,
        ST_XMax(boundary::geometry) as max_lon,
        ST_YMin(boundary::geometry) as min_lat,
        ST_YMax(boundary::geometry) as max_lat,
        ST_AsGeoJSON(ST_Centroid(boundary)) as centroid
      FROM jurisdictions 
      WHERE id = $1
    `, [jurisdictionId]);

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Test multiple coordinates at once (useful for debugging)
   */
  static async testCoordinates(coordinates) {
    const results = [];
    
    for (const coord of coordinates) {
      const result = await this.detectJurisdiction(coord.longitude, coord.latitude);
      results.push({
        input: coord,
        result: result
      });
    }
    
    return results;
  }
}

module.exports = JurisdictionDetectionService;