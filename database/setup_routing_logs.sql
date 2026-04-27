-- Setup script to add complaint routing logs table
-- Run this after the main schema.sql

-- Add routing logs table
CREATE TABLE IF NOT EXISTS complaint_routing_logs (
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
        'RE_ROUTING'
    )),
    echo_count INTEGER DEFAULT 1,
    
    -- Timing
    routed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Additional Context
    routing_details JSONB,
    
    -- Indexes
    CONSTRAINT unique_complaint_routing UNIQUE (complaint_id, routed_at)
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_routing_logs_complaint ON complaint_routing_logs(complaint_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_issue ON complaint_routing_logs(issue_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_authority ON complaint_routing_logs(routed_to_user_id);
CREATE INDEX IF NOT EXISTS idx_routing_logs_time ON complaint_routing_logs(routed_at);
CREATE INDEX IF NOT EXISTS idx_routing_logs_reason ON complaint_routing_logs(routing_reason);

-- Add missing columns to complaints table if they don't exist
DO $$ 
BEGIN
    -- Add assigned_to column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'complaints' AND column_name = 'assigned_to') THEN
        ALTER TABLE complaints ADD COLUMN assigned_to INTEGER REFERENCES users(id);
    END IF;
    
    -- Add routing_reason column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'complaints' AND column_name = 'routing_reason') THEN
        ALTER TABLE complaints ADD COLUMN routing_reason VARCHAR(50);
    END IF;
    
    -- Add escalation columns if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'complaints' AND column_name = 'escalated_to') THEN
        ALTER TABLE complaints ADD COLUMN escalated_to INTEGER REFERENCES users(id);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'complaints' AND column_name = 'escalation_level') THEN
        ALTER TABLE complaints ADD COLUMN escalation_level INTEGER DEFAULT 0;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'complaints' AND column_name = 'escalated_at') THEN
        ALTER TABLE complaints ADD COLUMN escalated_at TIMESTAMP;
    END IF;
    
    -- Add jurisdiction_id to issues table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'issues' AND column_name = 'jurisdiction_id') THEN
        ALTER TABLE issues ADD COLUMN jurisdiction_id INTEGER REFERENCES jurisdictions(id);
    END IF;
    
    -- Add jurisdiction_id to complaints table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'complaints' AND column_name = 'jurisdiction_id') THEN
        ALTER TABLE complaints ADD COLUMN jurisdiction_id INTEGER REFERENCES jurisdictions(id);
    END IF;
END $$;

-- Update authority_assignments table structure for new hierarchy
DO $$
BEGIN
    -- Add authority_level column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'authority_assignments' AND column_name = 'authority_level') THEN
        ALTER TABLE authority_assignments ADD COLUMN authority_level VARCHAR(20) 
        CHECK (authority_level IN ('JURISDICTION', 'DEPARTMENT', 'SUPER_ADMIN'));
    END IF;
    
    -- Add category_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'authority_assignments' AND column_name = 'category_id') THEN
        ALTER TABLE authority_assignments ADD COLUMN category_id INTEGER REFERENCES categories(id);
    END IF;
    
    -- Add jurisdiction_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'authority_assignments' AND column_name = 'jurisdiction_id') THEN
        ALTER TABLE authority_assignments ADD COLUMN jurisdiction_id INTEGER REFERENCES jurisdictions(id);
    END IF;
    
    -- Make ward_id nullable since not all authorities need it
    ALTER TABLE authority_assignments ALTER COLUMN ward_id DROP NOT NULL;
END $$;

-- Create jurisdictions table if it doesn't exist
CREATE TABLE IF NOT EXISTS jurisdictions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    boundary GEOMETRY(POLYGON, 4326) NOT NULL,
    area_sq_meters DECIMAL GENERATED ALWAYS AS (ST_Area(boundary::geography)) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add spatial index for jurisdictions
CREATE INDEX IF NOT EXISTS idx_jurisdictions_boundary ON jurisdictions USING GIST(boundary);

COMMIT;
