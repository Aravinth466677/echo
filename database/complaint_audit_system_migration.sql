-- Complaint History Audit System Migration
-- Creates comprehensive audit trail for all complaint actions

-- Create ENUM types for status and actions
CREATE TYPE complaint_status_enum AS ENUM (
    'submitted', 'pending', 'assigned', 'in_progress', 'resolved', 
    'verified', 'rejected', 'closed', 'escalated'
);

CREATE TYPE audit_action_enum AS ENUM (
    'CREATED', 'STATUS_CHANGE', 'ASSIGNED', 'VERIFIED', 'REJECTED', 
    'ESCALATED', 'RESOLVED', 'CLOSED', 'COMMENT_ADDED', 'EVIDENCE_ADDED'
);

CREATE TYPE user_role_enum AS ENUM (
    'CITIZEN', 'AUTHORITY', 'ADMIN', 'SYSTEM'
);

-- Create complaint_history audit table
CREATE TABLE complaint_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    old_status complaint_status_enum,
    new_status complaint_status_enum,
    changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    role user_role_enum NOT NULL,
    action audit_action_enum NOT NULL,
    remarks TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT valid_status_change CHECK (
        (action = 'CREATED' AND old_status IS NULL AND new_status IS NOT NULL) OR
        (action != 'CREATED' AND (old_status IS NULL OR new_status IS NULL OR old_status != new_status)) OR
        (action IN ('COMMENT_ADDED', 'EVIDENCE_ADDED'))
    )
);

-- Indexes for performance
CREATE INDEX idx_complaint_history_complaint_id ON complaint_history(complaint_id);
CREATE INDEX idx_complaint_history_created_at ON complaint_history(created_at);
CREATE INDEX idx_complaint_history_changed_by ON complaint_history(changed_by);
CREATE INDEX idx_complaint_history_action ON complaint_history(action);

-- Function to automatically log complaint creation
CREATE OR REPLACE FUNCTION log_complaint_creation()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO complaint_history (
        complaint_id,
        old_status,
        new_status,
        changed_by,
        role,
        action,
        remarks,
        metadata
    ) VALUES (
        NEW.id,
        NULL,
        NEW.status::complaint_status_enum,
        NEW.user_id,
        'CITIZEN',
        'CREATED',
        'Complaint submitted',
        jsonb_build_object(
            'category_id', NEW.category_id,
            'location', jsonb_build_object(
                'latitude', NEW.latitude,
                'longitude', NEW.longitude
            )
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically log complaint creation
CREATE TRIGGER trigger_log_complaint_creation
    AFTER INSERT ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION log_complaint_creation();

-- Function to get human-readable action description
CREATE OR REPLACE FUNCTION get_action_description(
    p_action audit_action_enum,
    p_old_status complaint_status_enum,
    p_new_status complaint_status_enum,
    p_role user_role_enum
) RETURNS TEXT AS $$
BEGIN
    CASE p_action
        WHEN 'CREATED' THEN
            RETURN 'Complaint submitted by citizen';
        WHEN 'STATUS_CHANGE' THEN
            CASE 
                WHEN p_old_status = 'submitted' AND p_new_status = 'assigned' THEN
                    RETURN 'Complaint assigned to authority';
                WHEN p_old_status = 'assigned' AND p_new_status = 'in_progress' THEN
                    RETURN 'Authority started working on complaint';
                WHEN p_old_status = 'in_progress' AND p_new_status = 'resolved' THEN
                    RETURN 'Authority marked complaint as resolved';
                WHEN p_old_status = 'resolved' AND p_new_status = 'verified' THEN
                    RETURN 'Citizen verified the resolution';
                WHEN p_old_status = 'resolved' AND p_new_status = 'rejected' THEN
                    RETURN 'Citizen rejected the resolution';
                WHEN p_new_status = 'escalated' THEN
                    RETURN 'Complaint escalated to higher authority';
                WHEN p_new_status = 'closed' THEN
                    RETURN 'Complaint closed';
                ELSE
                    RETURN 'Status changed from ' || COALESCE(p_old_status::text, 'none') || ' to ' || p_new_status::text;
            END CASE;
        WHEN 'ASSIGNED' THEN
            RETURN 'Complaint assigned to ' || LOWER(p_role::text);
        WHEN 'VERIFIED' THEN
            RETURN 'Resolution verified by citizen';
        WHEN 'REJECTED' THEN
            RETURN 'Resolution rejected by citizen';
        WHEN 'ESCALATED' THEN
            RETURN 'Complaint escalated due to SLA breach';
        WHEN 'RESOLVED' THEN
            RETURN 'Complaint resolved by authority';
        WHEN 'CLOSED' THEN
            RETURN 'Complaint closed';
        WHEN 'COMMENT_ADDED' THEN
            RETURN 'Comment added by ' || LOWER(p_role::text);
        WHEN 'EVIDENCE_ADDED' THEN
            RETURN 'Evidence added by ' || LOWER(p_role::text);
        ELSE
            RETURN 'Action performed: ' || p_action::text;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- View for easy querying of complaint history with descriptions
CREATE VIEW complaint_history_view AS
SELECT 
    h.id,
    h.complaint_id,
    h.old_status,
    h.new_status,
    h.changed_by,
    u.full_name as changed_by_name,
    u.email as changed_by_email,
    h.role,
    h.action,
    h.remarks,
    h.metadata,
    h.created_at,
    get_action_description(h.action, h.old_status, h.new_status, h.role) as description
FROM complaint_history h
LEFT JOIN users u ON h.changed_by = u.id
ORDER BY h.created_at ASC;

-- Grant permissions
GRANT SELECT ON complaint_history TO PUBLIC;
GRANT SELECT ON complaint_history_view TO PUBLIC;

-- Insert sample data for testing (optional)
-- This will be handled by the application triggers and functions