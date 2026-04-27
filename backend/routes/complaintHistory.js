const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, authorize } = require('../middleware/auth');
const AuditService = require('../services/auditService');
const ComplaintService = require('../services/complaintService');

/**
 * Get complaint history/timeline
 * GET /api/complaints/:id/history
 */
router.get('/:id/history', authenticate, async (req, res) => {
  const complaintId = parseInt(req.params.id);
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // Validate access to complaint history
    const hasAccess = await AuditService.validateHistoryAccess(complaintId, userId, userRole);
    
    if (!hasAccess) {
      return res.status(403).json({ 
        error: 'Access denied', 
        message: 'You do not have permission to view this complaint history' 
      });
    }

    // Get complaint history
    const history = await AuditService.getComplaintHistory(complaintId, {
      includeMetadata: userRole === 'admin'
    });

    // Get complaint basic info
    const complaintResult = await pool.query(`
      SELECT c.id, c.status, c.created_at, cat.name as category_name,
             u.full_name as citizen_name, a.full_name as authority_name
      FROM complaints c
      JOIN categories cat ON c.category_id = cat.id
      JOIN users u ON c.user_id = u.id
      LEFT JOIN authorities a ON c.assigned_authority_id = a.id
      WHERE c.id = $1
    `, [complaintId]);

    if (complaintResult.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found' });
    }

    const complaint = complaintResult.rows[0];

    // Get statistics
    const stats = await AuditService.getComplaintStats(complaintId);

    res.json({
      success: true,
      complaint: {
        id: complaint.id,
        status: complaint.status,
        categoryName: complaint.category_name,
        citizenName: complaint.citizen_name,
        authorityName: complaint.authority_name,
        createdAt: complaint.created_at
      },
      timeline: history.map(entry => ({
        id: entry.id,
        action: entry.action,
        oldStatus: entry.old_status,
        newStatus: entry.new_status,
        role: entry.role,
        changedBy: entry.changed_by_name || 'System',
        changedByEmail: userRole === 'admin' ? entry.changed_by_email : undefined,
        description: entry.description,
        remarks: entry.remarks,
        timestamp: entry.created_at,
        metadata: (userRole === 'admin' && entry.metadata) ? entry.metadata : undefined
      })),
      statistics: {
        totalActions: parseInt(stats.total_actions),
        uniqueActors: parseInt(stats.unique_actors),
        statusChanges: parseInt(stats.status_changes),
        citizenActions: parseInt(stats.citizen_actions),
        authorityActions: parseInt(stats.authority_actions),
        adminActions: parseInt(stats.admin_actions),
        firstAction: stats.first_action,
        lastAction: stats.last_action
      }
    });

  } catch (error) {
    console.error('Get complaint history error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch complaint history', 
      message: error.message 
    });
  }
});

/**
 * Get public complaint timeline (sanitized)
 * GET /api/public/complaints/:id/timeline
 */
router.get('/public/:id/timeline', async (req, res) => {
  const complaintId = parseInt(req.params.id);

  try {
    // Check if complaint exists and is not sensitive
    const complaintResult = await pool.query(`
      SELECT c.id, c.status, cat.name as category_name
      FROM complaints c
      JOIN categories cat ON c.category_id = cat.id
      WHERE c.id = $1 AND c.status NOT IN ('rejected')
    `, [complaintId]);

    if (complaintResult.rows.length === 0) {
      return res.status(404).json({ error: 'Complaint not found or not available for public view' });
    }

    const complaint = complaintResult.rows[0];

    // Get public timeline
    const timeline = await AuditService.getPublicComplaintTimeline(complaintId);

    res.json({
      success: true,
      complaint: {
        id: complaint.id,
        status: complaint.status,
        categoryName: complaint.category_name
      },
      timeline: timeline.map(entry => ({
        action: entry.action,
        oldStatus: entry.oldStatus,
        newStatus: entry.newStatus,
        role: entry.role,
        description: entry.description,
        timestamp: entry.timestamp
      }))
    });

  } catch (error) {
    console.error('Get public complaint timeline error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch public timeline', 
      message: error.message 
    });
  }
});

/**
 * Update complaint status with audit logging
 * PUT /api/complaints/:id/status
 */
router.put('/:id/status', authenticate, authorize(['authority', 'admin']), async (req, res) => {
  const complaintId = parseInt(req.params.id);
  const { status, remarks } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const result = await ComplaintService.updateComplaintStatus({
      complaintId,
      newStatus: status,
      userId,
      userRole: userRole.toUpperCase(),
      remarks,
      metadata: {
        updatedVia: 'api',
        endpoint: '/status'
      },
      req
    });

    res.json({
      success: true,
      message: `Complaint status updated to ${status}`,
      ...result
    });

  } catch (error) {
    console.error('Update complaint status error:', error);
    res.status(500).json({ 
      error: 'Failed to update complaint status', 
      message: error.message 
    });
  }
});

/**
 * Resolve complaint
 * POST /api/complaints/:id/resolve
 */
router.post('/:id/resolve', authenticate, authorize(['authority', 'admin']), async (req, res) => {
  const complaintId = parseInt(req.params.id);
  const { resolutionNotes, evidenceUrl } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const result = await ComplaintService.resolveComplaint({
      complaintId,
      resolvedByUserId: userId,
      resolvedByRole: userRole.toUpperCase(),
      resolutionNotes,
      evidenceUrl,
      metadata: {
        resolvedVia: 'api',
        endpoint: '/resolve'
      },
      req
    });

    res.json({
      success: true,
      message: 'Complaint resolved successfully',
      ...result
    });

  } catch (error) {
    console.error('Resolve complaint error:', error);
    res.status(500).json({ 
      error: 'Failed to resolve complaint', 
      message: error.message 
    });
  }
});

/**
 * Verify complaint resolution (citizen only)
 * POST /api/complaints/:id/verify
 */
router.post('/:id/verify', authenticate, authorize('citizen'), async (req, res) => {
  const complaintId = parseInt(req.params.id);
  const { isVerified, feedback, rating } = req.body;
  const userId = req.user.id;

  try {
    if (typeof isVerified !== 'boolean') {
      return res.status(400).json({ error: 'isVerified must be a boolean value' });
    }

    const result = await ComplaintService.verifyResolution({
      complaintId,
      citizenId: userId,
      isVerified,
      feedback,
      rating: rating ? parseInt(rating) : null,
      metadata: {
        verifiedVia: 'api',
        endpoint: '/verify'
      },
      req
    });

    res.json({
      success: true,
      message: isVerified ? 'Resolution verified successfully' : 'Resolution rejected',
      ...result
    });

  } catch (error) {
    console.error('Verify resolution error:', error);
    res.status(500).json({ 
      error: 'Failed to verify resolution', 
      message: error.message 
    });
  }
});

/**
 * Add comment to complaint
 * POST /api/complaints/:id/comments
 */
router.post('/:id/comments', authenticate, async (req, res) => {
  const complaintId = parseInt(req.params.id);
  const { comment, isInternal = false } = req.body;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    if (!comment || comment.trim().length === 0) {
      return res.status(400).json({ error: 'Comment cannot be empty' });
    }

    // Only authorities and admins can add internal comments
    if (isInternal && !['authority', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Only authorities and admins can add internal comments' });
    }

    const result = await ComplaintService.addComment({
      complaintId,
      userId,
      userRole: userRole.toUpperCase(),
      comment: comment.trim(),
      isInternal,
      metadata: {
        commentVia: 'api',
        endpoint: '/comments'
      },
      req
    });

    res.json({
      success: true,
      message: 'Comment added successfully',
      ...result
    });

  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ 
      error: 'Failed to add comment', 
      message: error.message 
    });
  }
});

/**
 * Get complaint with full details and history (admin/authority view)
 * GET /api/complaints/:id/full
 */
router.get('/:id/full', authenticate, authorize(['authority', 'admin']), async (req, res) => {
  const complaintId = parseInt(req.params.id);
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    const result = await ComplaintService.getComplaintWithHistory(complaintId, userId, userRole);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Get complaint full details error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch complaint details', 
      message: error.message 
    });
  }
});

module.exports = router;