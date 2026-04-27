-- Forward fix for existing databases that already ran sla_tracking_migration.sql
-- Recreates calculate_sla_status with a timestamp variable name that does not
-- conflict with PostgreSQL's CURRENT_TIME special value.

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
    IF issue_status IN ('resolved', 'rejected') THEN
        RETURN jsonb_build_object(
            'remaining_seconds', 0,
            'is_breached', FALSE,
            'status_color', 'green',
            'display_text', 'Completed'
        );
    END IF;

    remaining_seconds := EXTRACT(EPOCH FROM (sla_deadline - current_ts))::INTEGER;
    is_breached := remaining_seconds < 0;

    IF is_breached THEN
        status_color := 'red';
        display_text := 'SLA Breached';
    ELSIF remaining_seconds < 3600 THEN
        status_color := 'red';
        display_text := 'Critical';
    ELSIF remaining_seconds < 7200 THEN
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
