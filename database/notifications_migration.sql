-- NOTIFICATIONS SYSTEM MIGRATION
-- Complete in-app notification system for complaint management

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. CREATE NOTIFICATIONS TABLE
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_complaint_id ON notifications(complaint_id);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- 3. CREATE NOTIFICATION TYPES ENUM (OPTIONAL - FOR VALIDATION)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE notification_type AS ENUM (
            'STATUS_UPDATE',
            'ASSIGNED',
            'RESOLVED',
            'VERIFIED',
            'REJECTED',
            'REOPENED',
            'CLOSED',
            'SLA_BREACH',
            'ESCALATED'
        );
    END IF;
END $$;

-- 4. ADD TYPE CONSTRAINT (OPTIONAL - UNCOMMENT IF YOU WANT STRICT VALIDATION)
-- ALTER TABLE notifications ADD CONSTRAINT chk_notification_type 
-- CHECK (type::notification_type IS NOT NULL);

-- 5. CREATE FUNCTION TO AUTO-UPDATE updated_at
CREATE OR REPLACE FUNCTION update_notification_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. CREATE TRIGGER FOR AUTO-UPDATE
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger
        WHERE tgname = 'trigger_update_notification_timestamp'
    ) THEN
        CREATE TRIGGER trigger_update_notification_timestamp
            BEFORE UPDATE ON notifications
            FOR EACH ROW
            EXECUTE FUNCTION update_notification_timestamp();
    END IF;
END $$;

-- 7. CREATE FUNCTION TO CLEAN OLD NOTIFICATIONS (OPTIONAL)
CREATE OR REPLACE FUNCTION cleanup_old_notifications()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete read notifications older than 30 days
    DELETE FROM notifications 
    WHERE is_read = TRUE 
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete unread notifications older than 90 days (safety cleanup)
    DELETE FROM notifications 
    WHERE is_read = FALSE 
    AND created_at < CURRENT_TIMESTAMP - INTERVAL '90 days';
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 8. SAMPLE DATA FOR TESTING (OPTIONAL)
-- INSERT INTO notifications (user_id, title, message, type, complaint_id) VALUES
-- (1, 'Complaint Assigned', 'Your complaint #123 has been assigned to an authority', 'ASSIGNED', 123),
-- (1, 'Status Update', 'Your complaint #123 is now in progress', 'STATUS_UPDATE', 123),
-- (2, 'New Assignment', 'You have been assigned complaint #123', 'ASSIGNED', 123);

-- 9. GRANT PERMISSIONS (ADJUST AS NEEDED)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO your_app_user;
-- GRANT USAGE ON SEQUENCE notifications_id_seq TO your_app_user;

COMMENT ON TABLE notifications IS 'In-app notifications for complaint management system';
COMMENT ON COLUMN notifications.type IS 'Notification type: STATUS_UPDATE, ASSIGNED, RESOLVED, etc.';
COMMENT ON COLUMN notifications.is_read IS 'Whether the notification has been read by the user';
COMMENT ON COLUMN notifications.complaint_id IS 'Related complaint ID (nullable for system notifications)';
