/**
 * NOTIFICATION CONTROLLER
 * Handles HTTP requests for notification management
 */

const notificationService = require('../services/notificationService');

class NotificationController {
    constructor() {
        this.getNotifications = this.getNotifications.bind(this);
        this.getUnreadCount = this.getUnreadCount.bind(this);
        this.markAsRead = this.markAsRead.bind(this);
        this.markAllAsRead = this.markAllAsRead.bind(this);
        this.getNotification = this.getNotification.bind(this);
        this.deleteNotification = this.deleteNotification.bind(this);
        this.createTestNotification = this.createTestNotification.bind(this);
    }

    toISODate(value) {
        if (!value) {
            return null;
        }

        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
    }
    
    /**
     * Get all notifications for the authenticated user
     * GET /api/notifications
     */
    async getNotifications(req, res) {
        try {
            const { id: userId } = req.user;
            const { 
                limit = 50, 
                offset = 0, 
                unread_only = false 
            } = req.query;
            
            const options = {
                limit: Math.min(parseInt(limit), 100), // Max 100 notifications
                offset: parseInt(offset),
                unreadOnly: unread_only === 'true',
                includeComplaintDetails: true
            };
            
            const notifications = await notificationService.getUserNotifications(userId, options);
            const unreadCount = await notificationService.getUnreadCount(userId);
            
            // Format timestamps for frontend
            const formattedNotifications = notifications.map(notification => ({
                ...notification,
                created_at: this.toISODate(notification.created_at),
                updated_at: this.toISODate(notification.updated_at),
                time_ago: this.getTimeAgo(notification.created_at)
            }));
            
            res.json({
                success: true,
                notifications: formattedNotifications,
                unread_count: unreadCount,
                total: formattedNotifications.length
            });
            
        } catch (error) {
            console.error('Error fetching notifications:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch notifications'
            });
        }
    }
    
    /**
     * Get unread notification count
     * GET /api/notifications/unread-count
     */
    async getUnreadCount(req, res) {
        try {
            const { id: userId } = req.user;
            const unreadCount = await notificationService.getUnreadCount(userId);
            
            res.json({
                success: true,
                unread_count: unreadCount
            });
            
        } catch (error) {
            console.error('Error fetching unread count:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch unread count'
            });
        }
    }
    
    /**
     * Mark a notification as read
     * PATCH /api/notifications/:id/read
     */
    async markAsRead(req, res) {
        try {
            const { id: notificationId } = req.params;
            const { id: userId } = req.user;
            
            const updatedNotification = await notificationService.markAsRead(notificationId, userId);
            
            res.json({
                success: true,
                message: 'Notification marked as read',
                notification: {
                    ...updatedNotification,
                    time_ago: this.getTimeAgo(updatedNotification.created_at)
                }
            });
            
        } catch (error) {
            console.error('Error marking notification as read:', error);
            
            if (error.message === 'Notification not found or access denied') {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }
            
            res.status(500).json({
                success: false,
                error: 'Failed to mark notification as read'
            });
        }
    }
    
    /**
     * Mark all notifications as read
     * PATCH /api/notifications/read-all
     */
    async markAllAsRead(req, res) {
        try {
            const { id: userId } = req.user;
            const updatedCount = await notificationService.markAllAsRead(userId);
            
            res.json({
                success: true,
                message: `${updatedCount} notifications marked as read`,
                updated_count: updatedCount
            });
            
        } catch (error) {
            console.error('Error marking all notifications as read:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to mark all notifications as read'
            });
        }
    }
    
    /**
     * Get a specific notification
     * GET /api/notifications/:id
     */
    async getNotification(req, res) {
        try {
            const { id: notificationId } = req.params;
            const { id: userId } = req.user;
            
            const notification = await notificationService.getNotificationById(notificationId, userId);
            
            if (!notification) {
                return res.status(404).json({
                    success: false,
                    error: 'Notification not found'
                });
            }
            
            res.json({
                success: true,
                notification: {
                    ...notification,
                    time_ago: this.getTimeAgo(notification.created_at)
                }
            });
            
        } catch (error) {
            console.error('Error fetching notification:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to fetch notification'
            });
        }
    }
    
    /**
     * Delete a notification
     * DELETE /api/notifications/:id
     */
    async deleteNotification(req, res) {
        try {
            const { id: notificationId } = req.params;
            const { id: userId } = req.user;
            
            const deleted = await notificationService.deleteNotification(notificationId, userId);
            
            if (!deleted) {
                return res.status(404).json({
                    success: false,
                    error: 'Notification not found'
                });
            }
            
            res.json({
                success: true,
                message: 'Notification deleted successfully'
            });
            
        } catch (error) {
            console.error('Error deleting notification:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to delete notification'
            });
        }
    }
    
    /**
     * Create a test notification (development only)
     * POST /api/notifications/test
     */
    async createTestNotification(req, res) {
        try {
            // Only allow in development
            if (process.env.NODE_ENV === 'production') {
                return res.status(403).json({
                    success: false,
                    error: 'Test notifications not allowed in production'
                });
            }
            
            const { id: userId } = req.user;
            const { title, message, type = 'STATUS_UPDATE', complaint_id } = req.body;
            
            if (!title || !message) {
                return res.status(400).json({
                    success: false,
                    error: 'Title and message are required'
                });
            }
            
            const notification = await notificationService.createNotification(
                userId,
                title,
                message,
                type,
                complaint_id || null
            );
            
            res.json({
                success: true,
                message: 'Test notification created',
                notification: {
                    ...notification,
                    time_ago: this.getTimeAgo(notification.created_at)
                }
            });
            
        } catch (error) {
            console.error('Error creating test notification:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create test notification'
            });
        }
    }
    
    /**
     * Helper function to calculate time ago
     * @param {Date} date - Date to calculate from
     * @returns {string} Human readable time ago
     */
    getTimeAgo(date) {
        if (!date) {
            return 'Unknown time';
        }

        const now = new Date();
        const parsedDate = new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
            return 'Unknown time';
        }

        const diffInSeconds = Math.floor((now - parsedDate) / 1000);
        
        if (diffInSeconds < 60) {
            return 'Just now';
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 604800) {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} day${days > 1 ? 's' : ''} ago`;
        } else {
            return parsedDate.toLocaleDateString();
        }
    }
}

module.exports = new NotificationController();
