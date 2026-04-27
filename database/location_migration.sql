-- Migration: Add location validation columns to issues table
-- Run this after the main schema.sql

ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS verified_address TEXT,
ADD COLUMN IF NOT EXISTS landmark_note TEXT;

-- Add jurisdiction support if not exists
CREATE TABLE IF NOT EXISTS jurisdictions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    boundary GEOGRAPHY(POLYGON, 4326),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE issues 
ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id);

ALTER TABLE complaints 
ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id);

-- Add authorities table if not exists
CREATE TABLE IF NOT EXISTS authorities (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    authority_level VARCHAR(50) NOT NULL CHECK (authority_level IN ('JURISDICTION', 'DEPARTMENT', 'SUPER_ADMIN')),
    category_id INTEGER REFERENCES categories(id),
    jurisdiction_id INTEGER REFERENCES jurisdictions(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Update complaints table for routing
ALTER TABLE complaints 
ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES authorities(id),
ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS routing_reason VARCHAR(100);

-- Update status enum for complaints
ALTER TABLE complaints DROP CONSTRAINT IF EXISTS complaints_status_check;
ALTER TABLE complaints ADD CONSTRAINT complaints_status_check 
CHECK (status IN ('submitted', 'assigned', 'escalated', 'in_progress', 'resolved', 'rejected'));