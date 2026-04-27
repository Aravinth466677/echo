-- Migration: Add Jurisdictions Table
-- Run this after initial schema.sql

-- Create jurisdictions table
CREATE TABLE IF NOT EXISTS jurisdictions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    boundary GEOMETRY(POLYGON, 4326) NOT NULL,
    area_sq_meters DOUBLE PRECISION,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create spatial index on boundary
CREATE INDEX IF NOT EXISTS idx_jurisdictions_boundary ON jurisdictions USING GIST(boundary);

-- Add jurisdiction_id to issues table
ALTER TABLE issues ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id);
CREATE INDEX IF NOT EXISTS idx_issues_jurisdiction ON issues(jurisdiction_id);

-- Add jurisdiction_id to complaints table
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id);
CREATE INDEX IF NOT EXISTS idx_complaints_jurisdiction ON complaints(jurisdiction_id);

-- Function to auto-calculate area on insert/update
CREATE OR REPLACE FUNCTION update_jurisdiction_area()
RETURNS TRIGGER AS $$
BEGIN
    NEW.area_sq_meters := ST_Area(NEW.boundary::geography);
    NEW.updated_at := CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_jurisdiction_area
BEFORE INSERT OR UPDATE ON jurisdictions
FOR EACH ROW
EXECUTE FUNCTION update_jurisdiction_area();
