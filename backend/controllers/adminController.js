const pool = require('../config/database');
const bcrypt = require('bcrypt');
const auditLog = require('../middleware/auditLog');

const getAnalytics = async (req, res) => {
  try {
    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM issues WHERE status = 'pending') as pending_issues,
        (SELECT COUNT(*) FROM issues WHERE status = 'verified') as verified_issues,
        (SELECT COUNT(*) FROM issues WHERE status = 'in_progress') as in_progress_issues,
        (SELECT COUNT(*) FROM issues WHERE status = 'resolved') as resolved_issues,
        (SELECT COUNT(*) FROM complaints WHERE created_at > CURRENT_DATE) as today_complaints,
        (SELECT COUNT(*) FROM users WHERE role = 'citizen') as total_citizens
    `);
    
    const categoryStats = await pool.query(`
      SELECT cat.name, COUNT(i.id) as issue_count, SUM(i.echo_count) as total_echoes
      FROM categories cat
      LEFT JOIN issues i ON i.category_id = cat.id
      GROUP BY cat.id, cat.name
      ORDER BY issue_count DESC
    `);
    
    res.json({
      stats: stats.rows[0],
      categoryStats: categoryStats.rows
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

const createAuthority = async (req, res) => {
  const { email, password, fullName, wardId, department } = req.body;
  const adminId = req.user.id;
  
  try {
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, role, full_name, ward_id)
       VALUES ($1, $2, 'authority', $3, $4)
       RETURNING id, email, role, full_name, ward_id`,
      [email, passwordHash, fullName, wardId]
    );
    
    const user = userResult.rows[0];
    
    await pool.query(
      `INSERT INTO authority_assignments (user_id, ward_id, department)
       VALUES ($1, $2, $3)`,
      [user.id, wardId, department]
    );
    
    await auditLog(adminId, 'AUTHORITY_CREATED', 'user', user.id, { email, wardId, department }, req.ip);
    
    res.status(201).json({ message: 'Authority created successfully', user });
  } catch (error) {
    console.error('Create authority error:', error);
    res.status(500).json({ error: 'Failed to create authority' });
  }
};

const getAuthorities = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.email, u.full_name, u.ward_id, u.is_active, u.created_at,
             aa.department
      FROM users u
      LEFT JOIN authority_assignments aa ON aa.user_id = u.id
      WHERE u.role = 'authority'
      ORDER BY u.created_at DESC
    `);
    
    res.json({ authorities: result.rows });
  } catch (error) {
    console.error('Get authorities error:', error);
    res.status(500).json({ error: 'Failed to fetch authorities' });
  }
};

const getSLABreaches = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT i.id, i.echo_count, i.status, i.first_reported_at,
             cat.name as category_name, cat.sla_hours,
             ST_Y(i.location::geometry) as latitude,
             ST_X(i.location::geometry) as longitude,
             i.ward_id,
             EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.first_reported_at))/3600 as hours_open
      FROM issues i
      JOIN categories cat ON i.category_id = cat.id
      WHERE i.status NOT IN ('resolved', 'rejected')
      AND EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.first_reported_at))/3600 > cat.sla_hours
      ORDER BY hours_open DESC
      LIMIT 100
    `);
    
    res.json({ breaches: result.rows });
  } catch (error) {
    console.error('Get SLA breaches error:', error);
    res.status(500).json({ error: 'Failed to fetch SLA breaches' });
  }
};

module.exports = {
  getAnalytics,
  createAuthority,
  getAuthorities,
  getSLABreaches
};
