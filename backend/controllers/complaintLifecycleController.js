/**
 * COMPLAINT LIFECYCLE CONTROLLER
 * Production-ready controller for complaint status management
 */

const complaintLifecycleService = require('../services/complaintLifecycleService');
const { getValidNextStates, getStatusDescription } = require('../utils/transitionGuard');
const { auditLog } = require('../middleware/auditLog');

class ComplaintLifecycleController {
    
    /**
     * Update complaint status
     * PATCH /api/complaints/:id/status
     */
    async updateStatus(req, res) {
        try {
            const { id } = req.params;
            const { next_status, remarks, rejection_reason, assigned_to } = req.body;
            const { id: userId, role } = req.user;
            
            // Validate required fields
            if (!next_status) {
                return res.status(400).json({
                    success: false,
                    error: 'next_status is required'
                });
            }
            
            // Check permissions
            const permissionCheck = await complaintLifecycleService.checkPermission(
                parseInt(id), 
                userId, 
                role, 
                'update_status'
            );
            
            if (!permissionCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: permissionCheck.reason
                });
            }
            
            // Prepare options
            const options = {
                remarks,
                rejectionReason: rejection_reason,
                assignedTo: assigned_to
            };
            
            // Perform transition
            const result = await complaintLifecycleService.transitionStatus(
                parseInt(id),
                next_status,
                userId,
                role,
                options
            );
            
            // Log the action
            await auditLog(req, 'COMPLAINT_STATUS_UPDATE', 'complaint', id, {
                oldStatus: result.oldStatus,
                newStatus: result.newStatus,
                remarks
            });
            
            res.json({
                success: true,
                data: result,
                message: result.message
            });
            
        } catch (error) {
            console.error('Error updating complaint status:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
    
    /**
     * Get complaint details with history
     * GET /api/complaints/:id/details
     */
    async getComplaintDetails(req, res) {
        try {
            const { id } = req.params;
            const { id: userId, role } = req.user;
            
            // Check permissions
            const permissionCheck = await complaintLifecycleService.checkPermission(
                parseInt(id), 
                userId, 
                role, 
                'view'
            );
            
            if (!permissionCheck.allowed) {
                return res.status(403).json({
                    success: false,
                    error: permissionCheck.reason
                });
            }
            
            // Get complaint details
            const complaint = await complaintLifecycleService.getComplaintById(parseInt(id));
            if (!complaint) {
                return res.status(404).json({
                    success: false,
                    error: 'Complaint not found'
                });
            }
            
            // Get history
            const history = await complaintLifecycleService.getComplaintHistory(parseInt(id));
            
            // Get valid next states for current user
            const validNextStates = getValidNextStates(complaint.lifecycle_status, role);
            
            res.json({
                success: true,
                data: {
                    complaint: {
                        ...complaint,
                        status_description: getStatusDescription(complaint.lifecycle_status)
                    },
                    history,
                    validNextStates,
                    canUpdate: validNextStates.length > 0
                }
            });
            
        } catch (error) {
            console.error('Error getting complaint details:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
    
    /**
     * Get complaints by status
     * GET /api/complaints/status/:status
     */
    async getComplaintsByStatus(req, res) {
        try {
            const { status } = req.params;
            const { id: userId, role } = req.user;
            const { category_id, ward_id, limit = 50 } = req.query;
            
            const options = {
                categoryId: category_id ? parseInt(category_id) : null,
                wardId: ward_id ? parseInt(ward_id) : null,
                limit: Math.min(parseInt(limit), 100) // Max 100 records
            };
            
            const complaints = await complaintLifecycleService.getComplaintsByStatus(
                status,
                userId,
                role,
                options
            );
            
            // Add status descriptions and valid next states
            const enrichedComplaints = complaints.map(complaint => ({
                ...complaint,
                status_description: getStatusDescription(complaint.lifecycle_status),
                valid_next_states: getValidNextStates(complaint.lifecycle_status, role)
            }));
            
            res.json({
                success: true,
                data: enrichedComplaints,
                count: enrichedComplaints.length
            });
            
        } catch (error) {
            console.error('Error getting complaints by status:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
    
    /**
     * Get complaint statistics
     * GET /api/complaints/statistics
     */
    async getStatistics(req, res) {
        try {
            const { category_id, ward_id, date_from, date_to } = req.query;
            const { role } = req.user;
            
            // Only admin and authority can view statistics
            if (role === 'citizen') {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }
            
            const filters = {
                categoryId: category_id ? parseInt(category_id) : null,
                wardId: ward_id ? parseInt(ward_id) : null,
                dateFrom: date_from ? new Date(date_from) : null,
                dateTo: date_to ? new Date(date_to) : null
            };
            
            const statistics = await complaintLifecycleService.getComplaintStatistics(filters);
            
            // Calculate totals and percentages
            const total = statistics.reduce((sum, stat) => sum + parseInt(stat.count), 0);
            const enrichedStats = statistics.map(stat => ({
                ...stat,
                count: parseInt(stat.count),
                percentage: total > 0 ? ((parseInt(stat.count) / total) * 100).toFixed(1) : 0,
                avg_hours_open: stat.avg_hours_open ? parseFloat(stat.avg_hours_open).toFixed(1) : 0,
                status_description: getStatusDescription(stat.lifecycle_status)
            }));
            
            res.json({
                success: true,
                data: {
                    statistics: enrichedStats,
                    total,
                    filters
                }
            });
            
        } catch (error) {
            console.error('Error getting complaint statistics:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
    
    /**
     * Assign complaint to authority
     * POST /api/complaints/:id/assign
     */
    async assignComplaint(req, res) {
        try {
            const { id } = req.params;
            const { authority_id, remarks } = req.body;
            const { id: userId, role } = req.user;
            
            // Only admin and authority can assign
            if (!['admin', 'authority'].includes(role)) {
                return res.status(403).json({
                    success: false,
                    error: 'Access denied'
                });
            }
            
            if (!authority_id) {
                return res.status(400).json({
                    success: false,
                    error: 'authority_id is required'
                });
            }
            
            // Transition to ASSIGNED status
            const result = await complaintLifecycleService.transitionStatus(
                parseInt(id),
                'ASSIGNED',
                userId,
                role,
                {
                    assignedTo: parseInt(authority_id),
                    remarks
                }
            );
            
            await auditLog(req, 'COMPLAINT_ASSIGNED', 'complaint', id, {
                assignedTo: authority_id,
                remarks
            });
            
            res.json({
                success: true,
                data: result,
                message: 'Complaint assigned successfully'
            });
            
        } catch (error) {
            console.error('Error assigning complaint:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
    
    /**
     * Verify complaint resolution (citizen only)
     * POST /api/complaints/:id/verify
     */
    async verifyResolution(req, res) {
        try {
            const { id } = req.params;
            const { verified, rejection_reason, remarks } = req.body;
            const { id: userId, role } = req.user;
            
            // Only citizens can verify
            if (role !== 'citizen') {
                return res.status(403).json({
                    success: false,
                    error: 'Only citizens can verify resolutions'
                });
            }
            
            if (typeof verified !== 'boolean') {
                return res.status(400).json({
                    success: false,
                    error: 'verified field is required (boolean)'
                });
            }
            
            const nextStatus = verified ? 'VERIFIED' : 'IN_PROGRESS';
            const options = {
                remarks,
                rejectionReason: verified ? null : rejection_reason,
                verifiedBy: verified ? userId : null
            };
            
            if (!verified && !rejection_reason) {
                return res.status(400).json({
                    success: false,
                    error: 'rejection_reason is required when rejecting resolution'
                });
            }
            
            const result = await complaintLifecycleService.transitionStatus(
                parseInt(id),
                nextStatus,
                userId,
                role,
                options
            );
            
            await auditLog(req, 'COMPLAINT_VERIFICATION', 'complaint', id, {
                verified,
                rejectionReason: rejection_reason,
                remarks
            });
            
            res.json({
                success: true,
                data: result,
                message: verified ? 'Resolution verified successfully' : 'Resolution rejected, complaint reopened'
            });
            
        } catch (error) {
            console.error('Error verifying complaint:', error);
            res.status(400).json({
                success: false,
                error: error.message
            });
        }
    }
}

module.exports = new ComplaintLifecycleController();