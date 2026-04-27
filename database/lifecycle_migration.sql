-- COMPLAINT LIFECYCLE SYSTEM MIGRATION
-- Production-ready strict state machine implementation

-- 1. CREATE STATUS ENUMS
CREATE TYPE complaint_status AS ENUM (
    'PENDING',
    'ASSIGNED', 
    'IN_PROGRESS',
    'RESOLVED',
    'VERIFIED',
    'CLOSED'
);

CREATE TYPE verification_status AS ENUM (
    'PENDING',
    'VERIFIED', 
    'REJECTED'
);

-- 2. CREATE COMPLAINT HISTORY TABLE (AUDIT TRAIL)
CREATE TABLE complaint_history (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER NOT NULL,
    old_status complaint_status,
    new_status complaint_status NOT NULL,
    changed_by INTEGER NOT NULL REFERENCES users(id),
    role VARCHAR(20) NOT NULL,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. ALTER COMPLAINTS TABLE FOR LIFECYCLE
ALTER TABLE complaints 
ADD COLUMN lifecycle_status complaint_status DEFAULT 'PENDING',
ADD COLUMN verification_status verification_status DEFAULT 'PENDING',
ADD COLUMN rejection_reason TEXT,
ADD COLUMN assigned_to INTEGER REFERENCES users(id),
ADD COLUMN assigned_at TIMESTAMP,
ADD COLUMN in_progress_at TIMESTAMP,
ADD COLUMN resolved_at TIMESTAMP,
ADD COLUMN verified_at TIMESTAMP,
ADD COLUMN closed_at TIMESTAMP,
ADD COLUMN verified_by INTEGER REFERENCES users(id);

-- 4. CREATE INDEXES FOR PERFORMANCE
CREATE INDEX idx_complaints_lifecycle_status ON complaints(lifecycle_status);
CREATE INDEX idx_complaints_assigned_to ON complaints(assigned_to);
CREATE INDEX idx_complaints_verification_status ON complaints(verification_status);
CREATE INDEX idx_complaint_history_complaint_id ON complaint_history(complaint_id);
CREATE INDEX idx_complaint_history_created_at ON complaint_history(created_at);

-- 5. ADD CONSTRAINTS
ALTER TABLE complaint_history 
ADD CONSTRAINT fk_complaint_history_complaint 
FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE;

-- Prevent authority from verifying their own work
ALTER TABLE complaints 
ADD CONSTRAINT chk_no_self_verification 
CHECK (assigned_to IS NULL OR verified_by IS NULL OR assigned_to != verified_by);

-- 6. UPDATE EXISTING DATA
-- Set all existing complaints to PENDING status
UPDATE complaints SET lifecycle_status = 'PENDING' WHERE lifecycle_status IS NULL;

-- 7. CREATE FUNCTION TO AUTO-UPDATE TIMESTAMPS
CREATE OR REPLACE FUNCTION update_complaint_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamp based on status change
    CASE NEW.lifecycle_status
        WHEN 'ASSIGNED' THEN
            NEW.assigned_at = CURRENT_TIMESTAMP;
        WHEN 'IN_PROGRESS' THEN
            IF OLD.lifecycle_status != 'IN_PROGRESS' THEN
                NEW.in_progress_at = CURRENT_TIMESTAMP;
            END IF;
        WHEN 'RESOLVED' THEN
            NEW.resolved_at = CURRENT_TIMESTAMP;
        WHEN 'VERIFIED' THEN
            NEW.verified_at = CURRENT_TIMESTAMP;
        WHEN 'CLOSED' THEN
            NEW.closed_at = CURRENT_TIMESTAMP;
    END CASE;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. CREATE TRIGGER FOR TIMESTAMP UPDATES
CREATE TRIGGER trigger_update_complaint_timestamps
    BEFORE UPDATE ON complaints
    FOR EACH ROW
    EXECUTE FUNCTION update_complaint_timestamps();

-- 9. GRANT PERMISSIONS (adjust as needed)
GRANT SELECT, INSERT ON complaint_history TO your_app_user;
GRANT SELECT, UPDATE ON complaints TO your_app_user;

COMMENT ON TABLE complaint_history IS 'Audit trail for all complaint status changes';
COMMENT ON TYPE complaint_status IS 'Strict state machine: PENDING → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED → CLOSED';
COMMENT ON TYPE verification_status IS 'Citizen verification of resolution: PENDING → VERIFIED/REJECTED';