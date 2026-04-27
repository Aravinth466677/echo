-- Add missing columns to complaints table
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assigned_to INTEGER;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS routing_reason VARCHAR(50);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS escalated_to INTEGER;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;

-- Add missing columns to issues table
ALTER TABLE issues ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER;

-- Create complaint routing logs table
CREATE TABLE IF NOT EXISTS complaint_routing_logs (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
    issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
    routed_to_user_id INTEGER,
    authority_level VARCHAR(20) CHECK (authority_level IN ('JURISDICTION', 'DEPARTMENT', 'SUPER_ADMIN')),
    authority_email VARCHAR(255),
    authority_name VARCHAR(255),
    jurisdiction_id INTEGER,
    jurisdiction_name VARCHAR(255),
    category_id INTEGER REFERENCES categories(id),
    category_name VARCHAR(100),
    routing_reason VARCHAR(50) CHECK (routing_reason IN (
        'NORMAL', 'HIGH_PRIORITY_ESCALATION', 'MEDIUM_PRIORITY_ESCALATION',
        'NO_JURISDICTION', 'NO_JURISDICTION_AUTHORITY', 'JURISDICTION_FALLBACK',
        'NO_DEPARTMENT_AUTHORITY', 'SUPER_ADMIN_FALLBACK', 'RE_ROUTING'
    )),
    echo_count INTEGER DEFAULT 1,
    routed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    routing_details JSONB
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_routing_logs_complaint ON complaint_routing_logs(complaint_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_issue ON complaint_routing_logs(issue_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_authority ON complaint_routing_logs(routed_to_user_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_time ON complaint_routing_logs(routed_at);

COMMIT;
