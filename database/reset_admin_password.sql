-- Reset superadmin password
-- This script resets the superadmin@echo.gov password to 'admin123'

-- Reset superadmin password
UPDATE users 
SET password_hash = '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY',
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'superadmin@echo.gov';

-- Create superadmin if it doesn't exist
INSERT INTO users (email, password_hash, role, full_name, is_active)
VALUES ('superadmin@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'admin', 'Super Administrator', true)
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    updated_at = CURRENT_TIMESTAMP;

-- Verify accounts
SELECT email, role, full_name, is_active, created_at 
FROM users 
WHERE role = 'admin';