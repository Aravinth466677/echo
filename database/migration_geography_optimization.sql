-- PostGIS Performance Optimization Migration
-- Convert location column from geometry to geography and create spatial index

-- 1. Convert location column to geography
ALTER TABLE complaints
ALTER COLUMN location TYPE geography(Point, 4326)
USING location::geography;

-- 2. Create spatial index for geography
CREATE INDEX idx_complaints_location_geog
ON complaints
USING GIST (location);

-- 3. Verify the changes
-- Run this to confirm the migration worked:
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_name = 'complaints' AND column_name = 'location';