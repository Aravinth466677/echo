const pool = require('../config/database');

class DuplicateDetectionService {
  static async checkSpatialDuplicate(categoryId, latitude, longitude, userId, timeWindowHours = 24, radiusMeters = 100, client = null) {
    const dbClient = client || pool;
    
    try {
      const result = await dbClient.query(
        `SELECT c.id, c.user_id, c.created_at, c.description,
                ST_Distance(c.location::geography, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography) as distance_meters
         FROM complaints c
         WHERE c.category_id = $1
           AND c.created_at > CURRENT_TIMESTAMP - INTERVAL '${timeWindowHours} hours'
           AND ST_DWithin(
             c.location::geography,
             ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
             $4
           )
           AND c.validation_status != 'DUPLICATE'
         ORDER BY distance_meters ASC
         LIMIT 5`,
        [categoryId, latitude, longitude, radiusMeters]
      );

      const duplicates = result.rows;
      const userDuplicate = duplicates.find(d => d.user_id === userId);
      
      return {
        hasDuplicates: duplicates.length > 0,
        userAlreadyReported: !!userDuplicate,
        nearbyComplaints: duplicates.map(d => ({
          id: d.id,
          userId: d.user_id,
          createdAt: d.created_at,
          distance: Math.round(d.distance_meters),
          description: d.description?.substring(0, 100) + (d.description?.length > 100 ? '...' : '')
        })),
        closestComplaint: duplicates[0] || null
      };
    } catch (error) {
      console.error('Spatial duplicate check error:', error);
      return {
        hasDuplicates: false,
        userAlreadyReported: false,
        nearbyComplaints: [],
        closestComplaint: null,
        error: error.message
      };
    }
  }

  static async findExistingComplaintToLink(categoryId, latitude, longitude, userId, client = null) {
    const dbClient = client || pool;
    
    try {
      // Find the closest complaint that's not from the same user
      const result = await dbClient.query(
        `SELECT c.id, c.issue_id, c.user_id,
                ST_Distance(c.location::geography, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography) as distance_meters
         FROM complaints c
         WHERE c.category_id = $1
           AND c.user_id != $4
           AND c.created_at > CURRENT_TIMESTAMP - INTERVAL '24 hours'
           AND ST_DWithin(
             c.location::geography,
             ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
             100
           )
           AND c.validation_status != 'DUPLICATE'
         ORDER BY distance_meters ASC
         LIMIT 1`,
        [categoryId, latitude, longitude, userId]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Find existing complaint error:', error);
      return null;
    }
  }

  static async validateDuplicateSubmission(categoryId, latitude, longitude, userId, client = null) {
    try {
      const duplicateCheck = await this.checkSpatialDuplicate(
        categoryId, latitude, longitude, userId, 24, 100, client
      );

      if (duplicateCheck.userAlreadyReported) {
        return {
          isDuplicate: true,
          reason: 'USER_ALREADY_REPORTED',
          message: 'You have already reported this issue within the last 24 hours',
          existingComplaintId: duplicateCheck.closestComplaint?.id,
          duplicateCheck
        };
      }

      // Find existing complaint to potentially link to
      const existingComplaint = await this.findExistingComplaintToLink(
        categoryId, latitude, longitude, userId, client
      );

      if (existingComplaint) {
        return {
          isDuplicate: false,
          shouldLink: true,
          linkToComplaintId: existingComplaint.id,
          linkToIssueId: existingComplaint.issue_id,
          message: 'Similar complaint found - will be linked to existing issue',
          duplicateCheck
        };
      }

      return {
        isDuplicate: false,
        shouldLink: false,
        message: 'No duplicate found - will create new complaint',
        duplicateCheck
      };
    } catch (error) {
      console.error('Duplicate validation error:', error);
      return {
        isDuplicate: false,
        shouldLink: false,
        message: 'Duplicate check failed - proceeding with submission',
        error: error.message
      };
    }
  }
}

module.exports = DuplicateDetectionService;