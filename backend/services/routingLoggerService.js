const pool = require('../config/database');

const LEGACY_ROUTING_REASON_MAP = {
  NO_JURISDICTION_AUTHORITY: 'JURISDICTION_FALLBACK',
  NO_DEPARTMENT_AUTHORITY: 'SUPER_ADMIN_FALLBACK',
};

function normalizeRoutingReason(routingReason) {
  return LEGACY_ROUTING_REASON_MAP[routingReason] || routingReason || 'NORMAL';
}

async function logComplaintRouting(routingData, dbClient = null) {
  try {
    const client = dbClient || pool;

    const {
      complaintId,
      issueId,
      routedToUserId,
      authorityLevel,
      authorityEmail,
      authorityName,
      jurisdictionId,
      jurisdictionName,
      categoryId,
      categoryName,
      routingReason,
      echoCount = 1,
      additionalDetails = {},
    } = routingData;

    const normalizedRoutingReason = normalizeRoutingReason(routingReason);

    console.log(`Logging routing: Complaint ${complaintId} -> ${authorityLevel} (${authorityEmail})`);

    const result = await client.query(
      `INSERT INTO complaint_routing_logs (
        complaint_id, issue_id, routed_to_user_id, routed_to_authority_id, authority_level, authority_email, authority_name,
        jurisdiction_id, jurisdiction_name, category_id, category_name,
        routing_reason, echo_count, routing_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id`,
      [
        complaintId,
        issueId,
        null,
        routedToUserId,
        authorityLevel,
        authorityEmail,
        authorityName,
        jurisdictionId,
        jurisdictionName,
        categoryId,
        categoryName,
        normalizedRoutingReason,
        echoCount,
        JSON.stringify({
          ...additionalDetails,
          routedToAuthorityId: routedToUserId,
          originalRoutingReason: routingReason,
        }),
      ]
    );

    console.log(`Routing logged with ID: ${result.rows[0].id}`);
    return result.rows[0].id;
  } catch (error) {
    console.error('Failed to log complaint routing:', error);
    return null;
  }
}

async function logComplaintReRouting(reroutingData, dbClient = null) {
  try {
    const client = dbClient || pool;

    const {
      complaintId,
      issueId,
      oldAuthorityId,
      newAuthorityId,
      newAuthorityLevel,
      newAuthorityEmail,
      newAuthorityName,
      newEchoCount,
      reason = 'RE_ROUTING',
    } = reroutingData;

    const normalizedReason = normalizeRoutingReason(reason);

    console.log(
      `Logging re-routing: Complaint ${complaintId} -> ${newAuthorityLevel} (echo_count: ${newEchoCount})`
    );

    const contextResult = await client.query(
      `SELECT c.category_id, cat.name as category_name,
              c.jurisdiction_id, j.name as jurisdiction_name
       FROM complaints c
       LEFT JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN jurisdictions j ON c.jurisdiction_id = j.id
       WHERE c.id = $1`,
      [complaintId]
    );

    const context = contextResult.rows[0] || {};

    const result = await client.query(
      `INSERT INTO complaint_routing_logs (
        complaint_id, issue_id, routed_to_user_id, routed_to_authority_id, authority_level, authority_email, authority_name,
        jurisdiction_id, jurisdiction_name, category_id, category_name,
        routing_reason, echo_count, routing_details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id`,
      [
        complaintId,
        issueId,
        null,
        newAuthorityId,
        newAuthorityLevel,
        newAuthorityEmail,
        newAuthorityName,
        context.jurisdiction_id,
        context.jurisdiction_name,
        context.category_id,
        context.category_name,
        normalizedReason,
        newEchoCount,
        JSON.stringify({
          oldAuthorityId,
          newAuthorityId,
          reroutingTrigger: 'echo_count_threshold',
          originalRoutingReason: reason,
        }),
      ]
    );

    console.log(`Re-routing logged with ID: ${result.rows[0].id}`);
    return result.rows[0].id;
  } catch (error) {
    console.error('Failed to log complaint re-routing:', error);
    return null;
  }
}

async function getComplaintRoutingHistory(complaintId) {
  try {
    const result = await pool.query(
      `SELECT
        crl.id,
        crl.routed_at,
        crl.authority_level,
        crl.authority_email,
        crl.authority_name,
        crl.jurisdiction_name,
        crl.category_name,
        crl.routing_reason,
        crl.echo_count,
        crl.routing_details,
        a.full_name as authority_full_name
       FROM complaint_routing_logs crl
       LEFT JOIN authorities a ON COALESCE(crl.routed_to_authority_id, crl.routed_to_user_id) = a.id
       WHERE crl.complaint_id = $1
       ORDER BY crl.routed_at ASC`,
      [complaintId]
    );

    return result.rows;
  } catch (error) {
    console.error('Failed to get routing history:', error);
    return [];
  }
}

async function getIssueRoutingHistory(issueId) {
  try {
    const result = await pool.query(
      `SELECT
        crl.complaint_id,
        crl.routed_at,
        crl.authority_level,
        crl.authority_email,
        crl.authority_name,
        crl.routing_reason,
        crl.echo_count,
        c.is_primary,
        a.full_name as authority_full_name
       FROM complaint_routing_logs crl
       LEFT JOIN authorities a ON COALESCE(crl.routed_to_authority_id, crl.routed_to_user_id) = a.id
       LEFT JOIN complaints c ON crl.complaint_id = c.id
       WHERE crl.issue_id = $1
       ORDER BY crl.routed_at ASC`,
      [issueId]
    );

    return result.rows;
  } catch (error) {
    console.error('Failed to get issue routing history:', error);
    return [];
  }
}

async function getRoutingStatistics(filters = {}) {
  try {
    const { startDate = null, endDate = null, categoryId = null, jurisdictionId = null } = filters;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (startDate) {
      paramCount += 1;
      whereClause += ` AND crl.routed_at >= $${paramCount}`;
      params.push(startDate);
    }

    if (endDate) {
      paramCount += 1;
      whereClause += ` AND crl.routed_at <= $${paramCount}`;
      params.push(endDate);
    }

    if (categoryId) {
      paramCount += 1;
      whereClause += ` AND crl.category_id = $${paramCount}`;
      params.push(categoryId);
    }

    if (jurisdictionId) {
      paramCount += 1;
      whereClause += ` AND crl.jurisdiction_id = $${paramCount}`;
      params.push(jurisdictionId);
    }

    const result = await pool.query(
      `SELECT
        crl.authority_level,
        crl.routing_reason,
        COUNT(*) as count,
        AVG(crl.echo_count) as avg_echo_count
       FROM complaint_routing_logs crl
       ${whereClause}
       GROUP BY crl.authority_level, crl.routing_reason
       ORDER BY count DESC`,
      params
    );

    return result.rows;
  } catch (error) {
    console.error('Failed to get routing statistics:', error);
    return [];
  }
}

module.exports = {
  logComplaintRouting,
  logComplaintReRouting,
  getComplaintRoutingHistory,
  getIssueRoutingHistory,
  getRoutingStatistics,
};
