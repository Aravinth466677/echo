/**
 * NOTIFICATION ROUTES
 * API routes for notification management
 */

const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authenticate, authorize } = require('../middleware/auth');
const { param, query, body, validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
    }
    next();
};

// Validation rules
const paginationValidation = [
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
    query('offset')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Offset must be a non-negative integer'),
    query('unread_only')
        .optional()
        .isBoolean()
        .withMessage('unread_only must be a boolean')
];

const uuidValidation = [
    param('id')
        .isUUID()
        .withMessage('Invalid notification ID format')
];

const testNotificationValidation = [
    body('title')
        .notEmpty()
        .isLength({ max: 255 })
        .withMessage('Title is required and must be less than 255 characters'),
    body('message')
        .notEmpty()
        .isLength({ max: 1000 })
        .withMessage('Message is required and must be less than 1000 characters'),
    body('type')
        .optional()
        .isIn(['STATUS_UPDATE', 'ASSIGNED', 'RESOLVED', 'VERIFIED', 'REJECTED', 'REOPENED', 'CLOSED', 'SLA_BREACH', 'ESCALATED'])
        .withMessage('Invalid notification type'),
    body('complaint_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('complaint_id must be a valid integer')
];

/**
 * @route GET /api/notifications
 * @desc Get all notifications for authenticated user
 * @access Private
 */
router.get(
    '/',
    authenticate,
    authorize('citizen'),
    paginationValidation,
    handleValidationErrors,
    notificationController.getNotifications
);

/**
 * @route GET /api/notifications/unread-count
 * @desc Get unread notification count
 * @access Private
 */
router.get(
    '/unread-count',
    authenticate,
    authorize('citizen'),
    notificationController.getUnreadCount
);

/**
 * @route PATCH /api/notifications/read-all
 * @desc Mark all notifications as read
 * @access Private
 */
router.patch(
    '/read-all',
    authenticate,
    authorize('citizen'),
    notificationController.markAllAsRead
);

/**
 * @route GET /api/notifications/:id
 * @desc Get a specific notification
 * @access Private
 */
router.get(
    '/:id',
    authenticate,
    authorize('citizen'),
    uuidValidation,
    handleValidationErrors,
    notificationController.getNotification
);

/**
 * @route PATCH /api/notifications/:id/read
 * @desc Mark a notification as read
 * @access Private
 */
router.patch(
    '/:id/read',
    authenticate,
    authorize('citizen'),
    uuidValidation,
    handleValidationErrors,
    notificationController.markAsRead
);

/**
 * @route DELETE /api/notifications/:id
 * @desc Delete a notification
 * @access Private
 */
router.delete(
    '/:id',
    authenticate,
    authorize('citizen'),
    uuidValidation,
    handleValidationErrors,
    notificationController.deleteNotification
);

/**
 * @route POST /api/notifications/test
 * @desc Create a test notification (development only)
 * @access Private
 */
router.post(
    '/test',
    authenticate,
    authorize('citizen'),
    testNotificationValidation,
    handleValidationErrors,
    notificationController.createTestNotification
);

module.exports = router;
