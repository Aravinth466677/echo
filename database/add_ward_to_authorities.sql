-- Add ward_id column to authorities table if it doesn't exist
ALTER TABLE authorities ADD COLUMN IF NOT EXISTS ward_id INTEGER;

-- Create index for ward_id
CREATE INDEX IF NOT EXISTS idx_authorities_ward ON authorities(ward_id);

-- Verify the column was added
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'authorities' 
AND table_schema = 'public'
ORDER BY ordinal_position;