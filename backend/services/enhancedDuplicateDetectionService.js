const pool = require('../config/database');

class EnhancedDuplicateDetectionService {
  // Category-specific merge radii (in meters)
  static CATEGORY_RADII = {
    'Pothole': 25,        // Road issues - very specific location
    'Streetlight': 15,    // Specific pole/fixture
    'Garbage': 50,        // Can be spread over area
    'Water Supply': 30,   // Pipe/connection specific
    'Drainage': 40,       // Can affect nearby area
    'Encroachment': 20,   // Property-specific
    'default': 50         // Default for unknown categories
  };

  // Distance-based confidence levels
  static getDistanceConfidence(distance) {
    if (distance <= 5) return { level: 'IDENTICAL', merge: true, confidence: 0.95 };
    if (distance <= 15) return { level: 'VERY_CLOSE', merge: true, confidence: 0.90 };
    if (distance <= 30) return { level: 'CLOSE', merge: true, confidence: 0.80 };
    if (distance <= 50) return { level: 'NEARBY', merge: true, confidence: 0.70 };
    if (distance <= 100) return { level: 'DISTANT', merge: true, confidence: 0.50 };
    return { level: 'SEPARATE', merge: false, confidence: 0.10 };
  }

  static async getCategoryRadius(categoryId, client = null) {
    const dbClient = client || pool;
    
    try {
      const result = await dbClient.query(
        'SELECT name, aggregation_radius_meters FROM categories WHERE id = $1',
        [categoryId]
      );
      
      if (result.rows.length > 0) {
        const category = result.rows[0];
        // Use database setting if available, otherwise use our smart defaults
        return category.aggregation_radius_meters || 
               this.CATEGORY_RADII[category.name] || 
               this.CATEGORY_RADII.default;
      }
      
      return this.CATEGORY_RADII.default;
    } catch (error) {
      console.error('Get category radius error:', error);
      return this.CATEGORY_RADII.default;
    }
  }

  static async smartSpatialDuplicate(categoryId, latitude, longitude, userId, timeWindowHours = 24, client = null) {
    const dbClient = client || pool;
    
    try {
      // Get category-specific radius
      const categoryRadius = await this.getCategoryRadius(categoryId, dbClient);
      
      // Use a larger search radius to find all nearby complaints, then filter smartly
      const searchRadius = Math.max(categoryRadius * 2, 150);
      
      const result = await dbClient.query(
        `SELECT c.id, c.user_id, c.created_at, c.description, c.validation_status,
                ST_Distance(c.location, ST_MakePoint($3, $2)::geography) as distance_meters,
                cat.name as category_name
         FROM complaints c
         JOIN categories cat ON c.category_id = cat.id
         WHERE c.category_id = $1
           AND c.created_at > CURRENT_TIMESTAMP - ($5 * INTERVAL '1 hour')
           AND c.validation_status != 'DUPLICATE'
           AND ST_DWithin(
             c.location,
             ST_MakePoint($3, $2)::geography,
             $4
           )
         ORDER BY c.location <-> ST_MakePoint($3, $2)::geography
         LIMIT 10`,
        [categoryId, latitude, longitude, searchRadius, timeWindowHours]
      );

      const allNearby = result.rows;
      
      // Smart filtering based on distance and category
      const smartFiltered = allNearby.filter(complaint => {
        const distance = complaint.distance_meters;
        const confidence = this.getDistanceConfidence(distance);
        
        // Always include if within category radius
        if (distance <= categoryRadius) return true;
        
        // Include high-confidence matches even if outside category radius
        if (confidence.confidence >= 0.80) return true;
        
        return false;
      });

      const userDuplicate = smartFiltered.find(d => d.user_id === userId);
      
      // Analyze the matches
      const analysis = this.analyzeMatches(smartFiltered, categoryRadius);
      
      return {
        hasDuplicates: smartFiltered.length > 0,
        userAlreadyReported: !!userDuplicate,
        categoryRadius,
        searchRadius,
        nearbyComplaints: smartFiltered.map(d => ({
          id: d.id,
          userId: d.user_id,
          createdAt: d.created_at,
          distance: Math.round(d.distance_meters),
          confidence: this.getDistanceConfidence(d.distance_meters),
          description: d.description?.substring(0, 100) + (d.description?.length > 100 ? '...' : ''),
          shouldMerge: d.distance_meters <= categoryRadius
        })),
        closestComplaint: smartFiltered[0] || null,
        analysis,
        allNearbyCount: allNearby.length,
        smartFilteredCount: smartFiltered.length
      };
    } catch (error) {
      console.error('Smart spatial duplicate check error:', error);
      return {
        hasDuplicates: false,
        userAlreadyReported: false,
        nearbyComplaints: [],
        closestComplaint: null,
        error: error.message
      };
    }
  }

  static analyzeMatches(matches, categoryRadius) {
    if (matches.length === 0) {
      return {
        recommendation: 'CREATE_NEW',
        reason: 'No nearby complaints found',
        confidence: 'HIGH'
      };
    }

    const closest = matches[0];
    const distance = closest.distance_meters;
    const distanceConfidence = this.getDistanceConfidence(distance);

    if (distance <= 5) {
      return {
        recommendation: 'IDENTICAL_LOCATION',
        reason: `Essentially same location (${Math.round(distance)}m apart)`,
        confidence: 'VERY_HIGH',
        action: 'MERGE'
      };
    }

    if (distance <= categoryRadius / 2) {
      return {
        recommendation: 'DEFINITE_MERGE',
        reason: `Very close to existing complaint (${Math.round(distance)}m apart)`,
        confidence: 'HIGH',
        action: 'MERGE'
      };
    }

    if (distance <= categoryRadius) {
      return {
        recommendation: 'LIKELY_MERGE',
        reason: `Within category merge radius (${Math.round(distance)}m of ${categoryRadius}m)`,
        confidence: 'MEDIUM',
        action: 'MERGE'
      };
    }

    return {
      recommendation: 'CREATE_NEW',
      reason: `Outside merge radius (${Math.round(distance)}m > ${categoryRadius}m)`,
      confidence: 'MEDIUM',
      action: 'CREATE_NEW'
    };
  }

  static async findBestComplaintToLink(categoryId, latitude, longitude, userId, client = null) {
    const dbClient = client || pool;
    
    try {
      const duplicateCheck = await this.smartSpatialDuplicate(
        categoryId, latitude, longitude, userId, 24, dbClient
      );

      // Find the best complaint to link to (not from same user)
      const linkableComplaints = duplicateCheck.nearbyComplaints.filter(
        c => c.userId !== userId && c.shouldMerge
      );

      if (linkableComplaints.length === 0) return null;

      // Sort by confidence and distance
      linkableComplaints.sort((a, b) => {
        if (a.confidence.confidence !== b.confidence.confidence) {
          return b.confidence.confidence - a.confidence.confidence;
        }
        return a.distance - b.distance;
      });

      const bestMatch = linkableComplaints[0];
      
      // Get the issue_id for the best match
      const issueResult = await dbClient.query(
        'SELECT issue_id FROM complaints WHERE id = $1',
        [bestMatch.id]
      );

      return {
        complaintId: bestMatch.id,
        issueId: issueResult.rows[0]?.issue_id,
        distance: bestMatch.distance,
        confidence: bestMatch.confidence,
        analysis: duplicateCheck.analysis
      };
    } catch (error) {
      console.error('Find best complaint to link error:', error);
      return null;
    }
  }

  static async validateSmartDuplicateSubmission(categoryId, latitude, longitude, userId, client = null) {
    try {
      const duplicateCheck = await this.smartSpatialDuplicate(
        categoryId, latitude, longitude, userId, 24, client
      );

      // Check if user already reported
      if (duplicateCheck.userAlreadyReported) {
        const userComplaint = duplicateCheck.nearbyComplaints.find(c => c.userId === userId);
        return {
          isDuplicate: true,
          reason: 'USER_ALREADY_REPORTED',
          message: `You already reported this issue ${userComplaint.distance}m away`,
          existingComplaintId: userComplaint.id,
          duplicateCheck
        };
      }

      // Find best complaint to link to
      const bestLink = await this.findBestComplaintToLink(
        categoryId, latitude, longitude, userId, client
      );

      if (bestLink) {
        return {
          isDuplicate: false,
          shouldLink: true,
          linkToComplaintId: bestLink.complaintId,
          linkToIssueId: bestLink.issueId,
          message: `Linking to existing issue ${bestLink.distance}m away (${bestLink.confidence.level})`,
          confidence: bestLink.confidence,
          analysis: bestLink.analysis,
          duplicateCheck
        };
      }

      return {
        isDuplicate: false,
        shouldLink: false,
        message: duplicateCheck.analysis.reason,
        analysis: duplicateCheck.analysis,
        duplicateCheck
      };
    } catch (error) {
      console.error('Smart duplicate validation error:', error);
      return {
        isDuplicate: false,
        shouldLink: false,
        message: 'Duplicate check failed - proceeding with submission',
        error: error.message
      };
    }
  }

  // Test function for your specific coordinates
  static async testCoordinates(coord1, coord2, categoryId = 1) {
    console.log('=== SMART DUPLICATE DETECTION TEST ===');
    console.log(`Testing: ${coord1.lat}, ${coord1.lng} vs ${coord2.lat}, ${coord2.lng}`);
    
    try {
      const result = await this.smartSpatialDuplicate(
        categoryId, coord2.lat, coord2.lng, 999, 24
      );
      
      console.log('Category Radius:', result.categoryRadius + 'm');
      console.log('Search Radius:', result.searchRadius + 'm');
      console.log('Analysis:', result.analysis);
      console.log('Would merge:', result.analysis?.action === 'MERGE' ? '✅ YES' : '❌ NO');
      
      return result;
    } catch (error) {
      console.error('Test failed:', error);
    }
  }
}

module.exports = EnhancedDuplicateDetectionService;