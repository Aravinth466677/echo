/**
 * NOTIFICATION SERVICE
 * Complete service for managing in-app notifications
 */

const pool = require('../config/database');

class NotificationService {
    isMissingNotificationsSchema(error) {
        return error?.code === '42P01';
    }

    isMissingRelationSchema(error) {
        return ['42P01', '42703'].includes(error?.code);
    }

    buildSchemaError() {
        return new Error('Notifications are not configured. Run database/notifications_migration.sql.');
    }

    buildNotificationSelectQuery(userId, options = {}) {
        const {
            limit = 50,
            offset = 0,
            unreadOnly = false,
            includeComplaintDetails = true
        } = options;

        let query = `
            SELECT 
                n.*,
                ${
                    includeComplaintDetails
                        ? `
                    c.description as complaint_description,
                    i.status as complaint_status,
                    cat.name as complaint_category
                    `
                        : 'NULL as complaint_description, NULL as complaint_status, NULL as complaint_category'
                }
            FROM notifications n
            ${
                includeComplaintDetails
                    ? `
                LEFT JOIN complaints c ON n.complaint_id = c.id
                LEFT JOIN issues i ON c.issue_id = i.id
                LEFT JOIN categories cat ON c.category_id = cat.id
                `
                    : ''
            }
            WHERE n.user_id = $1
        `;

        const values = [userId];
        let paramIndex = 2;

        if (unreadOnly) {
            query += ` AND n.is_read = FALSE`;
        }

        query += ` ORDER BY n.created_at DESC`;

        if (limit) {
            query += ` LIMIT $${paramIndex}`;
            values.push(limit);
            paramIndex++;
        }

        if (offset) {
            query += ` OFFSET $${paramIndex}`;
            values.push(offset);
        }

        return { query, values };
    }
    
    /**
     * Create a new notification
     * @param {number} userId - Recipient user ID
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     * @param {string} type - Notification type (STATUS_UPDATE, ASSIGNED, etc.)
     * @param {number|null} complaintId - Related complaint ID (optional)
     * @returns {Promise<Object>} Created notification
     */
    async createNotification(userId, title, message, type, complaintId = null) {
        try {
            const query = `
                INSERT INTO notifications (user_id, title, message, type, complaint_id)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
            `;
            
            const values = [userId, title, message, type, complaintId];
            const result = await pool.query(query, values);
            
            console.log(`📧 Notification created for user ${userId}: ${title}`);
            return result.rows[0];
            
        } catch (error) {
            if (this.isMissingNotificationsSchema(error)) {
                throw this.buildSchemaError();
            }
            console.error('Error creating notification:', error);
            throw new Error('Failed to create notification');
        }
    }
    
    /**
     * Get all notifications for a user
     * @param {number} userId - User ID
     * @param {Object} options - Query options
     * @returns {Promise<Array>} User notifications
     */
    async getUserNotifications(userId, options = {}) {
        try {
            const { query, values } = this.buildNotificationSelectQuery(userId, options);
            const result = await pool.query(query, values);
            return result.rows;
            
        } catch (error) {
            if (this.isMissingNotificationsSchema(error)) {
                console.warn('Notifications table is missing. Returning an empty notification list.');
                return [];
            }

            if (options.includeComplaintDetails !== false && this.isMissingRelationSchema(error)) {
                console.warn(
                    'Notification detail joins are unavailable. Falling back to basic notification fields.',
                    error.message
                );

                const fallbackQuery = this.buildNotificationSelectQuery(userId, {
                    ...options,
                    includeComplaintDetails: false
                });

                const fallbackResult = await pool.query(fallbackQuery.query, fallbackQuery.values);
                return fallbackResult.rows;
            }
            console.error('Error fetching user notifications:', error);
            throw new Error('Failed to fetch notifications');
        }
    }
    
    /**
     * Get unread notification count for a user
     * @param {number} userId - User ID
     * @returns {Promise<number>} Unread count
     */
    async getUnreadCount(userId) {
        try {
            const query = `
                SELECT COUNT(*) as unread_count
                FROM notifications
                WHERE user_id = $1 AND is_read = FALSE
            `;
            
            const result = await pool.query(query, [userId]);
            return parseInt(result.rows[0].unread_count);
            
        } catch (error) {
            if (this.isMissingNotificationsSchema(error)) {
                console.warn('Notifications table is missing. Returning unread count 0.');
                return 0;
            }
            console.error('Error getting unread count:', error);
            throw new Error('Failed to get unread count');
        }
    }
    
    /**
     * Mark a notification as read
     * @param {string} notificationId - Notification UUID
     * @param {number} userId - User ID (for security)
     * @returns {Promise<Object>} Updated notification
     */
    async markAsRead(notificationId, userId) {
        try {
            const query = `
                UPDATE notifications 
                SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP
                WHERE id = $1 AND user_id = $2
                RETURNING *
            `;
            
            const result = await pool.query(query, [notificationId, userId]);
            
            if (result.rows.length === 0) {
                throw new Error('Notification not found or access denied');
            }
            
            return result.rows[0];
            
        } catch (error) {
            if (this.isMissingNotificationsSchema(error)) {
                throw this.buildSchemaError();
            }
            console.error('Error marking notification as read:', error);
            throw error;
        }
    }
    
    /**
     * Mark all notifications as read for a user
     * @param {number} userId - User ID
     * @returns {Promise<number>} Number of notifications marked as read
     */
    async markAllAsRead(userId) {
        try {
            const query = `
                UPDATE notifications 
                SET is_read = TRUE, updated_at = CURRENT_TIMESTAMP
                WHERE user_id = $1 AND is_read = FALSE
            `;
            
            const result = await pool.query(query, [userId]);
            return result.rowCount;
            
        } catch (error) {
            if (this.isMissingNotificationsSchema(error)) {
                throw this.buildSchemaError();
            }
            console.error('Error marking all notifications as read:', error);
            throw new Error('Failed to mark all notifications as read');
        }
    }
    
    /**
     * Delete a notification
     * @param {string} notificationId - Notification UUID
     * @param {number} userId - User ID (for security)
     * @returns {Promise<boolean>} Success status
     */
    async deleteNotification(notificationId, userId) {
        try {
            const query = `
                DELETE FROM notifications 
                WHERE id = $1 AND user_id = $2
            `;
            
            const result = await pool.query(query, [notificationId, userId]);
            return result.rowCount > 0;
            
        } catch (error) {
            if (this.isMissingNotificationsSchema(error)) {
                throw this.buildSchemaError();
            }
            console.error('Error deleting notification:', error);
            throw new Error('Failed to delete notification');
        }
    }
    
    /**
     * Get notification by ID (with user verification)
     * @param {string} notificationId - Notification UUID
     * @param {number} userId - User ID (for security)
     * @returns {Promise<Object|null>} Notification or null
     */
    async getNotificationById(notificationId, userId) {
        try {
            const query = `
                SELECT n.*, 
                       c.description as complaint_description,
                       i.status as complaint_status
                FROM notifications n
                LEFT JOIN complaints c ON n.complaint_id = c.id
                LEFT JOIN issues i ON c.issue_id = i.id
                WHERE n.id = $1 AND n.user_id = $2
            `;
            
            const result = await pool.query(query, [notificationId, userId]);
            return result.rows[0] || null;
            
        } catch (error) {
            if (this.isMissingNotificationsSchema(error)) {
                throw this.buildSchemaError();
            }

            if (this.isMissingRelationSchema(error)) {
                const fallbackResult = await pool.query(
                    `
                        SELECT n.*,
                               NULL as complaint_description,
                               NULL as complaint_status
                        FROM notifications n
                        WHERE n.id = $1 AND n.user_id = $2
                    `,
                    [notificationId, userId]
                );

                return fallbackResult.rows[0] || null;
            }
            console.error('Error getting notification by ID:', error);
            throw new Error('Failed to get notification');
        }
    }
    
    /**
     * Create complaint-related notification with smart messaging
     * @param {number} userId - Recipient user ID
     * @param {string} type - Notification type
     * @param {number} complaintId - Complaint ID
     * @param {Object} context - Additional context for message generation
     * @returns {Promise<Object>} Created notification
     */
    async createComplaintNotification(userId, type, complaintId, context = {}) {
        const { title, message } = this.generateNotificationContent(type, complaintId, context);
        return this.createNotification(userId, title, message, type, complaintId);
    }
    
    /**
     * Generate notification content based on type and context
     * @param {string} type - Notification type
     * @param {number} complaintId - Complaint ID
     * @param {Object} context - Additional context
     * @returns {Object} { title, message }
     */
    generateNotificationContent(type, complaintId, context = {}) {
        const { authorityName, status, category } = context;
        
        switch (type) {
            case 'ASSIGNED':
                return {
                    title: 'Complaint Assigned',
                    message: `Your complaint #${complaintId} has been assigned to ${authorityName || 'an authority'} for review.`
                };
                
            case 'STATUS_UPDATE':
                return {
                    title: 'Status Update',
                    message: `Your complaint #${complaintId} status has been updated to: ${status || 'In Progress'}.`
                };
                
            case 'RESOLVED':
                return {
                    title: 'Complaint Resolved',
                    message: `Your complaint #${complaintId} has been marked as resolved. Please verify the resolution.`
                };
                
            case 'VERIFIED':
                return {
                    title: 'Resolution Verified',
                    message: `Thank you for verifying the resolution of complaint #${complaintId}. The complaint is now closed.`
                };
                
            case 'REJECTED':
                return {
                    title: 'Resolution Rejected',
                    message: `The resolution for complaint #${complaintId} has been rejected and reopened for further action.`
                };
                
            case 'REOPENED':
                return {
                    title: 'Complaint Reopened',
                    message: `Complaint #${complaintId} has been reopened and assigned back to you for resolution.`
                };
                
            case 'ESCALATED':
                return {
                    title: 'Complaint Escalated',
                    message: `Complaint #${complaintId} has been escalated due to SLA breach and assigned to you.`
                };
                
            case 'SLA_BREACH':
                return {
                    title: 'SLA Breach Alert',
                    message: `Complaint #${complaintId} has breached its SLA deadline. Immediate attention required.`
                };
                
            case 'CLOSED':
                return {
                    title: 'Complaint Closed',
                    message: `Your complaint #${complaintId} has been closed and archived.`
                };
                
            default:
                return {
                    title: 'Complaint Update',
                    message: `There has been an update to your complaint #${complaintId}.`
                };
        }
    }
    
    /**
     * Clean up old notifications (maintenance function)
     * @param {number} daysOld - Days old for cleanup (default: 30)
     * @returns {Promise<number>} Number of notifications deleted
     */
    async cleanupOldNotifications(daysOld = 30) {
        try {
            const query = `
                DELETE FROM notifications 
                WHERE is_read = TRUE 
                AND created_at < CURRENT_TIMESTAMP - INTERVAL '${daysOld} days'
            `;
            
            const result = await pool.query(query);
            console.log(`🧹 Cleaned up ${result.rowCount} old notifications`);
            return result.rowCount;
            
        } catch (error) {
            if (this.isMissingNotificationsSchema(error)) {
                throw this.buildSchemaError();
            }
            console.error('Error cleaning up old notifications:', error);
            throw new Error('Failed to cleanup old notifications');
        }
    }
}

module.exports = new NotificationService();
