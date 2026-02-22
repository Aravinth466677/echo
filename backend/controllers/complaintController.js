const pool = require('../config/database');
const auditLog = require('../middleware/auditLog');
const { findMatchingIssue, createNewIssue, linkComplaintToIssue } = require('../services/aggregationService');

const submitComplaint = async (req, res) => {
  const { categoryId, latitude, longitude, description, evidenceType, wardId } = req.body;
  const userId = req.user.id;
  const evidenceUrl = req.file ? `/uploads/${req.file.filename}` : null;
  
  if (!evidenceUrl) {
    return res.status(400).json({ error: 'Evidence photo/video is required' });
  }
  
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Find matching issue using aggregation logic
    const { isDuplicate, issueId } = await findMatchingIssue(categoryId, latitude, longitude, userId);
    
    if (isDuplicate) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You have already reported this issue' });
    }
    
    let finalIssueId = issueId;
    let isPrimary = false;
    
    // Create new issue if no match found
    if (!finalIssueId) {
      finalIssueId = await createNewIssue(categoryId, latitude, longitude, wardId);
      isPrimary = true;
    } else {
      // Increment echo count for existing issue
      await linkComplaintToIssue(finalIssueId);
    }
    
    // Insert complaint
    const complaintResult = await client.query(
      `INSERT INTO complaints (issue_id, user_id, category_id, location, latitude, longitude, 
                               evidence_url, evidence_type, description, is_primary, status)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326)::geography, $5, $4, $6, $7, $8, $9, 'aggregated')
       RETURNING id`,
      [finalIssueId, userId, categoryId, longitude, latitude, evidenceUrl, evidenceType, description, isPrimary]
    );
    
    await auditLog(userId, 'COMPLAINT_SUBMITTED', 'complaint', complaintResult.rows[0].id, 
                   { issueId: finalIssueId, categoryId, isPrimary }, req.ip);
    
    await client.query('COMMIT');
    
    res.status(201).json({
      message: 'Complaint submitted successfully',
      complaintId: complaintResult.rows[0].id,
      issueId: finalIssueId,
      isNewIssue: isPrimary
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Submit complaint error:', error);
    res.status(500).json({ error: 'Failed to submit complaint' });
  } finally {
    client.release();
  }
};

const getMyComplaints = async (req, res) => {
  const userId = req.user.id;
  
  try {
    const result = await pool.query(
      `SELECT c.id, c.created_at, c.description, c.evidence_url, c.status,
              cat.name as category_name,
              i.id as issue_id, i.status as issue_status, i.echo_count,
              c.latitude, c.longitude
       FROM complaints c
       JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN issues i ON c.issue_id = i.id
       WHERE c.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );
    
    res.json({ complaints: result.rows });
  } catch (error) {
    console.error('Get complaints error:', error);
    res.status(500).json({ error: 'Failed to fetch complaints' });
  }
};

const getAreaIssues = async (req, res) => {
  const { latitude, longitude, radius = 5000 } = req.query;
  
  try {
    const result = await pool.query(
      `SELECT i.id, i.echo_count, i.status, i.first_reported_at,
              cat.name as category_name,
              ST_Y(i.location::geometry) as latitude,
              ST_X(i.location::geometry) as longitude,
              COUNT(c.id) as report_count
       FROM issues i
       JOIN categories cat ON i.category_id = cat.id
       LEFT JOIN complaints c ON c.issue_id = i.id
       WHERE ST_DWithin(
         i.location::geography,
         ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
         $3
       )
       AND i.status NOT IN ('rejected')
       GROUP BY i.id, cat.name
       ORDER BY i.echo_count DESC, i.first_reported_at DESC
       LIMIT 50`,
      [longitude, latitude, radius]
    );
    
    res.json({ issues: result.rows });
  } catch (error) {
    console.error('Get area issues error:', error);
    res.status(500).json({ error: 'Failed to fetch area issues' });
  }
};

const getCategories = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description FROM categories ORDER BY name'
    );
    res.json({ categories: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

module.exports = {
  submitComplaint,
  getMyComplaints,
  getAreaIssues,
  getCategories
};
