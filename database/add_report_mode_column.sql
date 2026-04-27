-- Add report_mode column to complaints table
-- This column tracks whether the complaint was submitted via single location or dual location method

ALTER TABLE complaints 
ADD COLUMN IF NOT EXISTS report_mode VARCHAR(20) DEFAULT 'single_location';

-- Update existing records to have default value
UPDATE complaints 
SET report_mode = 'single_location' 
WHERE report_mode IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN complaints.report_mode IS 'Reporting method: single_location (at issue location) or dual_location (remote reporting)';