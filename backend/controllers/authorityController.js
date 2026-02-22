const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');

const getVerificationQueue = async (req, res) => {
  const userId = req.user.id;
  
  try {
    // Get authority's department
    const authResult = await pool.query(
      `SELECT aa.department FROM authority_assignments aa WHERE aa.user_id = $1`,
      [userId]
    );
    
    if (authResult.rows.length === 0) {
      return res.status(403).json({ error: 'Authority department not found' });
    }
    
    const department = authResult.rows[0].department;
    
    // Filter issues by department (category name matches department)
    const result = await pool.query(
      `SELECT i.id, i.echo_count, i.first_reported_at, i.last_reported_at,
              cat.name as category_name, cat.sla_hours,
              ST_Y(i.location::geometry) as latitude,
              ST_X(i.location::geometry) as longitude,
              i.ward_id,
              COUNT(c.id) as report_count
       FROM issues i
       JOIN categories cat ON i.category_id = cat.id
       LEFT JOIN complaints c ON c.issue_id = i.id
       WHERE i.status = 'pending' AND cat.name = $1
       GROUP BY i.id, cat.name, cat.sla_hours
       ORDER BY i.echo_count DESC, i.first_reported_at ASC
       LIMIT 100`,
      [department]
    );
    
    res.json({ issues: result.rows });
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
              ST_X(i.location::geometry) as longitude
       FROM issues i
       JOIN categories cat ON i.category_id = cat.id
       WHERE i.id = $1`,
      [issueId]
    );
    
    if (issueResult.rows.length === 0) {
      return res.status(404).json({ error: 'Issue not found' });
    }
    
    const complaintsResult = await pool.query(
      `SELECT c.id, c.created_at, c.evidence_url, c.evidence_type, 
              c.description, c.is_primary, c.latitude, c.longitude
       FROM complaints c
       WHERE c.issue_id = $1
       ORDER BY c.is_primary DESC, c.created_at ASC`,
      [issueId]
    );
    
    res.json({
      issue: issueResult.rows[0],
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
  
  if (!['accept', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action' });
  }
  
  try {
    const newStatus = action === 'accept' ? 'verified' : 'rejected';
    
    await pool.query(
      `UPDATE issues 
       SET status = $1, verified_at = CURRENT_TIMESTAMP, verified_by = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [newStatus, userId, issueId]
    );
    
    await auditLog(userId, 'ISSUE_VERIFIED', 'issue', issueId, { action }, req.ip);
    
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
  
  const validStatuses = ['in_progress', 'resolved'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  
  try {
    if (status === 'resolved') {
      await pool.query(
        `UPDATE issues 
         SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2, 
             resolution_proof_url = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [status, userId, resolutionProofUrl, issueId]
      );
    } else {
      await pool.query(
        `UPDATE issues 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [status, issueId]
      );
    }
    
    await auditLog(userId, 'ISSUE_STATUS_UPDATED', 'issue', issueId, { status }, req.ip);
    
    res.json({ message: 'Issue status updated successfully' });
  } catch (error) {
    console.error('Update issue status error:', error);
    res.status(500).json({ error: 'Failed to update issue status' });
  }
};

const getActiveIssues = async (req, res) => {
  const userId = req.user.id;
  
  try {
    // Get authority's department
    const authResult = await pool.query(
      `SELECT aa.department FROM authority_assignments aa WHERE aa.user_id = $1`,
      [userId]
    );
    
    if (authResult.rows.length === 0) {
      return res.status(403).json({ error: 'Authority department not found' });
    }
    
    const department = authResult.rows[0].department;
    
    // Filter issues by department (category name matches department)
    const result = await pool.query(
      `SELECT i.id, i.echo_count, i.status, i.verified_at, i.first_reported_at,
              cat.name as category_name, cat.sla_hours,
              ST_Y(i.location::geometry) as latitude,
              ST_X(i.location::geometry) as longitude,
              i.ward_id,
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.first_reported_at))/3600 as hours_open
       FROM issues i
       JOIN categories cat ON i.category_id = cat.id
       WHERE i.status IN ('verified', 'in_progress') AND cat.name = $1
       ORDER BY i.echo_count DESC, i.first_reported_at ASC
       LIMIT 100`,
      [department]
    );
    
    res.json({ issues: result.rows });
  } catch (error) {
    console.error('Get active issues error:', error);
    res.status(500).json({ error: 'Failed to fetch active issues' });
  }
};

module.exports = {
  getVerificationQueue,
  getIssueDetails,
  verifyIssue,
  updateIssueStatus,
  getActiveIssues
};
