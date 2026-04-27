// Distance Analysis Utility
class LocationAnalyzer {
  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // Distance in meters
  }

  static analyzeCoordinates(coord1, coord2) {
    const distance = this.calculateDistance(
      coord1.lat, coord1.lng,
      coord2.lat, coord2.lng
    );

    return {
      distance: Math.round(distance * 100) / 100, // Round to cm
      distanceFormatted: this.formatDistance(distance),
      shouldMerge: distance <= 100, // Current system threshold
      confidence: this.getMergeConfidence(distance),
      analysis: this.getDistanceAnalysis(distance)
    };
  }

  static formatDistance(meters) {
    if (meters < 1) {
      return `${Math.round(meters * 100)}cm`;
    } else if (meters < 1000) {
      return `${Math.round(meters * 10) / 10}m`;
    } else {
      return `${Math.round(meters / 100) / 10}km`;
    }
  }

  static getMergeConfidence(distance) {
    if (distance <= 10) return 'VERY_HIGH';
    if (distance <= 25) return 'HIGH';
    if (distance <= 50) return 'MEDIUM';
    if (distance <= 100) return 'LOW';
    return 'NONE';
  }

  static getDistanceAnalysis(distance) {
    if (distance <= 5) {
      return {
        category: 'IDENTICAL',
        description: 'Essentially the same location (GPS noise level)',
        action: 'Definitely merge'
      };
    } else if (distance <= 15) {
      return {
        category: 'VERY_CLOSE',
        description: 'Same building/structure or very close proximity',
        action: 'Should merge'
      };
    } else if (distance <= 30) {
      return {
        category: 'CLOSE',
        description: 'Same block or nearby locations',
        action: 'Likely merge'
      };
    } else if (distance <= 50) {
      return {
        category: 'NEARBY',
        description: 'Same area, possibly related issues',
        action: 'Consider merging'
      };
    } else if (distance <= 100) {
      return {
        category: 'DISTANT',
        description: 'Different locations but within merge radius',
        action: 'Merge with caution'
      };
    } else {
      return {
        category: 'SEPARATE',
        description: 'Different locations, should not merge',
        action: 'Do not merge'
      };
    }
  }

  // Test the specific coordinates you provided
  static testYourCoordinates() {
    const coord1 = { lat: 10.656265, lng: 78.744675 };
    const coord2 = { lat: 10.656510, lng: 78.744602 };

    console.log('=== COORDINATE ANALYSIS ===');
    console.log('Coordinate 1:', coord1);
    console.log('Coordinate 2:', coord2);
    
    const analysis = this.analyzeCoordinates(coord1, coord2);
    
    console.log('\n=== DISTANCE ANALYSIS ===');
    console.log('Distance:', analysis.distanceFormatted);
    console.log('Should Merge:', analysis.shouldMerge ? '✅ YES' : '❌ NO');
    console.log('Confidence:', analysis.confidence);
    console.log('Category:', analysis.analysis.category);
    console.log('Description:', analysis.analysis.description);
    console.log('Recommendation:', analysis.analysis.action);

    // Test with different merge radii
    console.log('\n=== MERGE RADIUS TESTING ===');
    const radii = [25, 50, 75, 100, 150];
    radii.forEach(radius => {
      const wouldMerge = analysis.distance <= radius;
      console.log(`${radius}m radius: ${wouldMerge ? '✅ MERGE' : '❌ NO MERGE'}`);
    });

    return analysis;
  }

  // Generate PostGIS query to test
  static generatePostGISQuery(coord1, coord2, radius = 100) {
    return `
-- Test if these coordinates would be detected as duplicates
SELECT 
  ST_Distance(
    ST_SetSRID(ST_MakePoint(${coord1.lng}, ${coord1.lat}), 4326)::geography,
    ST_SetSRID(ST_MakePoint(${coord2.lng}, ${coord2.lat}), 4326)::geography
  ) as distance_meters,
  ST_DWithin(
    ST_SetSRID(ST_MakePoint(${coord1.lng}, ${coord1.lat}), 4326)::geography,
    ST_SetSRID(ST_MakePoint(${coord2.lng}, ${coord2.lat}), 4326)::geography,
    ${radius}
  ) as would_merge_at_${radius}m;
    `;
  }
}

// Test your coordinates
const result = LocationAnalyzer.testYourCoordinates();

// Generate SQL for testing
console.log('\n=== POSTGIS TEST QUERY ===');
console.log(LocationAnalyzer.generatePostGISQuery(
  { lat: 10.656265, lng: 78.744675 },
  { lat: 10.656510, lng: 78.744602 }
));

module.exports = LocationAnalyzer;