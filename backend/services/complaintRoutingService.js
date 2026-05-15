const pool = require('../config/database');

/**
 * Complaint Routing Service - Updated for authorities table
 * Implements 3-level authority hierarchy routing
 */

/**
 * Detect jurisdiction from coordinates using PostGIS
 */
async function detectJurisdiction(longitude, latitude, dbClient = null) {
  try {
    const client = dbClient || pool;
    console.log(`Detecting jurisdiction for: Lon ${longitude}, Lat ${latitude}`);
    
    // Try exact match first
    const result = await client.query(
      `SELECT id, name FROM jurisdictions
       WHERE ST_Contains(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       ORDER BY area_sq_meters ASC
       LIMIT 1`,
      [longitude, latitude]
    );
    
    if (result.rows.length > 0) {
      console.log(`Jurisdiction found (exact): ${result.rows[0].name}`);
      return result.rows[0].id;
    }
    
    // Fallback to nearest within 5km (GPS inaccuracy)
    const nearestResult = await client.query(
      `SELECT id, name,
              ST_Distance(boundary::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance
       FROM jurisdictions
       WHERE ST_DWithin(boundary::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 5000)
       ORDER BY distance ASC
       LIMIT 1`,
      [longitude, latitude]
    );
    
    if (nearestResult.rows.length > 0) {
      console.log(`Jurisdiction found (nearest): ${nearestResult.rows[0].name}, Distance: ${nearestResult.rows[0].distance}m`);
      return nearestResult.rows[0].id;
    }
    
    console.log('No jurisdiction found within 5km');
    return null;
  } catch (error) {
    console.error('Detect jurisdiction error:', error);
    return null;
  }
}

/**
 * Find authority by level and filters - Updated for authorities table
 * Priority: JURISDICTION → DEPARTMENT → SUPER_ADMIN
 * NO echo count escalation - all complaints go through normal hierarchy
 * Time-based escalation happens later via SLA monitoring
 */
async function findAuthority(categoryId, jurisdictionId, dbClient = null, echoCount = 1) {
  try {
    const client = dbClient || pool;

    // Always use normal hierarchy - no echo count shortcuts
    console.log(`Normal routing (echo_count ${echoCount}): Standard hierarchy`);

    // Step 1: Try JURISDICTION authority
    if (jurisdictionId) {
      const jurisdictionAuth = await client.query(
        `SELECT id, email, authority_level, full_name
         FROM authorities
         WHERE category_id = $1 
         AND jurisdiction_id = $2
         AND authority_level = 'JURISDICTION'
         AND is_active = true
         LIMIT 1`,
        [categoryId, jurisdictionId]
      );
      
      if (jurisdictionAuth.rows.length > 0) {
        console.log(`Found JURISDICTION authority: ${jurisdictionAuth.rows[0].email}`);
        return jurisdictionAuth.rows[0];
      } else {
        console.log(`No JURISDICTION authority found for category ${categoryId}, jurisdiction ${jurisdictionId}`);
      }
    } else {
      console.log('No jurisdiction detected for this location');
    }
    
    // Step 2: Fallback to DEPARTMENT authority whenever a matching
    // jurisdiction authority is unavailable.
    {
      const departmentAuth = await client.query(
        `SELECT id, email, authority_level, full_name
         FROM authorities
         WHERE category_id = $1
         AND authority_level = 'DEPARTMENT'
         AND is_active = true
         LIMIT 1`,
        [categoryId]
      );
      
      if (departmentAuth.rows.length > 0) {
        console.log(`Found DEPARTMENT authority fallback: ${departmentAuth.rows[0].email}`);
        return departmentAuth.rows[0];
      } else {
        console.log(`No DEPARTMENT authority found for category ${categoryId}`);
      }
    }
    
    // Step 3: Fallback to SUPER_ADMIN
    const superAdmin = await client.query(
      `SELECT id, email, authority_level, full_name
       FROM authorities
       WHERE authority_level = 'SUPER_ADMIN'
       AND is_active = true
       LIMIT 1`
    );
    
    if (superAdmin.rows.length > 0) {
      console.log(`Found SUPER_ADMIN authority: ${superAdmin.rows[0].email}`);
      return superAdmin.rows[0];
    } else {
      console.log('No SUPER_ADMIN authority found');
    }
    
    console.log('No authority found at any level');
    return null;
  } catch (error) {
    console.error('Find authority error:', error);
    return null;
  }
}

/**
 * Route complaint to appropriate authority
 */
async function routeComplaint(
  complaintId,
  categoryId,
  longitude,
  latitude,
  options = {}
) {
  try {
    console.log(`Routing complaint ${complaintId}...`);

    const { dbClient = null, jurisdictionId: existingJurisdictionId = null, issueId = null, echoCount = 1 } = options;
    const client = dbClient || pool;

    // Detect jurisdiction only when it was not already resolved upstream.
    const jurisdictionId = existingJurisdictionId ?? await detectJurisdiction(longitude, latitude, client);
    console.log(`Jurisdiction detected: ${jurisdictionId || 'None'}`);
    
    console.log(`Issue echo count: ${echoCount}`);
    
    let routingReason = 'NORMAL'; // Default routing reason
    
    // Find appropriate authority with priority consideration
    const authority = await findAuthority(categoryId, jurisdictionId, client, echoCount);
    
    if (!authority) {
      console.error('No authority found for routing');
      return null;
    }
    
    // Determine routing reason - no echo count escalation
    if (!jurisdictionId && authority.authority_level === 'DEPARTMENT') {
      routingReason = 'NO_JURISDICTION';
    } else if (authority.authority_level === 'DEPARTMENT') {
      routingReason = 'NO_JURISDICTION_AUTHORITY';
    } else if (authority.authority_level === 'SUPER_ADMIN') {
      routingReason = 'NO_DEPARTMENT_AUTHORITY';
    }
    
    console.log(`Routing to ${authority.authority_level}: ${authority.email} (Reason: ${routingReason})`);
    
    // Assign complaint with routing reason
    const updateResult = await client.query(
      `UPDATE complaints 
       SET assigned_authority_id = $1,
           status = 'assigned',
           jurisdiction_id = $2,
           routing_reason = $3
       WHERE id = $4`,
      [authority.id, jurisdictionId, routingReason, complaintId]
    );

    if (updateResult.rowCount !== 1) {
      console.error(`Complaint ${complaintId} was not updated during routing`);
      return null;
    }
    
    return {
      authorityId: authority.id,
      authorityName: authority.full_name,
      authorityEmail: authority.email,
      authorityLevel: authority.authority_level,
      jurisdictionId,
      routingReason
    };
  } catch (error) {
    console.error('Route complaint error:', error);
    throw error;
  }
}

/**
 * Find next level authority for escalation
 */
async function findNextLevelAuthority(currentAuthorityId, categoryId) {
  try {
    // Get current authority level
    const current = await pool.query(
      `SELECT authority_level, category_id
       FROM authorities
       WHERE id = $1`,
      [currentAuthorityId]
    );
    
    if (current.rows.length === 0) return null;
    
    const currentLevel = current.rows[0].authority_level;
    
    // Escalation path: JURISDICTION → DEPARTMENT → SUPER_ADMIN
    if (currentLevel === 'JURISDICTION') {
      // Escalate to DEPARTMENT
      const dept = await pool.query(
        `SELECT id FROM authorities
         WHERE category_id = $1
         AND authority_level = 'DEPARTMENT'
         AND is_active = true
         LIMIT 1`,
        [categoryId]
      );
      return dept.rows[0]?.id || null;
    }
    
    if (currentLevel === 'DEPARTMENT') {
      // Escalate to SUPER_ADMIN
      const admin = await pool.query(
        `SELECT id FROM authorities
         WHERE authority_level = 'SUPER_ADMIN'
         AND is_active = true
         LIMIT 1`
      );
      return admin.rows[0]?.id || null;
    }
    
    return null; // Already at SUPER_ADMIN
  } catch (error) {
    console.error('Find next level authority error:', error);
    return null;
  }
}

/**
 * Escalate complaint to next authority level
 */
async function escalateComplaint(complaintId, reason = 'Auto-escalation: 48 hour timeout') {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const complaint = await client.query(
      `SELECT COALESCE(c.assigned_authority_id, c.assigned_to) as assigned_authority_id,
              c.category_id, c.escalation_level, c.issue_id
       FROM complaints c
       WHERE c.id = $1`,
      [complaintId]
    );
    
    if (complaint.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    
    const { assigned_authority_id, category_id, escalation_level, issue_id } = complaint.rows[0];
    
    // Find next authority
    const nextAuthorityId = await findNextLevelAuthority(assigned_authority_id, category_id);
    
    if (!nextAuthorityId) {
      console.log(`Complaint ${complaintId} already at highest level`);
      await client.query('ROLLBACK');
      return false;
    }
    
    // Get new authority details
    const newAuthorityResult = await client.query(
      `SELECT id, email, authority_level, full_name FROM authorities WHERE id = $1`,
      [nextAuthorityId]
    );
    
    if (newAuthorityResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    
    const newAuthority = newAuthorityResult.rows[0];
    
    // Update complaint - set status to 'assigned' not 'escalated'
    await client.query(
      `UPDATE complaints
       SET escalated_authority_id = $1,
           escalation_level = $2,
           escalated_at = CURRENT_TIMESTAMP,
           status = 'assigned',
           assigned_authority_id = $1,
           routing_reason = 'SLA_ESCALATION'
       WHERE id = $3`,
      [nextAuthorityId, (escalation_level || 0) + 1, complaintId]
    );
    
    // Update all complaints for the same issue to reflect new assignment
    if (issue_id) {
      await client.query(
        `UPDATE complaints
         SET assigned_authority_id = $1
         WHERE issue_id = $2 AND id != $3`,
        [nextAuthorityId, issue_id, complaintId]
      );
    }
    
    // Log the escalation as a new routing entry
    const { logComplaintRouting } = require('./routingLoggerService');
    
    // Get complaint context for logging
    const contextResult = await client.query(
      `SELECT c.category_id, cat.name as category_name,
              c.jurisdiction_id, j.name as jurisdiction_name,
              i.echo_count
       FROM complaints c
       LEFT JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN jurisdictions j ON c.jurisdiction_id = j.id
       LEFT JOIN issues i ON c.issue_id = i.id
       WHERE c.id = $1`,
      [complaintId]
    );
    
    const context = contextResult.rows[0] || {};
    
    await logComplaintRouting(
      {
        complaintId,
        issueId: issue_id,
        routedToUserId: nextAuthorityId,
        authorityLevel: newAuthority.authority_level,
        authorityEmail: newAuthority.email,
        authorityName: newAuthority.full_name,
        jurisdictionId: context.jurisdiction_id,
        jurisdictionName: context.jurisdiction_name,
        categoryId: context.category_id,
        categoryName: context.category_name,
        routingReason: 'SLA_ESCALATION',
        echoCount: context.echo_count || 1,
        additionalDetails: {
          escalationReason: reason,
          previousAuthorityId: assigned_authority_id,
          escalationLevel: (escalation_level || 0) + 1
        }
      },
      client
    );
    
    await client.query('COMMIT');
    console.log(`Complaint ${complaintId} escalated to authority ${nextAuthorityId} (${newAuthority.authority_level})`);
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Escalate complaint error:', error);
    return false;
  } finally {
    client.release();
  }
}

module.exports = {
  detectJurisdiction,
  findAuthority,
  routeComplaint,
  findNextLevelAuthority,
  escalateComplaint
};
