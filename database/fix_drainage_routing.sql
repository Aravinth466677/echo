-- Fix drainage department authority routing
-- The issue is that drainage complaints (category_id = 5) don't have a proper department authority

-- First, let's check what categories exist
SELECT id, name FROM categories ORDER BY id;

-- Check current authorities
SELECT id, email, full_name, authority_level, category_id, department FROM authorities;

-- Fix: Add drainage department authority for category_id = 5 (Drainage)
INSERT INTO authorities (email, password_hash, full_name, authority_level, category_id, department, is_active) 
VALUES ('drainage.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Drainage Department Head', 'DEPARTMENT', 5, 'Drainage & Sewage', true)
ON CONFLICT (email) DO UPDATE SET
    category_id = 5,
    department = 'Drainage & Sewage',
    is_active = true;

-- Fix: Update water department to correct category (category_id = 4 for Water Supply)
UPDATE authorities 
SET category_id = 4, department = 'Water Supply'
WHERE email = 'water.dept@echo.gov';

-- Fix: Add encroachment department authority for category_id = 6 (Encroachment)
INSERT INTO authorities (email, password_hash, full_name, authority_level, category_id, department, is_active) 
VALUES ('enforcement.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Enforcement Department Head', 'DEPARTMENT', 6, 'Enforcement & Encroachment', true)
ON CONFLICT (email) DO UPDATE SET
    category_id = 6,
    department = 'Enforcement & Encroachment',
    is_active = true;

-- Verify the fix
SELECT 
    c.id as category_id,
    c.name as category_name,
    a.id as authority_id,
    a.email,
    a.full_name,
    a.authority_level,
    a.department
FROM categories c
LEFT JOIN authorities a ON c.id = a.category_id AND a.authority_level = 'DEPARTMENT'
ORDER BY c.id;