/**
 * COMPLAINT LIFECYCLE TRANSITION GUARD
 * Production-ready strict state machine implementation
 */

// Valid status transitions (strict state machine)
const VALID_TRANSITIONS = {
    'PENDING': ['ASSIGNED'],
    'ASSIGNED': ['IN_PROGRESS'],
    'IN_PROGRESS': ['RESOLVED'],
    'RESOLVED': ['VERIFIED', 'IN_PROGRESS'], // IN_PROGRESS if citizen rejects
    'VERIFIED': ['CLOSED'],
    'CLOSED': [] // Terminal state
};

// Role-based transition permissions
const ROLE_PERMISSIONS = {
    'citizen': {
        'PENDING': [], // Citizens create complaints but don't transition from PENDING
        'ASSIGNED': [],
        'IN_PROGRESS': [],
        'RESOLVED': ['VERIFIED', 'IN_PROGRESS'], // Can verify or reject resolution
        'VERIFIED': [],
        'CLOSED': []
    },
    'authority': {
        'PENDING': ['ASSIGNED'], // Can accept complaints
        'ASSIGNED': ['IN_PROGRESS'], // Can start work
        'IN_PROGRESS': ['RESOLVED'], // Can mark as resolved
        'RESOLVED': [],
        'VERIFIED': [],
        'CLOSED': []
    },
    'admin': {
        'PENDING': ['ASSIGNED', 'CLOSED'], // Can assign or force close
        'ASSIGNED': ['IN_PROGRESS', 'CLOSED'],
        'IN_PROGRESS': ['RESOLVED', 'CLOSED'],
        'RESOLVED': ['VERIFIED', 'IN_PROGRESS', 'CLOSED'], // Can override verification
        'VERIFIED': ['CLOSED'],
        'CLOSED': []
    }
};

/**
 * Check if a status transition is valid
 * @param {string} currentStatus - Current complaint status
 * @param {string} nextStatus - Desired next status
 * @param {string} role - User role (citizen, authority, admin)
 * @param {Object} context - Additional context (optional)
 * @returns {Object} { valid: boolean, error?: string }
 */
function canTransition(currentStatus, nextStatus, role, context = {}) {
    // Validate inputs
    if (!currentStatus || !nextStatus || !role) {
        return {
            valid: false,
            error: 'Missing required parameters: currentStatus, nextStatus, role'
        };
    }

    // Normalize inputs
    const current = currentStatus.toUpperCase();
    const next = nextStatus.toUpperCase();
    const userRole = role.toLowerCase();

    // Check if current status exists in state machine
    if (!VALID_TRANSITIONS[current]) {
        return {
            valid: false,
            error: `Invalid current status: ${current}`
        };
    }

    // Check if transition is valid in state machine
    if (!VALID_TRANSITIONS[current].includes(next)) {
        return {
            valid: false,
            error: `Invalid transition: ${current} → ${next}. Valid transitions from ${current}: [${VALID_TRANSITIONS[current].join(', ')}]`
        };
    }

    // Check role permissions
    if (!ROLE_PERMISSIONS[userRole]) {
        return {
            valid: false,
            error: `Invalid role: ${userRole}`
        };
    }

    if (!ROLE_PERMISSIONS[userRole][current].includes(next)) {
        return {
            valid: false,
            error: `Role '${userRole}' is not authorized to transition from ${current} to ${next}`
        };
    }

    // Special validation rules
    const specialValidation = validateSpecialRules(current, next, userRole, context);
    if (!specialValidation.valid) {
        return specialValidation;
    }

    return { valid: true };
}

/**
 * Validate special business rules
 * @param {string} current - Current status
 * @param {string} next - Next status
 * @param {string} role - User role
 * @param {Object} context - Additional context
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateSpecialRules(current, next, role, context) {
    // Rule: Authority cannot verify their own work
    if (next === 'VERIFIED' && role === 'authority' && context.assignedTo === context.userId) {
        return {
            valid: false,
            error: 'Authority cannot verify their own work'
        };
    }

    // Rule: Citizen can only verify if they are the original complainant
    if (next === 'VERIFIED' && role === 'citizen' && context.complainantId !== context.userId) {
        return {
            valid: false,
            error: 'Only the original complainant can verify resolution'
        };
    }

    // Rule: Rejection requires reason
    if (next === 'IN_PROGRESS' && current === 'RESOLVED' && !context.rejectionReason) {
        return {
            valid: false,
            error: 'Rejection reason is required when rejecting resolution'
        };
    }

    return { valid: true };
}

/**
 * Get all valid next states for current status and role
 * @param {string} currentStatus - Current complaint status
 * @param {string} role - User role
 * @returns {Array} Array of valid next statuses
 */
function getValidNextStates(currentStatus, role) {
    const current = currentStatus.toUpperCase();
    const userRole = role.toLowerCase();

    if (!VALID_TRANSITIONS[current] || !ROLE_PERMISSIONS[userRole]) {
        return [];
    }

    return ROLE_PERMISSIONS[userRole][current] || [];
}

/**
 * Get human-readable status descriptions
 * @param {string} status - Status to describe
 * @returns {string} Human-readable description
 */
function getStatusDescription(status) {
    const descriptions = {
        'PENDING': 'Complaint submitted, awaiting assignment',
        'ASSIGNED': 'Complaint assigned to authority',
        'IN_PROGRESS': 'Authority is working on the complaint',
        'RESOLVED': 'Authority has resolved the issue, awaiting citizen verification',
        'VERIFIED': 'Citizen has verified the resolution',
        'CLOSED': 'Complaint is closed and archived'
    };

    return descriptions[status.toUpperCase()] || 'Unknown status';
}

/**
 * Validate transition context based on status
 * @param {string} nextStatus - Next status
 * @param {Object} context - Context object
 * @returns {Object} { valid: boolean, error?: string }
 */
function validateTransitionContext(nextStatus, context) {
    const next = nextStatus.toUpperCase();

    switch (next) {
        case 'ASSIGNED':
            if (!context.assignedTo) {
                return { valid: false, error: 'assignedTo is required for ASSIGNED status' };
            }
            break;
        
        case 'IN_PROGRESS':
            if (context.previousStatus === 'RESOLVED' && !context.rejectionReason) {
                return { valid: false, error: 'rejectionReason is required when returning to IN_PROGRESS from RESOLVED' };
            }
            break;
        
        case 'VERIFIED':
            if (!context.verifiedBy) {
                return { valid: false, error: 'verifiedBy is required for VERIFIED status' };
            }
            break;
    }

    return { valid: true };
}

module.exports = {
    canTransition,
    getValidNextStates,
    getStatusDescription,
    validateTransitionContext,
    VALID_TRANSITIONS,
    ROLE_PERMISSIONS
};