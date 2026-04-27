-- Complaint Comments Table Migration
-- Supports the audit system's comment functionality

CREATE TABLE IF NOT EXISTS complaint_comments (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment TEXT NOT NULL,
    is_internal BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add missing columns to complaints table for resolution tracking
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS resolution_evidence_url VARCHAR(500);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS citizen_feedback TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS citizen_rating INTEGER CHECK (citizen_rating >= 1 AND citizen_rating <= 5);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_complaint_comments_complaint_id ON complaint_comments(complaint_id);
CREATE INDEX IF NOT EXISTS idx_complaint_comments_user_id ON complaint_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_complaint_comments_created_at ON complaint_comments(created_at);
CREATE INDEX IF NOT EXISTS idx_complaints_resolved_by ON complaints(resolved_by);
CREATE INDEX IF NOT EXISTS idx_complaints_updated_at ON complaints(updated_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER IF NOT EXISTS trigger_complaints_updated_at
    BEFORE UPDATE ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER IF NOT EXISTS trigger_complaint_comments_updated_at
    BEFORE UPDATE ON complaint_comments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();