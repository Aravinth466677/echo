/**
 * COMPLAINT LIFECYCLE SERVICE WITH NOTIFICATIONS
 * Integration of notification system with existing complaint lifecycle
 */

const pool = require('../config/database');
const { canTransition, validateTransitionContext, getStatusDescription } = require('../utils/transitionGuard');
const notificationService = require('./notificationService');

class ComplaintLifecycleService {
    
    /**
     * Transition complaint to new status with full validation, audit, and notifications
     * @param {number} complaintId - Complaint ID
     * @param {string} nextStatus - Target status
     * @param {number} userId - User making the change
     * @param {string} role - User role
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Result object
     */
    async transitionStatus(complaintId, nextStatus, userId, role, options = {}) {
        const client = await pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // Get current complaint data
            const complaint = await this.getComplaintById(complaintId, client);
            if (!complaint) {
                throw new Error('Complaint not found');
            }
            
            const currentStatus = complaint.lifecycle_status;
            
            // Build context for validation
            const context = {
                userId,
                assignedTo: complaint.assigned_to,
                complainantId: complaint.user_id,
                rejectionReason: options.rejectionReason,
                previousStatus: currentStatus,
                verifiedBy: nextStatus === 'VERIFIED' ? userId : null,
                ...options
            };
            
            // Validate transition
            const transitionCheck = canTransition(currentStatus, nextStatus, role, context);
            if (!transitionCheck.valid) {
                throw new Error(transitionCheck.error);
            }
            
            // Validate context requirements
            const contextCheck = validateTransitionContext(nextStatus, context);
            if (!contextCheck.valid) {
                throw new Error(contextCheck.error);
            }
            
            // Prepare update data
            const updateData = {
                lifecycle_status: nextStatus.toUpperCase(),
                updated_at: new Date()
            };
            
            // Add status-specific fields
            await this.addStatusSpecificFields(updateData, nextStatus, context);
            
            // Update complaint
            const updateResult = await this.updateComplaint(complaintId, updateData, client);
            
            // Log the transition in audit trail
            await this.logStatusChange(
                complaintId,
                currentStatus,
                nextStatus.toUpperCase(),
                userId,
                role,
                options.remarks,
                client
            );
            
            await client.query('COMMIT');
            
            // 🔔 CREATE NOTIFICATIONS AFTER SUCCESSFUL TRANSITION
            await this.createStatusChangeNotifications(
                complaint,
                currentStatus,
                nextStatus.toUpperCase(),
                userId,
                role,
                context
            );
            
            return {
                success: true,
                complaintId,
                oldStatus: currentStatus,
                newStatus: nextStatus.toUpperCase(),
                message: `Complaint transitioned from ${currentStatus} to ${nextStatus.toUpperCase()}`,
                updatedAt: updateData.updated_at
            };
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }
    
    /**
     * Create notifications based on status change
     * @param {Object} complaint - Complaint data
     * @param {string} oldStatus - Previous status
     * @param {string} newStatus - New status
     * @param {number} userId - User making the change
     * @param {string} role - User role
     * @param {Object} context - Additional context
     */
    async createStatusChangeNotifications(complaint, oldStatus, newStatus, userId, role, context) {
        try {
            const complaintId = complaint.id;
            const complainantId = complaint.user_id;
            const assignedAuthorityId = complaint.assigned_to;
            const authorityName = complaint.assigned_authority_name;
            
            // Notification context for message generation
            const notificationContext = {
                authorityName,
                status: newStatus,
                category: complaint.category_name
            };
            
            switch (newStatus) {
                case 'ASSIGNED':
                    // Notify citizen that their complaint has been assigned
                    if (complainantId) {
                        await notificationService.createComplaintNotification(
                            complainantId,
                            'ASSIGNED',
                            complaintId,
                            notificationContext
                        );
                    }
                    
                    // Notify authority about new assignment
                    if (context.assignedTo && context.assignedTo !== complainantId) {
                        await notificationService.createComplaintNotification(
                            context.assignedTo,
                            'ASSIGNED',
                            complaintId,
                            { ...notificationContext, isForAuthority: true }
                        );
                    }
                    break;
                    
                case 'IN_PROGRESS':
                    // If coming from RESOLVED (rejection), notify authority
                    if (oldStatus === 'RESOLVED') {
                        if (assignedAuthorityId) {
                            await notificationService.createComplaintNotification(
                                assignedAuthorityId,
                                'REOPENED',
                                complaintId,
                                { ...notificationContext, rejectionReason: context.rejectionReason }
                            );
                        }
                    } else {
                        // Normal progress update - notify citizen
                        if (complainantId) {
                            await notificationService.createComplaintNotification(
                                complainantId,
                                'STATUS_UPDATE',
                                complaintId,
                                notificationContext
                            );
                        }
                    }
                    break;
                    
                case 'RESOLVED':
                    // Notify citizen to verify resolution
                    if (complainantId) {
                        await notificationService.createComplaintNotification(
                            complainantId,
                            'RESOLVED',
                            complaintId,
                            notificationContext
                        );
                    }
                    break;
                    
                case 'VERIFIED':
                    // Notify authority that resolution was verified
                    if (assignedAuthorityId && assignedAuthorityId !== userId) {
                        await notificationService.createComplaintNotification(
                            assignedAuthorityId,
                            'VERIFIED',
                            complaintId,
                            notificationContext
                        );
                    }
                    break;
                    
                case 'CLOSED':
                    // Notify citizen that complaint is closed
                    if (complainantId && complainantId !== userId) {
                        await notificationService.createComplaintNotification(
                            complainantId,
                            'CLOSED',
                            complaintId,
                            notificationContext
                        );
                    }
                    
                    // Notify authority if they didn't close it
                    if (assignedAuthorityId && assignedAuthorityId !== userId) {
                        await notificationService.createComplaintNotification(
                            assignedAuthorityId,
                            'CLOSED',
                            complaintId,
                            notificationContext
                        );
                    }
                    break;
            }
            
        } catch (error) {
            // Don't fail the main transaction if notifications fail
            console.error('Error creating status change notifications:', error);
        }
    }
    
    /**
     * Create escalation notification
     * @param {number} complaintId - Complaint ID
     * @param {number} newAuthorityId - New authority ID
     * @param {string} reason - Escalation reason
     */
    async createEscalationNotification(complaintId, newAuthorityId, reason = 'SLA breach') {
        try {
            const complaint = await this.getComplaintById(complaintId);
            if (!complaint) return;
            
            // Notify new authority about escalation
            await notificationService.createComplaintNotification(
                newAuthorityId,
                'ESCALATED',
                complaintId,
                {
                    reason,
                    category: complaint.category_name,
                    originalAuthority: complaint.assigned_authority_name
                }
            );
            
            // Notify citizen about escalation
            if (complaint.user_id) {
                await notificationService.createNotification(
                    complaint.user_id,
                    'Complaint Escalated',
                    `Your complaint #${complaintId} has been escalated to a higher authority due to ${reason}.`,
                    'ESCALATED',
                    complaintId
                );
            }
            
        } catch (error) {
            console.error('Error creating escalation notification:', error);
        }
    }
    
    /**
     * Create SLA breach notification
     * @param {number} complaintId - Complaint ID
     * @param {number} authorityId - Authority ID
     * @param {number} hoursOverdue - Hours overdue
     */
    async createSLABreachNotification(complaintId, authorityId, hoursOverdue) {
        try {
            const complaint = await this.getComplaintById(complaintId);
            if (!complaint) return;
            
            // Notify authority about SLA breach
            await notificationService.createNotification(
                authorityId,
                'SLA Breach Alert',
                `Complaint #${complaintId} has breached its SLA deadline by ${hoursOverdue} hours. Immediate attention required.`,
                'SLA_BREACH',
                complaintId
            );
            
        } catch (error) {
            console.error('Error creating SLA breach notification:', error);
        }
    }
    
    // ... (rest of the existing methods remain the same)
    
    /**
     * Add status-specific fields to update data
     * @param {Object} updateData - Update data object
     * @param {string} nextStatus - Next status
     * @param {Object} context - Context object
     */
    async addStatusSpecificFields(updateData, nextStatus, context) {
        const status = nextStatus.toUpperCase();
        
        switch (status) {
            case 'ASSIGNED':
                updateData.assigned_to = context.assignedTo;
                updateData.assigned_at = new Date();
                break;
                
            case 'IN_PROGRESS':
                // If coming from RESOLVED (rejection), clear resolution data
                if (context.previousStatus === 'RESOLVED') {
                    updateData.resolved_at = null;
                    updateData.rejection_reason = context.rejectionReason;
                    updateData.verification_status = 'PENDING';
                }
                updateData.in_progress_at = new Date();
                break;
                
            case 'RESOLVED':
                updateData.resolved_at = new Date();
                updateData.verification_status = 'PENDING';
                updateData.rejection_reason = null; // Clear any previous rejection
                break;
                
            case 'VERIFIED':
                updateData.verified_by = context.verifiedBy;
                updateData.verified_at = new Date();
                updateData.verification_status = 'VERIFIED';
                break;
                
            case 'CLOSED':
                updateData.closed_at = new Date();
                break;
        }
    }
    
    /**
     * Get complaint by ID with all relevant data
     * @param {number} complaintId - Complaint ID
     * @param {Object} client - Database client
     * @returns {Promise<Object>} Complaint data
     */
    async getComplaintById(complaintId, client = null) {
        const dbClient = client || pool;
        
        const query = `
            SELECT 
                c.*,
                u.full_name as complainant_name,
                a.full_name as assigned_authority_name,
                cat.name as category_name
            FROM complaints c
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN users a ON c.assigned_to = a.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.id = $1
        `;
        
        const result = await dbClient.query(query, [complaintId]);
        return result.rows[0];
    }
    
    /**
     * Update complaint with new data
     * @param {number} complaintId - Complaint ID
     * @param {Object} updateData - Data to update
     * @param {Object} client - Database client
     * @returns {Promise<Object>} Update result
     */
    async updateComplaint(complaintId, updateData, client) {
        const fields = Object.keys(updateData);
        const values = Object.values(updateData);
        const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
        
        const query = `
            UPDATE complaints 
            SET ${setClause}
            WHERE id = $1
            RETURNING *
        `;
        
        const result = await client.query(query, [complaintId, ...values]);
        return result.rows[0];
    }
    
    /**
     * Log status change in audit trail
     * @param {number} complaintId - Complaint ID
     * @param {string} oldStatus - Previous status
     * @param {string} newStatus - New status
     * @param {number} userId - User making change
     * @param {string} role - User role
     * @param {string} remarks - Optional remarks
     * @param {Object} client - Database client
     */
    async logStatusChange(complaintId, oldStatus, newStatus, userId, role, remarks, client) {
        const query = `
            INSERT INTO complaint_history 
            (complaint_id, old_status, new_status, changed_by, role, remarks)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
        `;
        
        await client.query(query, [
            complaintId,
            oldStatus,
            newStatus,
            userId,
            role,
            remarks || null
        ]);
    }
    
    // ... (other existing methods remain unchanged)
}

module.exports = new ComplaintLifecycleService();