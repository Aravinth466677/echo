-- Remote reporting support
-- Run after the existing schema and location migrations.

ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS report_mode VARCHAR(20),
ADD COLUMN IF NOT EXISTS reporter_location GEOGRAPHY(POINT, 4326),
ADD COLUMN IF NOT EXISTS reporter_latitude DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS reporter_longitude DECIMAL(11, 8),
ADD COLUMN IF NOT EXISTS distance_meters INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS trust_level VARCHAR(20),
ADD COLUMN IF NOT EXISTS remote_justification TEXT,
ADD COLUMN IF NOT EXISTS justification_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS location_verification_status VARCHAR(20) DEFAULT 'verified';

ALTER TABLE complaints
DROP CONSTRAINT IF EXISTS complaints_report_mode_check;

ALTER TABLE complaints
ADD CONSTRAINT complaints_report_mode_check
CHECK (report_mode IN ('in_place', 'remote'));

ALTER TABLE complaints
DROP CONSTRAINT IF EXISTS complaints_trust_level_check;

ALTER TABLE complaints
ADD CONSTRAINT complaints_trust_level_check
CHECK (trust_level IN ('high', 'medium', 'low'));

ALTER TABLE complaints
DROP CONSTRAINT IF EXISTS complaints_location_verification_status_check;

ALTER TABLE complaints
ADD CONSTRAINT complaints_location_verification_status_check
CHECK (location_verification_status IN ('verified', 'manual', 'unverified'));

UPDATE complaints
SET
  report_mode = COALESCE(report_mode, 'in_place'),
  reporter_location = COALESCE(
    reporter_location,
    ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography
  ),
  reporter_latitude = COALESCE(reporter_latitude, latitude),
  reporter_longitude = COALESCE(reporter_longitude, longitude),
  distance_meters = COALESCE(distance_meters, 0),
  trust_level = COALESCE(trust_level, 'high'),
  location_verification_status = COALESCE(location_verification_status, 'verified')
WHERE
  report_mode IS NULL
  OR reporter_location IS NULL
  OR reporter_latitude IS NULL
  OR reporter_longitude IS NULL
  OR distance_meters IS NULL
  OR trust_level IS NULL
  OR location_verification_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_complaints_report_mode ON complaints(report_mode);
CREATE INDEX IF NOT EXISTS idx_complaints_trust_level ON complaints(trust_level);
