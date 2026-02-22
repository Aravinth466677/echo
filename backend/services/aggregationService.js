const pool = require('../config/database');

/**
 * ECHO AGGREGATION LOGIC (RULE-BASED)
 * 
 * Steps:
 * 1. Check if user already reported same category in proximity (prevent duplicate echo)
 * 2. Find matching issues by:
 *    - Same category
 *    - Within spatial radius
 *    - Within time window
 * 3. If match found: link complaint to issue, increment echo_count
 * 4. If no match: create new issue with echo_count = 1
 */

const findMatchingIssue = async (categoryId, latitude, longitude, userId) => {
  const client = await pool.connect();
  
  try {
    // Get category aggregation rules
    const categoryResult = await client.query(
      `SELECT aggregation_radius_meters, aggregation_time_window_hours 
       FROM categories WHERE id = $1`,
      [categoryId]
    );
    
    if (categoryResult.rows.length === 0) {
      throw new Error('Invalid category');
    }
    
    const { aggregation_radius_meters, aggregation_time_window_hours } = categoryResult.rows[0];
    
    // Check if user already reported this category nearby (prevent duplicate echo)
    const duplicateCheck = await client.query(
      `SELECT c.id FROM complaints c
       JOIN issues i ON c.issue_id = i.id
       WHERE c.user_id = $1 
       AND i.category_id = $2
       AND i.status NOT IN ('resolved', 'rejected')
       AND ST_DWithin(
         i.location::geography,
         ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
         $5
       )`,
      [userId, categoryId, longitude, latitude, aggregation_radius_meters]
    );
    
    if (duplicateCheck.rows.length > 0) {
      return { isDuplicate: true, issueId: null };
    }
    
    // Find matching issue
    const matchResult = await client.query(
      `SELECT id, 
              ST_X(location::geometry) as lon,
              ST_Y(location::geometry) as lat
       FROM issues
       WHERE category_id = $1
       AND status IN ('pending', 'verified', 'in_progress')
       AND last_reported_at > NOW() - INTERVAL '1 hour' * $2
       AND ST_DWithin(
         location::geography,
         ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
         $5
       )
       ORDER BY ST_Distance(
         location::geography,
         ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
       )
       LIMIT 1`,
      [categoryId, aggregation_time_window_hours, longitude, latitude, aggregation_radius_meters]
    );
    
    if (matchResult.rows.length > 0) {
      return { isDuplicate: false, issueId: matchResult.rows[0].id };
    }
    
    return { isDuplicate: false, issueId: null };
    
  } finally {
    client.release();
  }
};

const createNewIssue = async (categoryId, latitude, longitude, wardId) => {
  const result = await pool.query(
    `INSERT INTO issues (category_id, location, ward_id, echo_count)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, 1)
     RETURNING id`,
    [categoryId, longitude, latitude, wardId]
  );
  
  return result.rows[0].id;
};

const linkComplaintToIssue = async (issueId) => {
  await pool.query(
    `UPDATE issues 
     SET echo_count = echo_count + 1,
         last_reported_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [issueId]
  );
};

module.exports = {
  findMatchingIssue,
  createNewIssue,
  linkComplaintToIssue
};
