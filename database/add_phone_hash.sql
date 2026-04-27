-- Migration to add phone_hash field and ensure phone field exists
-- Run this if needed

-- Add phone_hash field if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64);

-- Create index for phone hash lookup
CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash);

-- Ensure phone field exists (should already be there)
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);

-- Update existing users to have phone_hash if they have phone numbers
UPDATE users 
SET phone_hash = encode(sha256(phone::bytea), 'hex')
WHERE phone IS NOT NULL AND phone_hash IS NULL;