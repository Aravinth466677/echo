const pool = require('../config/database');
const AuditService = require('./auditService');

class ComplaintService {
  /**
   * Update complaint status with audit logging
   */
  static async updateComplaintStatus({
    complaintId,
    newStatus,
    userId,
    userRole,
    remarks = null,
    metadata = {},
    req = null,
    dbClient = null
  }) {
    const client = dbClient || pool;
    const shouldCommit = !dbClient;
    
    try {
      if (shouldCommit) {
        await client.query('BEGIN');
      }

      // Get current complaint status
      const currentResult = await client.query(
        'SELECT status, user_id, assigned_authority_id FROM complaints WHERE id = $1',
        [complaintId]
      );

      if (currentResult.rows.length === 0) {
        throw new Error('Complaint not found');
      }

      const currentComplaint = currentResult.rows[0];
      const oldStatus = currentComplaint.status;

      // Validate status transition (add your business logic here)
      this.validateStatusTransition(oldStatus, newStatus, userRole);

      // Update complaint status
      await client.query(
        'UPDATE complaints SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [newStatus, complaintId]
      );

      // Log the status change
      const requestMetadata = req ? AuditService.extractRequestMetadata(req) : {};
      await AuditService.logStatusChange({
        complaintId,
        oldStatus,
        newStatus,
        userId,
        role: userRole,
        remarks,
        metadata: {
          ...metadata,
          ...requestMetadata
        },
        ipAddress: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
        dbClient: client
      });

      if (shouldCommit) {
        await client.query('COMMIT');
      }

      console.log(`Complaint ${complaintId} status updated: ${oldStatus} → ${newStatus} by ${userRole} ${userId}`);
      
      return {
        success: true,
        oldStatus,
        newStatus,
        complaintId
      };

    } catch (error) {
      if (shouldCommit) {
        await client.query('ROLLBACK');
      }
      console.error('Update complaint status error:', error);
      throw error;
    } finally {
      if (shouldCommit && client.release) {
        client.release();
      }
    }
  }

  /**
   * Assign complaint to authority with audit logging
   */
  static async assignComplaint({
    complaintId,
    authorityId,
    assignedByUserId,
    assignedByRole,
    authorityLevel = null,
    remarks = null,
    metadata = {},
    req = null,
    dbClient = null
  }) {
    const client = dbClient || pool;
    const shouldCommit = !dbClient;
    
    try {
      if (shouldCommit) {
        await client.query('BEGIN');
      }

      // Get current assignment
      const currentResult = await client.query(
        'SELECT assigned_authority_id, status FROM complaints WHERE id = $1',
        [complaintId]
      );

      if (currentResult.rows.length === 0) {
        throw new Error('Complaint not found');
      }

      const currentComplaint = currentResult.rows[0];
      const oldStatus = currentComplaint.status;
      const newStatus = 'assigned';

      // Update complaint assignment
      await client.query(
        `UPDATE complaints 
         SET assigned_authority_id = $1, status = $2, updated_at = CURRENT_TIMESTAMP 
         WHERE id = $3`,
        [authorityId, newStatus, complaintId]
      );

      // Log status change if status changed
      if (oldStatus !== newStatus) {
        const requestMetadata = req ? AuditService.extractRequestMetadata(req) : {};
        await AuditService.logStatusChange({
          complaintId,
          oldStatus,
          newStatus,
          userId: assignedByUserId,
          role: assignedByRole,
          remarks: `Complaint assigned to ${authorityLevel || 'authority'}`,
          metadata: {
            ...metadata,
            assignment: {
              authorityId,
              authorityLevel,
              assignedAt: new Date().toISOString()
            },
            ...requestMetadata
          },
          ipAddress: requestMetadata.ipAddress,
          userAgent: requestMetadata.userAgent,
          dbClient: client
        });
      }

      // Log assignment action
      const requestMetadata = req ? AuditService.extractRequestMetadata(req) : {};
      await AuditService.logAssignment({
        complaintId,
        assignedToUserId: authorityId,
        assignedByUserId,
        assignedByRole,
        authorityLevel,
        remarks,
        metadata: {
          ...metadata,
          ...requestMetadata
        },
        ipAddress: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
        dbClient: client
      });

      if (shouldCommit) {
        await client.query('COMMIT');
      }

      console.log(`Complaint ${complaintId} assigned to authority ${authorityId} by ${assignedByRole} ${assignedByUserId}`);
      
      return {
        success: true,
        complaintId,
        authorityId,
        oldStatus,
        newStatus
      };

    } catch (error) {
      if (shouldCommit) {
        await client.query('ROLLBACK');
      }
      console.error('Assign complaint error:', error);
      throw error;
    } finally {
      if (shouldCommit && client.release) {
        client.release();
      }
    }
  }

  /**
   * Resolve complaint with audit logging
   */
  static async resolveComplaint({
    complaintId,
    resolvedByUserId,
    resolvedByRole,
    resolutionNotes = null,
    evidenceUrl = null,
    metadata = {},
    req = null,
    dbClient = null
  }) {
    const client = dbClient || pool;
    const shouldCommit = !dbClient;
    
    try {
      if (shouldCommit) {
        await client.query('BEGIN');
      }

      // Get current status
      const currentResult = await client.query(
        'SELECT status FROM complaints WHERE id = $1',
        [complaintId]
      );

      if (currentResult.rows.length === 0) {
        throw new Error('Complaint not found');
      }

      const oldStatus = currentResult.rows[0].status;
      const newStatus = 'resolved';

      // Update complaint
      await client.query(
        `UPDATE complaints 
         SET status = $1, resolved_at = CURRENT_TIMESTAMP, resolved_by = $2, 
             resolution_notes = $3, resolution_evidence_url = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [newStatus, resolvedByUserId, resolutionNotes, evidenceUrl, complaintId]
      );

      // Log the resolution
      const requestMetadata = req ? AuditService.extractRequestMetadata(req) : {};
      await AuditService.logComplaintAction({
        complaintId,
        oldStatus,
        newStatus,
        userId: resolvedByUserId,
        role: resolvedByRole,
        action: 'RESOLVED',
        remarks: resolutionNotes || 'Complaint marked as resolved',
        metadata: {
          ...metadata,
          resolution: {
            resolvedBy: resolvedByUserId,
            resolvedAt: new Date().toISOString(),
            evidenceUrl,
            notes: resolutionNotes
          },
          ...requestMetadata
        },
        ipAddress: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
        dbClient: client
      });

      if (shouldCommit) {
        await client.query('COMMIT');
      }

      console.log(`Complaint ${complaintId} resolved by ${resolvedByRole} ${resolvedByUserId}`);
      
      return {
        success: true,
        complaintId,
        oldStatus,
        newStatus,
        resolvedBy: resolvedByUserId
      };

    } catch (error) {
      if (shouldCommit) {
        await client.query('ROLLBACK');
      }
      console.error('Resolve complaint error:', error);
      throw error;
    } finally {
      if (shouldCommit && client.release) {
        client.release();
      }
    }
  }

  /**
   * Verify complaint resolution (citizen action)
   */
  static async verifyResolution({
    complaintId,
    citizenId,
    isVerified,
    feedback = null,
    rating = null,
    metadata = {},
    req = null,
    dbClient = null
  }) {
    const client = dbClient || pool;
    const shouldCommit = !dbClient;
    
    try {
      if (shouldCommit) {
        await client.query('BEGIN');
      }

      const oldStatus = 'resolved';
      const newStatus = isVerified ? 'verified' : 'rejected';

      // Update complaint
      await client.query(
        `UPDATE complaints 
         SET status = $1, verified_at = CURRENT_TIMESTAMP, citizen_feedback = $2, 
             citizen_rating = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND user_id = $5`,
        [newStatus, feedback, rating, complaintId, citizenId]
      );

      // Log the verification
      const requestMetadata = req ? AuditService.extractRequestMetadata(req) : {};
      await AuditService.logComplaintAction({
        complaintId,
        oldStatus,
        newStatus,
        userId: citizenId,
        role: 'CITIZEN',
        action: isVerified ? 'VERIFIED' : 'REJECTED',
        remarks: feedback || (isVerified ? 'Resolution verified by citizen' : 'Resolution rejected by citizen'),
        metadata: {
          ...metadata,
          verification: {
            isVerified,
            feedback,
            rating,
            verifiedAt: new Date().toISOString()
          },
          ...requestMetadata
        },
        ipAddress: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
        dbClient: client
      });

      if (shouldCommit) {
        await client.query('COMMIT');
      }

      console.log(`Complaint ${complaintId} ${isVerified ? 'verified' : 'rejected'} by citizen ${citizenId}`);
      
      return {
        success: true,
        complaintId,
        oldStatus,
        newStatus,
        isVerified,
        rating
      };

    } catch (error) {
      if (shouldCommit) {
        await client.query('ROLLBACK');
      }
      console.error('Verify resolution error:', error);
      throw error;
    } finally {
      if (shouldCommit && client.release) {
        client.release();
      }
    }
  }

  /**
   * Add comment to complaint with audit logging
   */
  static async addComment({
    complaintId,
    userId,
    userRole,
    comment,
    isInternal = false,
    metadata = {},
    req = null,
    dbClient = null
  }) {
    const client = dbClient || pool;
    const shouldCommit = !dbClient;
    
    try {
      if (shouldCommit) {
        await client.query('BEGIN');
      }

      // Insert comment (assuming you have a comments table)
      const commentResult = await client.query(
        `INSERT INTO complaint_comments (complaint_id, user_id, comment, is_internal, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
         RETURNING id`,
        [complaintId, userId, comment, isInternal]
      );

      const commentId = commentResult.rows[0].id;

      // Log the comment addition
      const requestMetadata = req ? AuditService.extractRequestMetadata(req) : {};
      await AuditService.logComplaintAction({
        complaintId,
        oldStatus: null,
        newStatus: null,
        userId,
        role: userRole,
        action: 'COMMENT_ADDED',
        remarks: isInternal ? 'Internal comment added' : 'Comment added',
        metadata: {
          ...metadata,
          comment: {
            commentId,
            isInternal,
            length: comment.length,
            addedAt: new Date().toISOString()
          },
          ...requestMetadata
        },
        ipAddress: requestMetadata.ipAddress,
        userAgent: requestMetadata.userAgent,
        dbClient: client
      });

      if (shouldCommit) {
        await client.query('COMMIT');
      }

      console.log(`Comment added to complaint ${complaintId} by ${userRole} ${userId}`);
      
      return {
        success: true,
        complaintId,
        commentId,
        isInternal
      };

    } catch (error) {
      if (shouldCommit) {
        await client.query('ROLLBACK');
      }
      console.error('Add comment error:', error);
      throw error;
    } finally {
      if (shouldCommit && client.release) {
        client.release();
      }
    }
  }

  /**
   * Validate status transitions based on business rules
   */
  static validateStatusTransition(oldStatus, newStatus, userRole) {
    const validTransitions = {
      'submitted': ['assigned', 'rejected'],
      'assigned': ['in_progress', 'rejected'],
      'in_progress': ['resolved', 'escalated'],
      'resolved': ['verified', 'rejected', 'closed'],
      'verified': ['closed'],
      'rejected': ['assigned', 'closed'],
      'escalated': ['assigned', 'in_progress', 'resolved'],
      'closed': [] // Terminal state
    };

    const rolePermissions = {
      'CITIZEN': ['verified', 'rejected'], // Citizens can only verify/reject resolutions
      'AUTHORITY': ['assigned', 'in_progress', 'resolved', 'escalated'],
      'ADMIN': ['assigned', 'in_progress', 'resolved', 'verified', 'rejected', 'closed', 'escalated'],
      'SYSTEM': ['escalated', 'closed'] // System can escalate and close
    };

    // Check if transition is valid
    if (!validTransitions[oldStatus] || !validTransitions[oldStatus].includes(newStatus)) {
      throw new Error(`Invalid status transition: ${oldStatus} → ${newStatus}`);
    }

    // Check if user role has permission for this status
    if (!rolePermissions[userRole] || !rolePermissions[userRole].includes(newStatus)) {
      throw new Error(`Role ${userRole} not authorized to set status to ${newStatus}`);
    }
  }

  /**
   * Get complaint with full audit trail
   */
  static async getComplaintWithHistory(complaintId, userId, userRole) {
    try {
      // Validate access
      const hasAccess = await AuditService.validateHistoryAccess(complaintId, userId, userRole);
      if (!hasAccess) {
        throw new Error('Access denied to complaint history');
      }

      // Get complaint details
      const complaintResult = await pool.query(`
        SELECT c.*, cat.name as category_name, u.full_name as citizen_name,
               a.full_name as authority_name, a.authority_level
        FROM complaints c
        JOIN categories cat ON c.category_id = cat.id
        JOIN users u ON c.user_id = u.id
        LEFT JOIN authorities a ON c.assigned_authority_id = a.id
        WHERE c.id = $1
      `, [complaintId]);

      if (complaintResult.rows.length === 0) {
        throw new Error('Complaint not found');
      }

      const complaint = complaintResult.rows[0];

      // Get audit history
      const history = await AuditService.getComplaintHistory(complaintId, {
        includeMetadata: userRole === 'admin'
      });

      // Get statistics
      const stats = await AuditService.getComplaintStats(complaintId);

      return {
        complaint,
        history,
        stats
      };

    } catch (error) {
      console.error('Get complaint with history error:', error);
      throw error;
    }
  }
}

module.exports = ComplaintService;