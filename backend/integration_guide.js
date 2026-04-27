/**
 * COMPLAINT LIFECYCLE SYSTEM INTEGRATION
 * Instructions and sample code for integrating the lifecycle system
 */

// ============================================================================
// 1. SERVER.JS INTEGRATION
// ============================================================================

// Add this to your server.js file after existing route imports:

const complaintLifecycleRoutes = require('./routes/complaintLifecycle');

// Add this route after existing routes:
app.use('/api/complaints', complaintLifecycleRoutes);

// ============================================================================
// 2. DATABASE MIGRATION
// ============================================================================

// Run the migration file:
// psql -U postgres -d echo_db -f database/lifecycle_migration.sql

// ============================================================================
// 3. SAMPLE API REQUESTS AND RESPONSES
// ============================================================================

// UPDATE COMPLAINT STATUS
// PATCH /api/complaints/123/status
// Headers: Authorization: Bearer <token>
const updateStatusRequest = {
    "next_status": "ASSIGNED",
    "assigned_to": 456,
    "remarks": "Assigning to local authority for immediate action"
};

const updateStatusResponse = {
    "success": true,
    "data": {
        "complaintId": 123,
        "oldStatus": "PENDING",
        "newStatus": "ASSIGNED",
        "message": "Complaint transitioned from PENDING to ASSIGNED",
        "updatedAt": "2024-01-15T10:30:00.000Z"
    },
    "message": "Complaint transitioned from PENDING to ASSIGNED"
};

// GET COMPLAINT DETAILS WITH HISTORY
// GET /api/complaints/123/details
const complaintDetailsResponse = {
    "success": true,
    "data": {
        "complaint": {
            "id": 123,
            "lifecycle_status": "ASSIGNED",
            "status_description": "Complaint assigned to authority",
            "user_id": 789,
            "assigned_to": 456,
            "created_at": "2024-01-15T09:00:00.000Z",
            "assigned_at": "2024-01-15T10:30:00.000Z",
            "complainant_name": "John Doe",
            "assigned_authority_name": "Jane Smith"
        },
        "history": [
            {
                "id": 1,
                "complaint_id": 123,
                "old_status": null,
                "new_status": "PENDING",
                "changed_by": 789,
                "role": "citizen",
                "remarks": null,
                "created_at": "2024-01-15T09:00:00.000Z",
                "changed_by_name": "John Doe"
            },
            {
                "id": 2,
                "complaint_id": 123,
                "old_status": "PENDING",
                "new_status": "ASSIGNED",
                "changed_by": 456,
                "role": "authority",
                "remarks": "Assigning to local authority for immediate action",
                "created_at": "2024-01-15T10:30:00.000Z",
                "changed_by_name": "Jane Smith"
            }
        ],
        "validNextStates": ["IN_PROGRESS"],
        "canUpdate": true
    }
};

// VERIFY RESOLUTION (CITIZEN)
// POST /api/complaints/123/verify
const verifyRequest = {
    "verified": false,
    "rejection_reason": "The pothole is still there, not properly fixed",
    "remarks": "Please check again and fix properly"
};

const verifyResponse = {
    "success": true,
    "data": {
        "complaintId": 123,
        "oldStatus": "RESOLVED",
        "newStatus": "IN_PROGRESS",
        "message": "Complaint transitioned from RESOLVED to IN_PROGRESS"
    },
    "message": "Resolution rejected, complaint reopened"
};

// GET COMPLAINTS BY STATUS
// GET /api/complaints/status/PENDING?limit=10
const complaintsByStatusResponse = {
    "success": true,
    "data": [
        {
            "id": 124,
            "lifecycle_status": "PENDING",
            "status_description": "Complaint submitted, awaiting assignment",
            "complainant_name": "Alice Johnson",
            "category_name": "Pothole",
            "created_at": "2024-01-15T11:00:00.000Z",
            "hours_since_created": 2.5,
            "valid_next_states": ["ASSIGNED"]
        }
    ],
    "count": 1
};

// GET STATISTICS
// GET /api/complaints/statistics
const statisticsResponse = {
    "success": true,
    "data": {
        "statistics": [
            {
                "lifecycle_status": "PENDING",
                "count": 15,
                "percentage": "30.0",
                "avg_hours_open": "24.5",
                "status_description": "Complaint submitted, awaiting assignment"
            },
            {
                "lifecycle_status": "ASSIGNED",
                "count": 10,
                "percentage": "20.0",
                "avg_hours_open": "18.2",
                "status_description": "Complaint assigned to authority"
            },
            {
                "lifecycle_status": "IN_PROGRESS",
                "count": 12,
                "percentage": "24.0",
                "avg_hours_open": "36.7",
                "status_description": "Authority is working on the complaint"
            },
            {
                "lifecycle_status": "RESOLVED",
                "count": 8,
                "percentage": "16.0",
                "avg_hours_open": "72.1",
                "status_description": "Authority has resolved the issue, awaiting citizen verification"
            },
            {
                "lifecycle_status": "VERIFIED",
                "count": 3,
                "percentage": "6.0",
                "avg_hours_open": "96.3",
                "status_description": "Citizen has verified the resolution"
            },
            {
                "lifecycle_status": "CLOSED",
                "count": 2,
                "percentage": "4.0",
                "avg_hours_open": "120.0",
                "status_description": "Complaint is closed and archived"
            }
        ],
        "total": 50,
        "filters": {}
    }
};

// ============================================================================
// 4. ERROR RESPONSES
// ============================================================================

// Invalid transition
const invalidTransitionError = {
    "success": false,
    "error": "Invalid transition: PENDING → RESOLVED. Valid transitions from PENDING: [ASSIGNED]"
};

// Permission denied
const permissionError = {
    "success": false,
    "error": "Role 'citizen' is not authorized to transition from PENDING to ASSIGNED"
};

// Validation error
const validationError = {
    "success": false,
    "error": "Validation failed",
    "details": [
        {
            "msg": "next_status is required",
            "param": "next_status",
            "location": "body"
        }
    ]
};

// ============================================================================
// 5. FRONTEND INTEGRATION EXAMPLE
// ============================================================================

// React component example for status update
const StatusUpdateComponent = () => {
    const updateStatus = async (complaintId, nextStatus, remarks) => {
        try {
            const response = await fetch(`/api/complaints/${complaintId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    next_status: nextStatus,
                    remarks
                })
            });
            
            const result = await response.json();
            
            if (result.success) {
                alert(result.message);
                // Refresh complaint data
            } else {
                alert(`Error: ${result.error}`);
            }
        } catch (error) {
            alert(`Network error: ${error.message}`);
        }
    };
    
    return (
        <div>
            <button onClick={() => updateStatus(123, 'IN_PROGRESS', 'Starting work on this issue')}>
                Start Work
            </button>
        </div>
    );
};

// ============================================================================
// 6. TESTING CHECKLIST
// ============================================================================

/*
TESTING CHECKLIST:

1. Database Migration:
   □ Run migration successfully
   □ Verify ENUMs created
   □ Verify tables and columns added
   □ Verify constraints work

2. State Machine:
   □ Test valid transitions work
   □ Test invalid transitions are rejected
   □ Test backward transition (RESOLVED → IN_PROGRESS) works
   □ Test terminal state (CLOSED) prevents further transitions

3. Role Permissions:
   □ Citizen can only verify/reject resolutions
   □ Authority can assign, start work, resolve
   □ Admin can perform all transitions
   □ Test permission denials

4. Special Rules:
   □ Authority cannot verify own work
   □ Rejection requires reason
   □ Assignment requires authority_id

5. Audit Trail:
   □ All transitions logged in complaint_history
   □ History includes user details and timestamps
   □ Remarks are stored correctly

6. Timestamps:
   □ Auto-update timestamps on status change
   □ Verify trigger works correctly
   □ Check timestamp accuracy

7. API Endpoints:
   □ All endpoints return correct responses
   □ Validation works properly
   □ Error handling is appropriate
   □ Authentication/authorization works

8. Performance:
   □ Indexes are used effectively
   □ Queries perform well with large datasets
   □ No N+1 query problems
*/

module.exports = {
    updateStatusRequest,
    updateStatusResponse,
    complaintDetailsResponse,
    verifyRequest,
    verifyResponse,
    complaintsByStatusResponse,
    statisticsResponse,
    invalidTransitionError,
    permissionError,
    validationError
};