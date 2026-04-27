/**
 * COMPLAINT LIFECYCLE ROUTES
 * Production-ready API routes for complaint status management
 */

const express = require('express');
const router = express.Router();
const complaintLifecycleController = require('../controllers/complaintLifecycleController');
const { authenticateToken } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

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
const statusValidation = [
    body('next_status')
        .isIn(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED'])
        .withMessage('Invalid status'),
    body('remarks')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Remarks must be less than 500 characters'),
    body('rejection_reason')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Rejection reason must be less than 500 characters'),
    body('assigned_to')
        .optional()
        .isInt({ min: 1 })
        .withMessage('assigned_to must be a valid user ID')
];

const assignValidation = [
    body('authority_id')
        .isInt({ min: 1 })
        .withMessage('authority_id is required and must be a valid user ID'),
    body('remarks')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Remarks must be less than 500 characters')
];

const verifyValidation = [
    body('verified')
        .isBoolean()
        .withMessage('verified field is required and must be boolean'),
    body('rejection_reason')
        .if(body('verified').equals(false))
        .notEmpty()
        .withMessage('rejection_reason is required when verified is false')
        .isLength({ max: 500 })
        .withMessage('Rejection reason must be less than 500 characters'),
    body('remarks')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Remarks must be less than 500 characters')
];

const paramValidation = [
    param('id')
        .isInt({ min: 1 })
        .withMessage('Invalid complaint ID'),
    param('status')
        .optional()
        .isIn(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED'])
        .withMessage('Invalid status')
];

const queryValidation = [
    query('category_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('category_id must be a valid integer'),
    query('ward_id')
        .optional()
        .isInt({ min: 1 })
        .withMessage('ward_id must be a valid integer'),
    query('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('limit must be between 1 and 100'),
    query('date_from')
        .optional()
        .isISO8601()
        .withMessage('date_from must be a valid ISO date'),
    query('date_to')
        .optional()
        .isISO8601()
        .withMessage('date_to must be a valid ISO date')
];

/**
 * @route PATCH /api/complaints/:id/status
 * @desc Update complaint status
 * @access Private (All roles with permissions)
 */
router.patch(
    '/:id/status',
    authenticateToken,
    paramValidation,
    statusValidation,
    handleValidationErrors,
    complaintLifecycleController.updateStatus
);

/**
 * @route GET /api/complaints/:id/details
 * @desc Get complaint details with history
 * @access Private (All roles with permissions)
 */
router.get(
    '/:id/details',
    authenticateToken,
    paramValidation,
    handleValidationErrors,
    complaintLifecycleController.getComplaintDetails
);

/**
 * @route GET /api/complaints/status/:status
 * @desc Get complaints by status
 * @access Private (All roles)
 */
router.get(
    '/status/:status',
    authenticateToken,
    paramValidation,
    queryValidation,
    handleValidationErrors,
    complaintLifecycleController.getComplaintsByStatus
);

/**
 * @route GET /api/complaints/statistics
 * @desc Get complaint statistics
 * @access Private (Admin, Authority only)
 */
router.get(
    '/statistics',
    authenticateToken,
    queryValidation,
    handleValidationErrors,
    complaintLifecycleController.getStatistics
);

/**
 * @route POST /api/complaints/:id/assign
 * @desc Assign complaint to authority
 * @access Private (Admin, Authority only)
 */
router.post(
    '/:id/assign',
    authenticateToken,
    paramValidation,
    assignValidation,
    handleValidationErrors,
    complaintLifecycleController.assignComplaint
);

/**
 * @route POST /api/complaints/:id/verify
 * @desc Verify complaint resolution (citizen only)
 * @access Private (Citizen only)
 */
router.post(
    '/:id/verify',
    authenticateToken,
    paramValidation,
    verifyValidation,
    handleValidationErrors,
    complaintLifecycleController.verifyResolution
);

/**
 * @route GET /api/complaints/:id/history
 * @desc Get complaint status history
 * @access Private (All roles with permissions)
 */
router.get(
    '/:id/history',
    authenticateToken,
    paramValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { id } = req.params;
            const { id: userId, role } = req.user;
            
            // Check permissions using the service
            const complaintLifecycleService = require('../services/complaintLifecycleService');
            const permissionCheck = await complaintLifecycleService.checkPermission(
                parseInt(id), 
                userId, 
                role, 
                'view_history'
            );
            
            if (!permissionCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: permissionCheck.reason
                });
            }
            
            const history = await complaintLifecycleService.getComplaintHistory(parseInt(id));
            
            res.json({
                success: true,
                data: history
            });
            
        } catch (error) {
            console.error('Error getting complaint history:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
);

/**
 * @route GET /api/complaints/my-queue
 * @desc Get complaints assigned to current user (authority)
 * @access Private (Authority only)
 */
router.get(
    '/my-queue',
    authenticateToken,
    queryValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { id: userId, role } = req.user;
            
            if (role !== 'authority') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied - Authority role required'
                });
            }
            
            const { status = 'ASSIGNED', limit = 50 } = req.query;
            
            const complaintLifecycleService = require('../services/complaintLifecycleService');
            const complaints = await complaintLifecycleService.getComplaintsByStatus(
                status,
                userId,
                role,
                { limit: parseInt(limit) }
            );
            
            res.json({
                success: true,
                data: complaints,
                count: complaints.length
            });
            
        } catch (error) {
            console.error('Error getting authority queue:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
);

/**
 * @route GET /api/complaints/my-complaints
 * @desc Get complaints submitted by current user (citizen)
 * @access Private (Citizen only)
 */
router.get(
    '/my-complaints',
    authenticateToken,
    queryValidation,
    handleValidationErrors,
    async (req, res) => {
        try {
            const { id: userId, role } = req.user;
            
            if (role !== 'citizen') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied - Citizen role required'
                });
            }
            
            const { status, limit = 50 } = req.query;
            
            const complaintLifecycleService = require('../services/complaintLifecycleService');
            
            if (status) {
                const complaints = await complaintLifecycleService.getComplaintsByStatus(
                    status,
                    userId,
                    role,
                    { limit: parseInt(limit) }
                );
                
                res.json({
                    success: true,
                    data: complaints,
                    count: complaints.length
                });
            } else {
                // Get all complaints for citizen across all statuses
                const statuses = ['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'VERIFIED', 'CLOSED'];
                const allComplaints = [];
                
                for (const status of statuses) {
                    const complaints = await complaintLifecycleService.getComplaintsByStatus(
                        status,
                        userId,
                        role,
                        { limit: 1000 } // High limit for citizen's own complaints
                    );
                    allComplaints.push(...complaints);
                }
                
                // Sort by creation date (newest first)
                allComplaints.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                
                // Apply limit
                const limitedComplaints = allComplaints.slice(0, parseInt(limit));
                
                res.json({
                    success: true,
                    data: limitedComplaints,
                    count: limitedComplaints.length,
                    total: allComplaints.length
                });
            }
            
        } catch (error) {
            console.error('Error getting citizen complaints:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
);

module.exports = router;