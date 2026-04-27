-- Add jurisdiction_id to authority_assignments table
ALTER TABLE authority_assignments 
ADD COLUMN IF NOT EXISTS jurisdiction_id INTEGER REFERENCES jurisdictions(id);

CREATE INDEX IF NOT EXISTS idx_authority_assignments_jurisdiction 
ON authority_assignments(jurisdiction_id);
