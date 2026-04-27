-- Reset superadmin password in authorities table
-- Password: admin123

UPDATE authorities 
SET password_hash = '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY',
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'superadmin@echo.gov';

-- Verify the update
SELECT email, authority_level, full_name, is_active FROM authorities WHERE email = 'superadmin@echo.gov';