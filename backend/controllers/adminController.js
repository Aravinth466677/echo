const pool = require('../config/database');
const bcrypt = require('bcrypt');
const auditLog = require('../middleware/auditLog');
const SLAService = require('../services/slaService');

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
    
    // Get SLA statistics
    const slaStats = await SLAService.getSLAStatistics();
    
    res.json({
      stats: stats.rows[0],
      categoryStats: categoryStats.rows,
      slaStats
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};

const createAuthority = async (req, res) => {
  const { email, password, fullName, jurisdictionId, authorityLevel, categoryId, department, wardId } = req.body;
  const adminId = req.user.id;
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const resolvedAuthorityLevel = authorityLevel || 'JURISDICTION';
  const validAuthorityLevels = ['SUPER_ADMIN', 'DEPARTMENT', 'JURISDICTION'];
  const resolvedWardId = wardId || null;

  if (!normalizedEmail || !password || !fullName) {
    return res.status(400).json({ error: 'Email, password, and full name are required' });
  }

  if (!validAuthorityLevels.includes(resolvedAuthorityLevel)) {
    return res.status(400).json({ error: 'Invalid authority level' });
  }

  if (resolvedAuthorityLevel === 'JURISDICTION' && !jurisdictionId) {
    return res.status(400).json({ error: 'Jurisdiction is required for JURISDICTION authorities' });
  }

  if (resolvedAuthorityLevel === 'DEPARTMENT' && !categoryId) {
    return res.status(400).json({ error: 'Category is required for DEPARTMENT authorities' });
  }
  
  try {
    // Check if email exists in users or authorities table
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    const existingAuthority = await pool.query('SELECT id FROM authorities WHERE email = $1', [normalizedEmail]);
    
    if (existingUser.rows.length > 0 || existingAuthority.rows.length > 0) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Check if authority already exists for this jurisdiction and category combination
    if (resolvedAuthorityLevel === 'JURISDICTION' && jurisdictionId && categoryId) {
      const existingJurisdictionAuthority = await pool.query(
        'SELECT id, email, full_name FROM authorities WHERE jurisdiction_id = $1 AND category_id = $2 AND authority_level = $3',
        [jurisdictionId, categoryId, resolvedAuthorityLevel]
      );
      
      if (existingJurisdictionAuthority.rows.length > 0) {
        const existing = existingJurisdictionAuthority.rows[0];
        return res.status(400).json({ 
          error: 'Authority already exists for this jurisdiction and category',
          details: `${existing.full_name} (${existing.email}) is already assigned to this jurisdiction and category combination.`
        });
      }
    }
    
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Add ward_id to the insert if authorities table has it
    const result = await pool.query(
      `INSERT INTO authorities (email, password_hash, full_name, authority_level, jurisdiction_id, category_id, department, ward_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, email, full_name, authority_level, jurisdiction_id, category_id, department, ward_id`,
      [normalizedEmail, passwordHash, fullName, resolvedAuthorityLevel, jurisdictionId, categoryId, department, resolvedWardId]
    );
    
    const authority = result.rows[0];
    
    await auditLog(adminId, 'AUTHORITY_CREATED', 'authority', authority.id, 
                   { email: normalizedEmail, authorityLevel: resolvedAuthorityLevel, jurisdictionId, categoryId, wardId: resolvedWardId }, req.ip);
    
    res.status(201).json({ message: 'Authority created successfully', authority });
  } catch (error) {
    console.error('Create authority error:', error);
    
    // Handle specific database errors
    if (error.code === '42703') { // column does not exist
      // Fallback for tables without ward_id column
      try {
        const result = await pool.query(
          `INSERT INTO authorities (email, password_hash, full_name, authority_level, jurisdiction_id, category_id, department)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, email, full_name, authority_level, jurisdiction_id, category_id, department`,
          [normalizedEmail, passwordHash, fullName, resolvedAuthorityLevel, jurisdictionId, categoryId, department]
        );
        
        const authority = result.rows[0];
        
        await auditLog(adminId, 'AUTHORITY_CREATED', 'authority', authority.id, 
                       { email: normalizedEmail, authorityLevel: resolvedAuthorityLevel, jurisdictionId, categoryId }, req.ip);
        
        return res.status(201).json({ message: 'Authority created successfully', authority });
      } catch (fallbackError) {
        console.error('Fallback create authority error:', fallbackError);
        return res.status(500).json({ error: 'Failed to create authority' });
      }
    }
    
    res.status(500).json({ error: 'Failed to create authority' });
  }
};

const getAuthorities = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT a.id, a.email, a.full_name, a.authority_level, a.jurisdiction_id, a.category_id, 
             a.department, a.is_active, a.created_at,
             j.name as jurisdiction_name, c.name as category_name
      FROM authorities a
      LEFT JOIN jurisdictions j ON j.id = a.jurisdiction_id
      LEFT JOIN categories c ON c.id = a.category_id
      ORDER BY a.created_at DESC
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
             i.sla_deadline, i.sla_duration_hours, i.is_sla_breached,
             cat.name as category_name, cat.sla_hours,
             ST_Y(i.location::geometry) as latitude,
             ST_X(i.location::geometry) as longitude,
             j.name as jurisdiction_name,
             EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.first_reported_at))/3600 as hours_open,
             EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - i.sla_deadline))/3600 as hours_overdue,
             calculate_sla_status(i.sla_deadline, i.status) as sla_status
      FROM issues i
      JOIN categories cat ON i.category_id = cat.id
      LEFT JOIN jurisdictions j ON i.jurisdiction_id = j.id
      WHERE i.status NOT IN ('resolved', 'rejected')
      AND (i.is_sla_breached = TRUE OR i.sla_deadline < NOW())
      ORDER BY i.sla_deadline ASC
      LIMIT 100
    `);
    
    // Format the results with SLA information
    const formattedBreaches = result.rows.map(breach => {
      const slaStatus = breach.sla_status;
      return {
        ...breach,
        remaining_time_formatted: slaStatus.remaining_seconds > 0 
          ? SLAService.formatRemainingTimeSync(slaStatus.remaining_seconds)
          : 'Overdue',
        status_color: slaStatus.status_color,
        sla_display_text: slaStatus.display_text
      };
    });
    
    res.json({ breaches: formattedBreaches });
  } catch (error) {
    console.error('Get SLA breaches error:', error);
    res.status(500).json({ error: 'Failed to fetch SLA breaches' });
  }
};

const deleteAuthority = async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id;
  
  try {
    // Get authority info before deletion
    const authorityResult = await pool.query(
      'SELECT email, full_name FROM authorities WHERE id = $1',
      [id]
    );
    
    if (authorityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Authority not found' });
    }
    
    const authority = authorityResult.rows[0];
    
    // Nullify all foreign key references before deletion
    await pool.query('UPDATE complaints SET assigned_authority_id = NULL WHERE assigned_authority_id = $1', [id]);
    await pool.query('UPDATE complaints SET escalated_authority_id = NULL WHERE escalated_authority_id = $1', [id]);
    await pool.query('UPDATE issues SET verified_by_authority_id = NULL WHERE verified_by_authority_id = $1', [id]);
    await pool.query('UPDATE issues SET resolved_by_authority_id = NULL WHERE resolved_by_authority_id = $1', [id]);
    
    // Delete the authority
    const deleteResult = await pool.query('DELETE FROM authorities WHERE id = $1', [id]);
    
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ error: 'Authority not found or already deleted' });
    }
    
    await auditLog(adminId, 'AUTHORITY_DELETED', 'authority', id, 
                   { email: authority.email, fullName: authority.full_name }, req.ip);
    
    res.json({ message: 'Authority deleted successfully' });
  } catch (error) {
    console.error('Delete authority error:', error);
    res.status(500).json({ error: 'Failed to delete authority' });
  }
};

module.exports = {
  getAnalytics,
  createAuthority,
  getAuthorities,
  deleteAuthority,
  getSLABreaches
};
