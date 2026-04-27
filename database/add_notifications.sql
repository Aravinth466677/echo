-- Add notifications table for merged complaints
-- This allows notifying all reporters when an issue is updated

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
    complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'status_update', 'verification', 'resolution', etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_issue ON notifications(issue_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Add a function to automatically notify all reporters when issue status changes
CREATE OR REPLACE FUNCTION notify_issue_reporters()
RETURNS TRIGGER AS $$
BEGIN
    -- Only notify on status changes
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO notifications (user_id, issue_id, complaint_id, type, title, message)
        SELECT 
            c.user_id,
            NEW.id,
            c.id,
            'status_update',
            'Issue Status Updated',
            CASE 
                WHEN NEW.status = 'verified' THEN 'Your reported issue has been verified and is now being processed.'
                WHEN NEW.status = 'in_progress' THEN 'Work has started on your reported issue.'
                WHEN NEW.status = 'resolved' THEN 'Your reported issue has been resolved.'
                WHEN NEW.status = 'rejected' THEN 'Your reported issue has been reviewed and rejected.'
                ELSE 'Your reported issue status has been updated to: ' || NEW.status
            END
        FROM complaints c
        WHERE c.issue_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic notifications
DROP TRIGGER IF EXISTS trigger_notify_issue_reporters ON issues;
CREATE TRIGGER trigger_notify_issue_reporters
    AFTER UPDATE ON issues
    FOR EACH ROW
    EXECUTE FUNCTION notify_issue_reporters();

-- Sample query to get reporters for an issue (for reference)
/*
SELECT 
    c.id as complaint_id,
    c.user_id,
    c.created_at,
    c.is_primary,
    u.full_name,
    u.email,
    u.phone,
    ROW_NUMBER() OVER (ORDER BY c.created_at ASC) as report_order
FROM complaints c
JOIN users u ON c.user_id = u.id
WHERE c.issue_id = $1
ORDER BY c.created_at ASC;
*/