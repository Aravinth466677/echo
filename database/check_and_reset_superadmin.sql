-- Check authorities table for superadmin
SELECT email, authority_level, full_name, is_active, password_hash FROM authorities WHERE email = 'superadmin@echo.gov';

-- If superadmin exists, reset password
UPDATE authorities 
SET password_hash = '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY',
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'superadmin@echo.gov';

-- If superadmin doesn't exist, create it
INSERT INTO authorities (email, password_hash, full_name, authority_level, is_active)
VALUES ('superadmin@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Super Administrator', 'super', true)
ON CONFLICT (email) DO UPDATE SET
    password_hash = EXCLUDED.password_hash,
    updated_at = CURRENT_TIMESTAMP;

-- Verify the result
SELECT email, authority_level, full_name, is_active FROM authorities WHERE email = 'superadmin@echo.gov';