-- Validation Layer Migration
-- Adds validation fields and rate limiting tables

-- Add validation fields to complaints table
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS image_hash VARCHAR(64);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS validation_status VARCHAR(20) DEFAULT 'VALID' 
    CHECK (validation_status IN ('VALID', 'DUPLICATE', 'SUSPECTED', 'LOW_CONFIDENCE'));
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS location_confidence VARCHAR(10) DEFAULT 'MEDIUM' 
    CHECK (location_confidence IN ('HIGH', 'MEDIUM', 'LOW'));
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS duplicate_of INTEGER REFERENCES complaints(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS metadata_validation JSONB;

-- Rate limiting table
CREATE TABLE IF NOT EXISTS user_rate_limits (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    submission_date DATE DEFAULT CURRENT_DATE,
    hourly_count INTEGER DEFAULT 0,
    daily_count INTEGER DEFAULT 0,
    last_submission TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, submission_date)
);

-- Image hashes table for duplicate detection
CREATE TABLE IF NOT EXISTS image_hashes (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER REFERENCES complaints(id),
    image_hash VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_complaints_image_hash ON complaints(image_hash);
CREATE INDEX IF NOT EXISTS idx_complaints_validation_status ON complaints(validation_status);
CREATE INDEX IF NOT EXISTS idx_user_rate_limits_user_date ON user_rate_limits(user_id, submission_date);
CREATE INDEX IF NOT EXISTS idx_image_hashes_hash ON image_hashes(image_hash);
CREATE INDEX IF NOT EXISTS idx_complaints_duplicate_of ON complaints(duplicate_of);

-- Function to clean old rate limit records (older than 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_rate_limits() RETURNS void AS $$
BEGIN
    DELETE FROM user_rate_limits WHERE submission_date < CURRENT_DATE - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;