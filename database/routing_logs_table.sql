-- Complaint Routing Logs Table
-- Tracks complete routing history for transparency

CREATE TABLE complaint_routing_logs (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER REFERENCES complaints(id) ON DELETE CASCADE,
    issue_id INTEGER REFERENCES issues(id) ON DELETE CASCADE,
    
    -- Routing Details
    routed_to_user_id INTEGER REFERENCES users(id),
    authority_level VARCHAR(20) CHECK (authority_level IN ('JURISDICTION', 'DEPARTMENT', 'SUPER_ADMIN')),
    authority_email VARCHAR(255),
    authority_name VARCHAR(255),
    
    -- Location Context
    jurisdiction_id INTEGER REFERENCES jurisdictions(id),
    jurisdiction_name VARCHAR(255),
    category_id INTEGER REFERENCES categories(id),
    category_name VARCHAR(100),
    
    -- Routing Logic
    routing_reason VARCHAR(50) CHECK (routing_reason IN (
        'NORMAL', 
        'HIGH_PRIORITY_ESCALATION', 
        'MEDIUM_PRIORITY_ESCALATION',
        'NO_JURISDICTION',
        'NO_JURISDICTION_AUTHORITY',
        'JURISDICTION_FALLBACK',
        'NO_DEPARTMENT_AUTHORITY',
        'SUPER_ADMIN_FALLBACK',
        'RE_ROUTING',
        'SLA_ESCALATION'
    )),
    echo_count INTEGER DEFAULT 1,
    
    -- Timing
    routed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Additional Context
    routing_details JSONB,
    
    -- Indexes
    CONSTRAINT unique_complaint_routing UNIQUE (complaint_id, routed_at)
);

-- Indexes for performance
CREATE INDEX idx_routing_logs_complaint ON complaint_routing_logs(complaint_id);
CREATE INDEX idx_routing_logs_issue ON complaint_routing_logs(issue_id);
CREATE INDEX idx_routing_logs_authority ON complaint_routing_logs(routed_to_user_id);
CREATE INDEX idx_routing_logs_time ON complaint_routing_logs(routed_at);
CREATE INDEX idx_routing_logs_reason ON complaint_routing_logs(routing_reason);
