const pool = require('../config/database');
const SLAService = require('./slaService');

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

const findMatchingIssue = async (categoryId, latitude, longitude, userId, dbClient = null) => {
  const client = dbClient || await pool.connect();
  const shouldRelease = !dbClient;

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
    if (shouldRelease) {
      client.release();
    }
  }
};

const createNewIssue = async (
  categoryId,
  latitude,
  longitude,
  wardId,
  jurisdictionId = null,
  dbClient = null
) => {
  const client = dbClient || pool;
  
  // Calculate SLA deadline for the new issue
  const slaData = await SLAService.calculateSLADeadline(categoryId);
  
  const result = await client.query(
    `INSERT INTO issues (category_id, location, ward_id, echo_count, jurisdiction_id, sla_duration_hours, sla_deadline)
     VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, 1, $5, $6, $7)
     RETURNING id`,
    [categoryId, longitude, latitude, wardId, jurisdictionId, slaData.sla_duration_hours, slaData.sla_deadline]
  );
  
  console.log(`New issue ${result.rows[0].id} created with SLA deadline: ${slaData.sla_deadline}`);
  return result.rows[0].id;
};

const linkComplaintToIssue = async (issueId, dbClient = null) => {
  const client = dbClient || pool;
  await client.query(
    `UPDATE issues 
     SET echo_count = echo_count + 1,
         last_reported_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [issueId]
  );
};

/**
 * Re-route all complaints of an issue when priority threshold is crossed
 */
const rerouteIssueComplaints = async (issueId, categoryId, jurisdictionId, newEchoCount, dbClient = null) => {
  const client = dbClient || pool;
  
  try {
    console.log(`Re-routing issue ${issueId} complaints due to echo_count ${newEchoCount}`);
    
    // Get appropriate authority for new priority level
    const { findAuthority } = require('./complaintRoutingService');
    const { logComplaintReRouting } = require('./routingLoggerService');
    const authority = await findAuthority(categoryId, jurisdictionId, client, newEchoCount);
    
    if (!authority) {
      console.error('No authority found for re-routing');
      return;
    }
    
    // Get all complaints in this issue that need re-routing
    const complaintsResult = await client.query(
      `SELECT id, COALESCE(assigned_authority_id, assigned_to) as assigned_authority_id
       FROM complaints 
       WHERE issue_id = $1 AND status NOT IN ('resolved', 'rejected')`,
      [issueId]
    );
    
    // Update all complaints in this issue to new authority
    await client.query(
      `UPDATE complaints 
       SET assigned_authority_id = $1, 
           status = CASE WHEN status = 'submitted' THEN 'assigned' ELSE status END,
           updated_at = CURRENT_TIMESTAMP
       WHERE issue_id = $2 AND status NOT IN ('resolved', 'rejected')`,
      [authority.id, issueId]
    );
    
    // Log re-routing for each complaint
    for (const complaint of complaintsResult.rows) {
      await logComplaintReRouting({
        complaintId: complaint.id,
        issueId,
        oldAuthorityId: complaint.assigned_authority_id,
        newAuthorityId: authority.id,
        newAuthorityLevel: authority.authority_level,
        newAuthorityEmail: authority.email,
        newAuthorityName: authority.full_name || authority.email,
        newEchoCount,
        reason: 'RE_ROUTING'
      }, client);
    }
    
    console.log(`Re-routed issue ${issueId} (${complaintsResult.rows.length} complaints) to ${authority.authority_level}: ${authority.email}`);
  } catch (error) {
    console.error('Re-route issue complaints error:', error);
  }
};

module.exports = {
  findMatchingIssue,
  createNewIssue,
  linkComplaintToIssue,
  rerouteIssueComplaints
};
