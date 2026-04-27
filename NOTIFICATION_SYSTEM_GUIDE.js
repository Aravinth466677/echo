/**
 * COMPLETE NOTIFICATION SYSTEM INTEGRATION GUIDE
 * Step-by-step setup and usage examples
 */

// ============================================================================
// 1. DATABASE SETUP
// ============================================================================

/*
Run the migration:
psql -U postgres -d echo_db -f database/notifications_migration.sql
*/

// ============================================================================
// 2. BACKEND INTEGRATION
// ============================================================================

// Add to server.js:
const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

// Replace existing complaintLifecycleService.js with the notification-enabled version:
// cp services/complaintLifecycleServiceWithNotifications.js services/complaintLifecycleService.js

// ============================================================================
// 3. FRONTEND INTEGRATION
// ============================================================================

// Add NotificationBell to your main layout/navbar component:

import React from 'react';
import NotificationBell from './components/NotificationBell';

const Navbar = () => {
    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <h1>Echo</h1>
            </div>
            
            <div className="navbar-actions">
                {/* Other navbar items */}
                <NotificationBell />
                
                {/* User menu, logout, etc. */}
            </div>
        </nav>
    );
};

export default Navbar;

// ============================================================================
// 4. SAMPLE API RESPONSES
// ============================================================================

// GET /api/notifications
const notificationsResponse = {
    "success": true,
    "notifications": [
        {
            "id": "550e8400-e29b-41d4-a716-446655440000",
            "user_id": 123,
            "title": "Complaint Assigned",
            "message": "Your complaint #456 has been assigned to John Smith for review.",
            "type": "ASSIGNED",
            "is_read": false,
            "complaint_id": 456,
            "created_at": "2024-01-15T10:30:00.000Z",
            "updated_at": "2024-01-15T10:30:00.000Z",
            "time_ago": "2 hours ago",
            "complaint_description": "Pothole on Main Street",
            "complaint_status": "ASSIGNED",
            "complaint_category": "Pothole"
        },
        {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "user_id": 123,
            "title": "Status Update",
            "message": "Your complaint #456 status has been updated to: In Progress.",
            "type": "STATUS_UPDATE",
            "is_read": true,
            "complaint_id": 456,
            "created_at": "2024-01-15T08:15:00.000Z",
            "updated_at": "2024-01-15T09:00:00.000Z",
            "time_ago": "4 hours ago"
        }
    ],
    "unread_count": 1,
    "total": 2
};

// GET /api/notifications/unread-count
const unreadCountResponse = {
    "success": true,
    "unread_count": 3
};

// PATCH /api/notifications/:id/read
const markAsReadResponse = {
    "success": true,
    "message": "Notification marked as read",
    "notification": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "is_read": true,
        "updated_at": "2024-01-15T12:30:00.000Z"
    }
};

// ============================================================================
// 5. NOTIFICATION TRIGGERS EXAMPLES
// ============================================================================

// Example: Complaint status change triggers notification
const complaintLifecycleExample = async () => {
    // When authority accepts a complaint
    const result = await complaintLifecycleService.transitionStatus(
        123, // complaintId
        'ASSIGNED', // nextStatus
        456, // userId (authority)
        'authority', // role
        {
            assignedTo: 456,
            remarks: 'Taking immediate action'
        }
    );
    
    // This automatically creates notifications:
    // 1. To citizen: "Your complaint #123 has been assigned to [Authority Name]"
    // 2. To authority: "You have been assigned complaint #123"
};

// Example: Manual notification creation
const manualNotificationExample = async () => {
    await notificationService.createNotification(
        123, // userId
        'System Maintenance', // title
        'The system will be under maintenance from 2 AM to 4 AM tonight.', // message
        'SYSTEM_ALERT', // type
        null // complaintId (optional)
    );
};

// ============================================================================
// 6. CUSTOM HOOK USAGE EXAMPLES
// ============================================================================

// Basic usage in a component:
import useNotifications from '../hooks/useNotifications';

const MyComponent = () => {
    const {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        refresh
    } = useNotifications();
    
    return (
        <div>
            <h2>You have {unreadCount} unread notifications</h2>
            {loading && <p>Loading...</p>}
            {notifications.map(notification => (
                <div key={notification.id}>
                    <h3>{notification.title}</h3>
                    <p>{notification.message}</p>
                    {!notification.is_read && (
                        <button onClick={() => markAsRead(notification.id)}>
                            Mark as read
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
};

// Advanced usage with custom polling interval:
const AdminDashboard = () => {
    const {
        notifications,
        unreadCount,
        fetchNotifications
    } = useNotifications(30000); // Poll every 30 seconds
    
    // Fetch only unread notifications
    const fetchUnreadOnly = () => {
        fetchNotifications({ unread_only: true });
    };
    
    return (
        <div>
            <button onClick={fetchUnreadOnly}>
                Show Unread Only ({unreadCount})
            </button>
        </div>
    );
};

// ============================================================================
// 7. STYLING CUSTOMIZATION
// ============================================================================

// Override default styles in your CSS:
.notification-bell-button {
    /* Custom bell button styling */
    background-color: #your-brand-color;
}

.notification-dropdown {
    /* Custom dropdown styling */
    width: 400px; /* Make wider */
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2); /* Stronger shadow */
}

.notification-item.unread {
    /* Custom unread notification styling */
    border-left-color: #your-brand-color;
    background-color: #your-light-brand-color;
}

// ============================================================================
// 8. ERROR HANDLING EXAMPLES
// ============================================================================

// Handle notification errors gracefully:
const NotificationErrorHandler = () => {
    const { error, refresh } = useNotifications();
    
    if (error) {
        return (
            <div className="notification-error-banner">
                <p>Failed to load notifications: {error}</p>
                <button onClick={refresh}>Retry</button>
            </div>
        );
    }
    
    return null;
};

// ============================================================================
// 9. TESTING EXAMPLES
// ============================================================================

// Test notification creation (development only):
const testNotification = async () => {
    const response = await fetch('/api/notifications/test', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            title: 'Test Notification',
            message: 'This is a test notification to verify the system works.',
            type: 'STATUS_UPDATE',
            complaint_id: 123
        })
    });
    
    const result = await response.json();
    console.log('Test notification created:', result);
};

// ============================================================================
// 10. PERFORMANCE OPTIMIZATION
// ============================================================================

// Optimize for large notification lists:
const OptimizedNotificationList = () => {
    const [page, setPage] = useState(0);
    const { fetchNotifications } = useNotifications();
    
    const loadMore = () => {
        fetchNotifications({
            limit: 20,
            offset: page * 20
        });
        setPage(prev => prev + 1);
    };
    
    return (
        <div>
            {/* Notification list */}
            <button onClick={loadMore}>Load More</button>
        </div>
    );
};

// ============================================================================
// 11. ACCESSIBILITY FEATURES
// ============================================================================

// The NotificationBell component includes:
// - ARIA labels for screen readers
// - Keyboard navigation support
// - Focus management
// - High contrast support

// ============================================================================
// 12. DEPLOYMENT CHECKLIST
// ============================================================================

/*
DEPLOYMENT CHECKLIST:

Backend:
□ Run database migration
□ Add notification routes to server.js
□ Replace complaintLifecycleService with notification-enabled version
□ Test API endpoints
□ Verify notification triggers work

Frontend:
□ Add NotificationBell to navbar/layout
□ Import and use useNotifications hook
□ Test notification display and interactions
□ Verify polling works correctly
□ Test responsive design

Database:
□ Verify notifications table created
□ Check indexes are in place
□ Test notification cleanup function
□ Monitor performance with large datasets

Security:
□ Verify users can only see their own notifications
□ Test authentication on all endpoints
□ Validate input sanitization
□ Check for SQL injection vulnerabilities

Performance:
□ Monitor polling frequency impact
□ Test with large notification counts
□ Verify cleanup job runs correctly
□ Check database query performance
*/

// ============================================================================
// 13. MAINTENANCE TASKS
// ============================================================================

// Set up a cron job to clean old notifications:
// 0 2 * * * psql -d echo_db -c "SELECT cleanup_old_notifications(30);"

// Monitor notification system health:
const healthCheck = async () => {
    try {
        const response = await fetch('/api/notifications/unread-count');
        return response.ok;
    } catch (error) {
        console.error('Notification system health check failed:', error);
        return false;
    }
};

export {
    notificationsResponse,
    unreadCountResponse,
    markAsReadResponse,
    complaintLifecycleExample,
    manualNotificationExample,
    testNotification,
    healthCheck
};