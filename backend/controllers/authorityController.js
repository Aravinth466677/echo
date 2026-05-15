const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');
const { escalateComplaint } = require('../services/complaintRoutingService');
const notificationService = require('../services/notificationService');
const SLAService = require('../services/slaService');

const getIssueReportingMetadata = async (issueIds) => {
  if (!Array.isArray(issueIds) || issueIds.length === 0) {
    return new Map();
  }

  const result = await pool.query(
    `SELECT DISTINCT ON (c.issue_id)
       c.issue_id,
       COALESCE(c.report_mode, 'in_place') AS report_mode,
       COALESCE(c.trust_level, 'high') AS trust_level,
       COALESCE(c.distance_meters, 0) AS distance_meters,
       c.remote_justification,
       c.justification_type,
       c.reporter_latitude,
       c.reporter_longitude
     FROM complaints c
     WHERE c.issue_id = ANY($1::int[])
     ORDER BY
       c.issue_id,
       CASE WHEN COALESCE(c.report_mode, 'in_place') = 'in_place' THEN 0 ELSE 1 END,
       CASE COALESCE(c.trust_level, 'high')
         WHEN 'high' THEN 0
         WHEN 'medium' THEN 1
         WHEN 'low' THEN 2
         ELSE 3
       END,
       c.created_at ASC`,
    [issueIds]
  );

  return new Map(result.rows.map((row) => [row.issue_id, row]));
};

const getReportModePriority = (reportMode) => (reportMode === 'in_place' ? 0 : 1);

const getFallbackPriorityScore = (issue) => {
  let score = Number(issue?.echo_count || 0) * 10;

  if (issue?.is_sla_breached) {
    score += 1000;
  }

  return score;
};

const getSafeSLAStatus = async (issueId) => {
  try {
    return await SLAService.getSLAStatus(issueId);
  } catch (error) {
    console.error(`Failed to load SLA status for issue ${issueId}:`, error);
    return null;
  }
};

const getCurrentAssignmentMetadata = async (issueIds) => {
  if (!Array.isArray(issueIds) || issueIds.length === 0) {
    return new Map();
  }

  const result = await pool.query(
    `SELECT DISTINCT ON (c.issue_id)
       c.issue_id,
       COALESCE(c.assigned_authority_id, c.assigned_to) AS current_authority_id,
       a.full_name AS current_authority_name,
       a.authority_level AS current_authority_level
     FROM complaints c
     LEFT JOIN authorities a ON COALESCE(c.assigned_authority_id, c.assigned_to) = a.id
     WHERE c.issue_id = ANY($1::int[])
     ORDER BY c.issue_id, c.created_at DESC, c.id DESC`,
    [issueIds]
  );

  return new Map(result.rows.map((row) => [row.issue_id, row]));
};

const getAssignedIssues = async (scope, statuses, options = {}) => {
  const { userId, authorityLevel, categoryId } = scope;
  const params = [userId, statuses];
  let categoryClause = '';
  const includeHistoricalAssignments = options.includeHistoricalAssignments === true;

  if (authorityLevel === 'DEPARTMENT') {
    categoryClause = ' AND i.category_id = $3';
    params.push(categoryId);
  }

  const assignmentClause = includeHistoricalAssignments
    ? `AND (
          EXISTS (
            SELECT 1
            FROM complaints c
            WHERE c.issue_id = i.id
              AND COALESCE(c.assigned_authority_id, c.assigned_to) = $1
          )
          OR EXISTS (
            SELECT 1
            FROM complaint_routing_logs crl
            WHERE crl.issue_id = i.id
              AND COALESCE(crl.routed_to_authority_id, crl.routed_to_user_id) = $1
          )
        )`
    : `AND EXISTS (
          SELECT 1
          FROM complaints c
          WHERE c.issue_id = i.id
            AND COALESCE(c.assigned_authority_id, c.assigned_to) = $1
        )`;

  const result = await pool.query(
    `
      SELECT
        i.id,
        i.id AS issue_id,
        i.status AS issue_status,
        i.echo_count,
        i.first_reported_at,
        EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.first_reported_at)) / 3600 AS hours_open,
        cat.name AS category_name,
        CASE
          WHEN i.jurisdiction_id IS NULL THEN 'NO JURISDICTION'
          ELSE j.name
        END AS jurisdiction_name,
        ST_Y(i.location::geometry) AS latitude,
        ST_X(i.location::geometry) AS longitude,
        CASE
          WHEN i.jurisdiction_id IS NULL THEN true
          ELSE false
        END AS is_no_jurisdiction,
        i.sla_deadline,
        COALESCE(i.is_sla_breached, false) AS is_sla_breached,
        (
          SELECT COUNT(*)::int
          FROM complaints c2
          WHERE c2.issue_id = i.id
        ) AS report_count,
        (
          SELECT MIN(c2.created_at)
          FROM complaints c2
          WHERE c2.issue_id = i.id
        ) AS created_at
      FROM issues i
      JOIN categories cat ON i.category_id = cat.id
      LEFT JOIN jurisdictions j ON i.jurisdiction_id = j.id
      WHERE i.status = ANY($2::varchar[])
        ${assignmentClause}
        ${categoryClause}
      ORDER BY
        COALESCE(i.is_sla_breached, false) DESC,
        i.first_reported_at ASC
      LIMIT 100
    `,
    params
  );

  return result.rows;
};

const enrichAssignedIssues = async (issues, scope) => {
  const issueIds = issues.map((issue) => issue.id);
  const reportingMetadata = await getIssueReportingMetadata(issueIds);
  const currentAssignments = await getCurrentAssignmentMetadata(issueIds);

  return Promise.all(
    issues.map(async (issue) => {
      const metadata = reportingMetadata.get(issue.id) || {};
      const currentAssignment = currentAssignments.get(issue.id) || {};
      const slaStatus = await getSafeSLAStatus(issue.id);
      const currentAuthorityId = Number(currentAssignment.current_authority_id || 0);
      const isCurrentAssignee = currentAuthorityId === Number(scope.userId);

      return {
        ...issue,
        report_mode: metadata.report_mode || 'in_place',
        trust_level: metadata.trust_level || 'high',
        distance_meters: Number(metadata.distance_meters || 0),
        remote_justification: metadata.remote_justification || null,
        justification_type: metadata.justification_type || null,
        reporter_latitude: metadata.reporter_latitude || null,
        reporter_longitude: metadata.reporter_longitude || null,
        assigned_authority_id: currentAuthorityId || null,
        assigned_authority_name: currentAssignment.current_authority_name || null,
        assigned_authority_level: currentAssignment.current_authority_level || null,
        is_current_assignee: isCurrentAssignee,
        visibility_source: isCurrentAssignee ? 'current_assignment' : 'routing_history',
        sla_status: slaStatus,
        priority_score: slaStatus
          ? SLAService.calculatePriorityScore(issue, slaStatus)
          : getFallbackPriorityScore(issue),
      };
    })
  );
};

const getAuthorityScope = (req) => {
  if (req.userType !== 'authority' || !req.user) {
    return null;
  }

  const { id, authority_level, category_id, jurisdiction_id } = req.user;

  if (!authority_level) {
    return null;
  }

  return {
    userId: id,
    authorityLevel: authority_level,
    categoryId: category_id,
    jurisdictionId: jurisdiction_id,
    user: req.user,
  };
};

const isCurrentIssueAuthority = async (issueId, userId, dbClient = pool) => {
  const result = await dbClient.query(
    `SELECT 1
     FROM complaints c
     WHERE c.issue_id = $1
       AND COALESCE(c.assigned_authority_id, c.assigned_to) = $2
     LIMIT 1`,
    [issueId, userId]
  );

  return result.rows.length > 0;
};

const getIssueComplaintRecipients = async (issueId, dbClient = pool) => {
  const result = await dbClient.query(
    `SELECT c.id AS complaint_id, c.user_id
     FROM complaints c
     WHERE c.issue_id = $1
       AND c.user_id IS NOT NULL`,
    [issueId]
  );

  return result.rows;
};

const notifyIssueRecipients = async (issueId, notifier, dbClient = pool) => {
  try {
    const recipients = await getIssueComplaintRecipients(issueId, dbClient);

    await Promise.all(
      recipients.map(async ({ complaint_id, user_id }) => {
        await notifier({
          complaintId: complaint_id,
          userId: user_id,
        });
      })
    );
  } catch (error) {
    console.error(`Failed to create notifications for issue ${issueId}:`, error.message);
  }
};

const getVerificationQueue = async (req, res) => {
  const scope = getAuthorityScope(req);
  
  try {
    if (!scope) {
      return res.status(403).json({ error: 'Authority profile not found' });
    }
    
    const { authorityLevel } = scope;
    const assignedIssues = await getAssignedIssues(scope, ['pending', 'verified']);
    const issuesWithSLA = await enrichAssignedIssues(assignedIssues, scope);
    
    // Format for backward compatibility with existing frontend
    const formattedComplaints = issuesWithSLA.sort((left, right) => {
      if (left.is_sla_breached !== right.is_sla_breached) {
        return Number(right.is_sla_breached) - Number(left.is_sla_breached);
      }

      const modeComparison =
        getReportModePriority(left.report_mode) - getReportModePriority(right.report_mode);
      if (modeComparison !== 0) {
        return modeComparison;
      }

      return right.priority_score - left.priority_score;
    });
    
    res.json({ 
      complaints: formattedComplaints,
      authorityLevel
    });
  } catch (error) {
    console.error('Get verification queue error:', error);
    res.status(500).json({ error: 'Failed to fetch verification queue' });
  }
};

const getIssueDetails = async (req, res) => {
  const { issueId } = req.params;
  
  try {
    const issueResult = await pool.query(
      `SELECT i.*, cat.name as category_name,
              ST_Y(i.location::geometry) as latitude,
              ST_X(i.location::geometry) as longitude,
              CASE WHEN i.jurisdiction_id IS NULL THEN 'NO JURISDICTION' 
                   ELSE j.name END as jurisdiction_name,
              CASE WHEN i.jurisdiction_id IS NULL THEN true ELSE false END as is_no_jurisdiction
       FROM issues i
       JOIN categories cat ON i.category_id = cat.id
       LEFT JOIN jurisdictions j ON i.jurisdiction_id = j.id
       WHERE i.id = $1`,
      [issueId]
    );
    
    if (issueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    // Get SLA status for the issue
    const slaStatus = await SLAService.getSLAStatus(issueId);
    
    const complaintsResult = await pool.query(
      `SELECT c.id, c.created_at, c.evidence_url, c.evidence_type, 
              c.description, c.is_primary, c.latitude, c.longitude,
              c.report_mode, c.reporter_latitude, c.reporter_longitude,
              c.distance_meters, c.trust_level, c.remote_justification,
              c.justification_type
       FROM complaints c
       WHERE c.issue_id = $1
       ORDER BY c.is_primary DESC, c.created_at ASC`,
      [issueId]
    );
    
    const issue = {
      ...issueResult.rows[0],
      sla_status: slaStatus
    };

    const assignmentResult = await pool.query(
      `SELECT DISTINCT ON (c.issue_id)
         COALESCE(c.assigned_authority_id, c.assigned_to) AS current_authority_id,
         a.full_name AS current_authority_name,
         a.authority_level AS current_authority_level
       FROM complaints c
       LEFT JOIN authorities a ON COALESCE(c.assigned_authority_id, c.assigned_to) = a.id
       WHERE c.issue_id = $1
       ORDER BY c.issue_id, c.created_at DESC, c.id DESC`,
      [issueId]
    );

    const currentAssignment = assignmentResult.rows[0] || {};
    issue.current_authority_id = currentAssignment.current_authority_id || null;
    issue.current_authority_name = currentAssignment.current_authority_name || null;
    issue.current_authority_level = currentAssignment.current_authority_level || null;
    issue.is_current_assignee =
      Number(currentAssignment.current_authority_id || 0) === Number(req.user.id);
    
    res.json({
      issue,
      complaints: complaintsResult.rows
    });
  } catch (error) {
    console.error('Get issue details error:', error);
    res.status(500).json({ error: 'Failed to fetch issue details' });
  }
};

const verifyIssue = async (req, res) => {
  const { issueId } = req.params;
  const { action } = req.body; // 'accept' or 'reject'
  const userId = req.user.id;
  const actorName = req.user.full_name || 'the authority';
  
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  
  try {
    const canAct = await isCurrentIssueAuthority(issueId, userId);
    if (!canAct) {
      return res.status(403).json({ error: 'This issue has been escalated and is now read only for your account.' });
    }

    const newStatus = action === 'accept' ? 'verified' : 'rejected';
    
    await pool.query(
      `UPDATE issues 
       SET status = $1, verified_at = CURRENT_TIMESTAMP, verified_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newStatus, userId, issueId]
    );
    
    await auditLog(userId, 'ISSUE_VERIFIED', 'issue', issueId, { action }, req.ip);

    await notifyIssueRecipients(issueId, ({ complaintId, userId: complaintUserId }) =>
      notificationService.createNotification(
        complaintUserId,
        action === 'accept' ? 'Complaint Accepted' : 'Complaint Rejected',
        action === 'accept'
          ? `Your complaint #${complaintId} was accepted by ${actorName} and is now verified for action.`
          : `Your complaint #${complaintId} was rejected by ${actorName}.`,
        'STATUS_UPDATE',
        complaintId
      )
    );
    
    res.json({ message: `Issue ${action}ed successfully` });
  } catch (error) {
    console.error('Verify issue error:', error);
    res.status(500).json({ error: 'Failed to verify issue' });
  }
};

const updateIssueStatus = async (req, res) => {
  const { issueId } = req.params;
  const { status, resolutionProofUrl } = req.body;
  const userId = req.user.id;
  const actorName = req.user.full_name || 'the authority';
  
  const validStatuses = ['in_progress', 'resolved'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  const client = await pool.connect();
  
  try {
    const canAct = await isCurrentIssueAuthority(issueId, userId, client);
    if (!canAct) {
      return res.status(403).json({ error: 'This issue has been escalated and is now read only for your account.' });
    }

    await client.query('BEGIN');
    
    if (status === 'resolved') {
      await client.query(
        `UPDATE issues 
         SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2, 
             resolution_proof_url = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [status, userId, resolutionProofUrl, issueId]
      );
    } else {
      await client.query(
        `UPDATE issues 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [status, issueId]
      );
    }
    
    // Update SLA tracking when status changes
    await SLAService.updateIssueSLA(issueId, status, client);
    
    // Update all complaints linked to this issue
    await client.query(
      `UPDATE complaints 
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE issue_id = $2`,
      [status, issueId]
    );
    
    await auditLog(userId, 'ISSUE_STATUS_UPDATED', 'issue', issueId, { status }, req.ip);
    
    await client.query('COMMIT');

    await notifyIssueRecipients(issueId, ({ complaintId, userId: complaintUserId }) => {
      if (status === 'resolved') {
        return notificationService.createNotification(
          complaintUserId,
          'Complaint Resolved',
          `Your complaint #${complaintId} was marked as resolved by ${actorName}. Please verify the resolution.`,
          'RESOLVED',
          complaintId
        );
      }

      return notificationService.createNotification(
        complaintUserId,
        'Status Update',
        `Your complaint #${complaintId} is now in progress with ${actorName}.`,
        'STATUS_UPDATE',
        complaintId
      );
    });

    res.json({ message: 'Issue status updated successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Update issue status error:', error);
    res.status(500).json({ error: 'Failed to update issue status' });
  } finally {
    client.release();
  }
};

const getActiveIssues = async (req, res) => {
  const scope = getAuthorityScope(req);
  
  try {
    if (!scope) {
      return res.status(403).json({ error: 'Authority profile not found' });
    }
    
    const assignedIssues = await getAssignedIssues(scope, ['pending', 'verified', 'in_progress', 'resolved'], {
      includeHistoricalAssignments: true
    });
    const issuesWithMetadata = await enrichAssignedIssues(assignedIssues, scope);

    const sortedComplaints = [...issuesWithMetadata].sort((left, right) => {
      const modeComparison =
        getReportModePriority(left.report_mode) - getReportModePriority(right.report_mode);
      if (modeComparison !== 0) {
        return modeComparison;
      }

      return new Date(right.created_at) - new Date(left.created_at);
    });

    res.json({ complaints: sortedComplaints });
  } catch (error) {
    console.error('Get active issues error:', error);
    res.status(500).json({ error: 'Failed to fetch active issues' });
  }
};

const updateComplaintStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const userId = req.user.id;
  
  const normalizedStatus = typeof status === 'string' ? status.toLowerCase() : '';
  const validStatuses = ['in_progress', 'resolved', 'rejected'];
  if (!validStatuses.includes(normalizedStatus)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  try {
    await pool.query(
      `UPDATE complaints SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND COALESCE(assigned_authority_id, assigned_to) = $3`,
      [normalizedStatus, id, userId]
    );
    
    await auditLog(userId, 'COMPLAINT_STATUS_UPDATED', 'complaint', id, { status: normalizedStatus }, req.ip);
    
    res.json({ message: 'Status updated successfully' });
  } catch (error) {
    console.error('Update complaint status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
};

const manualEscalate = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const success = await escalateComplaint(id, 'Manual escalation by authority');
    
    if (success) {
      await auditLog(userId, 'COMPLAINT_ESCALATED', 'complaint', id, {}, req.ip);
      res.json({ message: 'Complaint escalated successfully' });
    } else {
      res.status(400).json({ error: 'Cannot escalate complaint' });
    }
  } catch (error) {
    console.error('Manual escalate error:', error);
    res.status(500).json({ error: 'Failed to escalate complaint' });
  }
};

const updateIssueLocation = async (req, res) => {
  const { issueId } = req.params;
  const { latitude, longitude, address, landmark_note } = req.body;
  const userId = req.user.id;

  if (!latitude || !longitude || !landmark_note) {
    return res.status(400).json({ error: 'latitude, longitude, and landmark_note are required' });
  }

  try {
    const canAct = await isCurrentIssueAuthority(issueId, userId);
    if (!canAct) {
      return res.status(403).json({ error: 'This issue has been escalated and is now read only for your account.' });
    }

    await pool.query(
      `UPDATE issues
       SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326),
           verified_address = $3,
           landmark_note = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [longitude, latitude, address || null, landmark_note, issueId]
    );

    await auditLog(userId, 'ISSUE_LOCATION_UPDATED', 'issue', issueId,
      { latitude, longitude, address, landmark_note }, req.ip);

    res.json({ message: 'Location updated successfully' });
  } catch (error) {
    console.error('Update issue location error:', error);
    res.status(500).json({ error: 'Failed to update location' });
  }
};

module.exports = {
  getVerificationQueue,
  getIssueDetails,
  verifyIssue,
  updateIssueStatus,
  getActiveIssues,
  updateComplaintStatus,
  manualEscalate,
  updateIssueLocation
};
