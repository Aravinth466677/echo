-- SLA Tracking System Migration
-- Add SLA-related columns to issues table

-- Add SLA tracking columns
ALTER TABLE issues 
ADD COLUMN sla_duration_hours INTEGER,
ADD COLUMN sla_deadline TIMESTAMP,
ADD COLUMN is_sla_breached BOOLEAN DEFAULT FALSE,
ADD COLUMN escalated_at TIMESTAMP,
ADD COLUMN escalation_reason TEXT;

-- Update existing issues with SLA data based on category
UPDATE issues 
SET sla_duration_hours = c.sla_hours,
    sla_deadline = issues.first_reported_at + (c.sla_hours || ' hours')::INTERVAL
FROM categories c 
WHERE issues.category_id = c.id 
AND issues.sla_duration_hours IS NULL;

-- Create index for SLA deadline queries
CREATE INDEX idx_issues_sla_deadline ON issues(sla_deadline);
CREATE INDEX idx_issues_sla_breached ON issues(is_sla_breached);

-- Update categories with more realistic SLA hours
UPDATE categories SET sla_hours = 72 WHERE name = 'Pothole';      -- 3 days
UPDATE categories SET sla_hours = 48 WHERE name = 'Streetlight';  -- 2 days  
UPDATE categories SET sla_hours = 24 WHERE name = 'Garbage';      -- 1 day
UPDATE categories SET sla_hours = 12 WHERE name = 'Water Supply'; -- 12 hours (urgent)
UPDATE categories SET sla_hours = 48 WHERE name = 'Drainage';     -- 2 days
UPDATE categories SET sla_hours = 168 WHERE name = 'Encroachment'; -- 7 days

-- Create function to calculate SLA status
CREATE OR REPLACE FUNCTION calculate_sla_status(
    sla_deadline TIMESTAMP,
    issue_status VARCHAR(20)
) RETURNS JSONB AS $$
DECLARE
    current_ts TIMESTAMP := LOCALTIMESTAMP;
    remaining_seconds INTEGER;
    is_breached BOOLEAN;
    status_color VARCHAR(10);
    display_text TEXT;
BEGIN
    -- If issue is resolved, SLA is complete
    IF issue_status IN ('resolved', 'rejected') THEN
        RETURN jsonb_build_object(
            'remaining_seconds', 0,
            'is_breached', FALSE,
            'status_color', 'green',
            'display_text', 'Completed'
        );
    END IF;
    
    -- Calculate remaining time
    remaining_seconds := EXTRACT(EPOCH FROM (sla_deadline - current_ts))::INTEGER;
    is_breached := remaining_seconds < 0;
    
    -- Determine status color and text
    IF is_breached THEN
        status_color := 'red';
        display_text := 'SLA Breached';
    ELSIF remaining_seconds < 3600 THEN -- Less than 1 hour
        status_color := 'red';
        display_text := 'Critical';
    ELSIF remaining_seconds < 7200 THEN -- Less than 2 hours
        status_color := 'orange';
        display_text := 'Urgent';
    ELSE
        status_color := 'green';
        display_text := 'On Track';
    END IF;
    
    RETURN jsonb_build_object(
        'remaining_seconds', remaining_seconds,
        'is_breached', is_breached,
        'status_color', status_color,
        'display_text', display_text
    );
END;
$$ LANGUAGE plpgsql;

-- Create function to format remaining time
CREATE OR REPLACE FUNCTION format_remaining_time(remaining_seconds INTEGER) 
RETURNS TEXT AS $$
DECLARE
    days INTEGER;
    hours INTEGER;
    minutes INTEGER;
    result TEXT := '';
BEGIN
    IF remaining_seconds <= 0 THEN
        RETURN 'Overdue';
    END IF;
    
    days := remaining_seconds / 86400;
    hours := (remaining_seconds % 86400) / 3600;
    minutes := (remaining_seconds % 3600) / 60;
    
    IF days > 0 THEN
        result := days || 'd ';
    END IF;
    
    IF hours > 0 OR days > 0 THEN
        result := result || hours || 'h ';
    END IF;
    
    result := result || minutes || 'm';
    
    RETURN TRIM(result);
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN issues.sla_duration_hours IS 'SLA duration in hours from category';
COMMENT ON COLUMN issues.sla_deadline IS 'Calculated SLA deadline timestamp';
COMMENT ON COLUMN issues.is_sla_breached IS 'Whether SLA has been breached';
COMMENT ON COLUMN issues.escalated_at IS 'When issue was escalated due to SLA breach';
COMMENT ON COLUMN issues.escalation_reason IS 'Reason for escalation';
