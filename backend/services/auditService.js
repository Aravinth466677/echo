const pool = require('../config/database');

class AuditService {
  /**
   * Log complaint action to history table
   * @param {Object} params - Audit parameters
   * @param {number} params.complaintId - Complaint ID
   * @param {string} params.oldStatus - Previous status (nullable)
   * @param {string} params.newStatus - New status (nullable)
   * @param {number} params.userId - User who performed action
   * @param {string} params.role - User role (CITIZEN, AUTHORITY, ADMIN, SYSTEM)
   * @param {string} params.action - Action type
   * @param {string} params.remarks - Optional remarks
   * @param {Object} params.metadata - Additional metadata
   * @param {string} params.ipAddress - User IP address
   * @param {string} params.userAgent - User agent string
   * @param {Object} params.dbClient - Database client (for transactions)
   */
  static async logComplaintAction({
    complaintId,
    oldStatus = null,
    newStatus = null,
    userId,
    role,
    action,
    remarks = null,
    metadata = {},
    ipAddress = null,
    userAgent = null,
    dbClient = null
  }) {
    const client = dbClient || pool;
    
    try {
      const result = await client.query(`
        INSERT INTO complaint_history (
          complaint_id,
          old_status,
          new_status,
          changed_by,
          role,
          action,
          remarks,
          metadata,
          ip_address,
          user_agent
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, created_at
      `, [
        complaintId,
        oldStatus,
        newStatus,
        userId,
        role.toUpperCase(),
        action.toUpperCase(),
        remarks,
        JSON.stringify(metadata),
        ipAddress,
        userAgent
      ]);

      console.log(`Audit logged: ${action} for complaint ${complaintId} by ${role} user ${userId}`);
      return result.rows[0];
    } catch (error) {
      console.error('Failed to log complaint action:', error);
      throw new Error(`Audit logging failed: ${error.message}`);
    }
  }

  /**
   * Log status change specifically
   */
  static async logStatusChange({
    complaintId,
    oldStatus,
    newStatus,
    userId,
    role,
    remarks = null,
    metadata = {},
    ipAddress = null,
    userAgent = null,
    dbClient = null
  }) {
    return this.logComplaintAction({
      complaintId,
      oldStatus,
      newStatus,
      userId,
      role,
      action: 'STATUS_CHANGE',
      remarks: remarks || `Status changed from ${oldStatus || 'none'} to ${newStatus}`,
      metadata: {
        ...metadata,
        statusChange: {
          from: oldStatus,
          to: newStatus,
          timestamp: new Date().toISOString()
        }
      },
      ipAddress,
      userAgent,
      dbClient
    });
  }

  /**
   * Log assignment action
   */
  static async logAssignment({
    complaintId,
    assignedToUserId,
    assignedByUserId,
    assignedByRole,
    authorityLevel = null,
    remarks = null,
    metadata = {},
    ipAddress = null,
    userAgent = null,
    dbClient = null
  }) {
    return this.logComplaintAction({
      complaintId,
      oldStatus: null,
      newStatus: null,
      userId: assignedByUserId,
      role: assignedByRole,
      action: 'ASSIGNED',
      remarks: remarks || `Complaint assigned to ${authorityLevel || 'authority'}`,
      metadata: {
        ...metadata,
        assignment: {
          assignedTo: assignedToUserId,
          assignedBy: assignedByUserId,
          authorityLevel,
          timestamp: new Date().toISOString()
        }
      },
      ipAddress,
      userAgent,
      dbClient
    });
  }

  /**
   * Log escalation action
   */
  static async logEscalation({
    complaintId,
    escalatedByUserId = null,
    escalatedByRole = 'SYSTEM',
    reason,
    fromAuthorityId = null,
    toAuthorityId,
    escalationLevel,
    metadata = {},
    dbClient = null
  }) {
    return this.logComplaintAction({
      complaintId,
      oldStatus: null,
      newStatus: 'escalated',
      userId: escalatedByUserId,
      role: escalatedByRole,
      action: 'ESCALATED',
      remarks: `Escalated: ${reason}`,
      metadata: {
        ...metadata,
        escalation: {
          reason,
          fromAuthority: fromAuthorityId,
          toAuthority: toAuthorityId,
          escalationLevel,
          timestamp: new Date().toISOString()
        }
      },
      dbClient
    });
  }

  /**
   * Get complaint history
   */
  static async getComplaintHistory(complaintId, options = {}) {
    const { includeMetadata = false, limit = null } = options;
    
    try {
      let query = `
        SELECT 
          h.id,
          h.complaint_id,
          h.old_status,
          h.new_status,
          h.changed_by,
          u.full_name as changed_by_name,
          u.email as changed_by_email,
          h.role,
          h.action,
          h.remarks,
          h.created_at,
          get_action_description(h.action, h.old_status, h.new_status, h.role) as description
          ${includeMetadata ? ', h.metadata, h.ip_address, h.user_agent' : ''}
        FROM complaint_history h
        LEFT JOIN users u ON h.changed_by = u.id
        WHERE h.complaint_id = $1
        ORDER BY h.created_at ASC
      `;
      
      if (limit) {
        query += ` LIMIT ${limit}`;
      }

      const result = await pool.query(query, [complaintId]);
      return result.rows;
    } catch (error) {
      console.error('Failed to get complaint history:', error);
      throw new Error(`Failed to retrieve complaint history: ${error.message}`);
    }
  }

  /**
   * Get public complaint timeline (sanitized)
   */
  static async getPublicComplaintTimeline(complaintId) {
    try {
      const result = await pool.query(`
        SELECT 
          h.action,
          h.old_status,
          h.new_status,
          h.role,
          h.created_at,
          get_action_description(h.action, h.old_status, h.new_status, h.role) as description
        FROM complaint_history h
        WHERE h.complaint_id = $1
        AND h.action IN ('CREATED', 'STATUS_CHANGE', 'ASSIGNED', 'RESOLVED', 'VERIFIED', 'REJECTED', 'CLOSED')
        ORDER BY h.created_at ASC
      `, [complaintId]);
      
      return result.rows.map(row => ({
        action: row.action,
        oldStatus: row.old_status,
        newStatus: row.new_status,
        role: row.role,
        timestamp: row.created_at,
        description: row.description
      }));
    } catch (error) {
      console.error('Failed to get public complaint timeline:', error);
      throw new Error(`Failed to retrieve public timeline: ${error.message}`);
    }
  }

  /**
   * Get complaint statistics
   */
  static async getComplaintStats(complaintId) {
    try {
      const result = await pool.query(`
        SELECT 
          COUNT(*) as total_actions,
          COUNT(DISTINCT changed_by) as unique_actors,
          MIN(created_at) as first_action,
          MAX(created_at) as last_action,
          COUNT(CASE WHEN action = 'STATUS_CHANGE' THEN 1 END) as status_changes,
          COUNT(CASE WHEN role = 'CITIZEN' THEN 1 END) as citizen_actions,
          COUNT(CASE WHEN role = 'AUTHORITY' THEN 1 END) as authority_actions,
          COUNT(CASE WHEN role = 'ADMIN' THEN 1 END) as admin_actions
        FROM complaint_history
        WHERE complaint_id = $1
      `, [complaintId]);
      
      return result.rows[0];
    } catch (error) {
      console.error('Failed to get complaint stats:', error);
      throw new Error(`Failed to retrieve complaint statistics: ${error.message}`);
    }
  }

  /**
   * Validate user access to complaint history
   */
  static async validateHistoryAccess(complaintId, userId, userRole) {
    try {
      // Admin can access all
      if (userRole === 'admin') {
        return true;
      }

      // Get complaint details
      const complaintResult = await pool.query(`
        SELECT user_id, assigned_authority_id, jurisdiction_id
        FROM complaints 
        WHERE id = $1
      `, [complaintId]);

      if (complaintResult.rows.length === 0) {
        return false;
      }

      const complaint = complaintResult.rows[0];

      // Citizen can access their own complaints
      if (userRole === 'citizen' && complaint.user_id === userId) {
        return true;
      }

      // Authority can access assigned complaints or complaints in their jurisdiction
      if (userRole === 'authority') {
        if (complaint.assigned_authority_id === userId) {
          return true;
        }

        // Check if authority has jurisdiction access
        const jurisdictionResult = await pool.query(`
          SELECT 1 FROM authorities 
          WHERE id = $1 AND jurisdiction_id = $2
        `, [userId, complaint.jurisdiction_id]);

        return jurisdictionResult.rows.length > 0;
      }

      return false;
    } catch (error) {
      console.error('Failed to validate history access:', error);
      return false;
    }
  }

  /**
   * Helper method to extract request metadata
   */
  static extractRequestMetadata(req) {
    return {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = AuditService;