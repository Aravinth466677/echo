-- Authority Hierarchy Migration
-- Run after add_jurisdictions.sql

-- Step 1: Create authority level enum
DO $$ BEGIN
    CREATE TYPE authority_level AS ENUM ('SUPER_ADMIN', 'DEPARTMENT', 'JURISDICTION');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Step 2: Add columns to authority_assignments
ALTER TABLE authority_assignments 
ADD COLUMN IF NOT EXISTS authority_level authority_level NOT NULL DEFAULT 'JURISDICTION',
ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);

-- Step 3: Create index
CREATE INDEX IF NOT EXISTS idx_authority_assignments_level ON authority_assignments(authority_level);
CREATE INDEX IF NOT EXISTS idx_authority_assignments_category ON authority_assignments(category_id);

-- Step 4: Add constraint for jurisdiction level
ALTER TABLE authority_assignments DROP CONSTRAINT IF EXISTS check_jurisdiction_level;
ALTER TABLE authority_assignments
ADD CONSTRAINT check_jurisdiction_level CHECK (
  (authority_level = 'JURISDICTION' AND jurisdiction_id IS NOT NULL) OR
  (authority_level = 'DEPARTMENT' AND jurisdiction_id IS NULL) OR
  (authority_level = 'SUPER_ADMIN')
);

-- Step 5: Modify complaints table
ALTER TABLE complaints
ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS escalated_to INTEGER REFERENCES users(id),
ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMP;

-- Step 6: Create indexes on complaints
CREATE INDEX IF NOT EXISTS idx_complaints_assigned_to ON complaints(assigned_to);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_created_at ON complaints(created_at);

-- Step 7: Update existing authority_assignments with category_id
UPDATE authority_assignments aa
SET category_id = (
  SELECT id FROM categories WHERE name = aa.department
)
WHERE category_id IS NULL AND department IS NOT NULL;

-- Step 8: Create super admin assignment if not exists
INSERT INTO authority_assignments (user_id, ward_id, department, authority_level, category_id)
SELECT id, 1, 'Admin', 'SUPER_ADMIN', NULL
FROM users 
WHERE role = 'admin' AND email = 'admin@echo.gov'
ON CONFLICT DO NOTHING;

-- Step 9: Add comment
COMMENT ON COLUMN authority_assignments.authority_level IS 'SUPER_ADMIN: sees all, DEPARTMENT: sees category across jurisdictions, JURISDICTION: sees category in specific jurisdiction';
