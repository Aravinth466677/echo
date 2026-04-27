/**
 * COMPLAINT LIFECYCLE SERVICE
 * Production-ready service for managing complaint status transitions
 */

const pool = require('../config/database');
const { canTransition, validateTransitionContext, getStatusDescription } = require('../utils/transitionGuard');

class ComplaintLifecycleService {
    
    /**
     * Transition complaint to new status with full validation and audit
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
                a.full_name as assigned_authority_name
            FROM complaints c
            LEFT JOIN users u ON c.user_id = u.id
            LEFT JOIN users a ON c.assigned_to = a.id
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
    
    /**
     * Get complaint history with user details
     * @param {number} complaintId - Complaint ID
     * @returns {Promise<Array>} History records
     */
    async getComplaintHistory(complaintId) {
        const query = `
            SELECT 
                ch.*,
                u.full_name as changed_by_name,
                u.email as changed_by_email
            FROM complaint_history ch
            JOIN users u ON ch.changed_by = u.id
            WHERE ch.complaint_id = $1
            ORDER BY ch.created_at ASC
        `;
        
        const result = await pool.query(query, [complaintId]);
        return result.rows;
    }
    
    /**
     * Get complaints by status for a user/role
     * @param {string} status - Status to filter by
     * @param {number} userId - User ID (optional)
     * @param {string} role - User role
     * @param {Object} options - Additional filters
     * @returns {Promise<Array>} Complaints
     */
    async getComplaintsByStatus(status, userId = null, role = null, options = {}) {
        let query = `
            SELECT 
                c.*,
                u.full_name as complainant_name,
                u.email as complainant_email,
                a.full_name as assigned_authority_name,
                cat.name as category_name,
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - c.created_at))/3600 as hours_since_created
            FROM complaints c
            JOIN users u ON c.user_id = u.id
            LEFT JOIN users a ON c.assigned_to = a.id
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE c.lifecycle_status = $1
        `;
        
        const params = [status.toUpperCase()];
        let paramIndex = 2;
        
        // Add role-specific filters
        if (role === 'citizen' && userId) {
            query += ` AND c.user_id = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        } else if (role === 'authority' && userId) {
            query += ` AND c.assigned_to = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        }
        
        // Add additional filters
        if (options.categoryId) {
            query += ` AND c.category_id = $${paramIndex}`;
            params.push(options.categoryId);
            paramIndex++;
        }
        
        if (options.wardId) {
            query += ` AND c.ward_id = $${paramIndex}`;
            params.push(options.wardId);
            paramIndex++;
        }
        
        query += ` ORDER BY c.created_at DESC`;
        
        if (options.limit) {
            query += ` LIMIT $${paramIndex}`;
            params.push(options.limit);
        }
        
        const result = await pool.query(query, params);
        return result.rows;
    }
    
    /**
     * Get complaint statistics by status
     * @param {Object} filters - Optional filters
     * @returns {Promise<Object>} Statistics
     */
    async getComplaintStatistics(filters = {}) {
        let query = `
            SELECT 
                lifecycle_status,
                COUNT(*) as count,
                AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))/3600) as avg_hours_open
            FROM complaints
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;
        
        if (filters.categoryId) {
            query += ` AND category_id = $${paramIndex}`;
            params.push(filters.categoryId);
            paramIndex++;
        }
        
        if (filters.wardId) {
            query += ` AND ward_id = $${paramIndex}`;
            params.push(filters.wardId);
            paramIndex++;
        }
        
        if (filters.dateFrom) {
            query += ` AND created_at >= $${paramIndex}`;
            params.push(filters.dateFrom);
            paramIndex++;
        }
        
        if (filters.dateTo) {
            query += ` AND created_at <= $${paramIndex}`;
            params.push(filters.dateTo);
            paramIndex++;
        }
        
        query += ` GROUP BY lifecycle_status ORDER BY lifecycle_status`;
        
        const result = await pool.query(query, params);
        return result.rows;
    }
    
    /**
     * Check if user can perform action on complaint
     * @param {number} complaintId - Complaint ID
     * @param {number} userId - User ID
     * @param {string} role - User role
     * @param {string} action - Action to check
     * @returns {Promise<Object>} Permission check result
     */
    async checkPermission(complaintId, userId, role, action) {
        const complaint = await this.getComplaintById(complaintId);
        
        if (!complaint) {
            return { allowed: false, reason: 'Complaint not found' };
        }
        
        // Admin can do everything
        if (role === 'admin') {
            return { allowed: true };
        }
        
        // Citizens can only act on their own complaints
        if (role === 'citizen' && complaint.user_id !== userId) {
            return { allowed: false, reason: 'Can only act on your own complaints' };
        }
        
        // Authorities can only act on assigned complaints
        if (role === 'authority' && complaint.assigned_to !== userId) {
            return { allowed: false, reason: 'Can only act on complaints assigned to you' };
        }
        
        return { allowed: true };
    }
}

module.exports = new ComplaintLifecycleService();