-- Comprehensive fix for complaint routing system
-- This ensures all categories have proper department authorities

-- Step 1: Ensure authorities table exists (if not, create it)
CREATE TABLE IF NOT EXISTS authorities (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    authority_level VARCHAR(20) NOT NULL CHECK (authority_level IN ('SUPER_ADMIN', 'DEPARTMENT', 'JURISDICTION')),
    jurisdiction_id INTEGER,
    category_id INTEGER,
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 2: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_authorities_email ON authorities(email);
CREATE INDEX IF NOT EXISTS idx_authorities_level ON authorities(authority_level);
CREATE INDEX IF NOT EXISTS idx_authorities_jurisdiction ON authorities(jurisdiction_id);
CREATE INDEX IF NOT EXISTS idx_authorities_category ON authorities(category_id);

-- Step 3: Add authority columns to complaints table if they don't exist
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS assigned_authority_id INTEGER;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS escalated_authority_id INTEGER;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS routing_reason VARCHAR(50);
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS escalation_level INTEGER DEFAULT 0;

-- Step 4: Insert/Update department authorities for all categories
-- Using ON CONFLICT to avoid duplicates

-- Category 1: Pothole -> Roads Department
INSERT INTO authorities (email, password_hash, full_name, authority_level, category_id, department, is_active) 
VALUES ('roads.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Roads Department Head', 'DEPARTMENT', 1, 'Roads & Infrastructure', true)
ON CONFLICT (email) DO UPDATE SET
    category_id = 1,
    department = 'Roads & Infrastructure',
    is_active = true;

-- Category 2: Streetlight -> Utilities Department  
INSERT INTO authorities (email, password_hash, full_name, authority_level, category_id, department, is_active) 
VALUES ('utilities.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Utilities Department Head', 'DEPARTMENT', 2, 'Public Utilities', true)
ON CONFLICT (email) DO UPDATE SET
    category_id = 2,
    department = 'Public Utilities',
    is_active = true;

-- Category 3: Garbage -> Sanitation Department
INSERT INTO authorities (email, password_hash, full_name, authority_level, category_id, department, is_active) 
VALUES ('sanitation.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Sanitation Department Head', 'DEPARTMENT', 3, 'Sanitation & Waste', true)
ON CONFLICT (email) DO UPDATE SET
    category_id = 3,
    department = 'Sanitation & Waste',
    is_active = true;

-- Category 4: Water Supply -> Water Department
INSERT INTO authorities (email, password_hash, full_name, authority_level, category_id, department, is_active) 
VALUES ('water.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Water Department Head', 'DEPARTMENT', 4, 'Water Supply', true)
ON CONFLICT (email) DO UPDATE SET
    category_id = 4,
    department = 'Water Supply',
    is_active = true;

-- Category 5: Drainage -> Drainage Department (THIS IS THE KEY FIX)
INSERT INTO authorities (email, password_hash, full_name, authority_level, category_id, department, is_active) 
VALUES ('drainage.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Drainage Department Head', 'DEPARTMENT', 5, 'Drainage & Sewage', true)
ON CONFLICT (email) DO UPDATE SET
    category_id = 5,
    department = 'Drainage & Sewage',
    is_active = true;

-- Category 6: Encroachment -> Enforcement Department
INSERT INTO authorities (email, password_hash, full_name, authority_level, category_id, department, is_active) 
VALUES ('enforcement.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Enforcement Department Head', 'DEPARTMENT', 6, 'Enforcement & Encroachment', true)
ON CONFLICT (email) DO UPDATE SET
    category_id = 6,
    department = 'Enforcement & Encroachment',
    is_active = true;

-- Step 5: Insert Super Admin
INSERT INTO authorities (email, password_hash, full_name, authority_level, department, is_active) 
VALUES ('superadmin@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Super Administrator', 'SUPER_ADMIN', 'Administration', true)
ON CONFLICT (email) DO UPDATE SET
    authority_level = 'SUPER_ADMIN',
    department = 'Administration',
    is_active = true;

-- Step 6: Fix any existing unassigned complaints by re-routing them
-- This will assign drainage complaints to the drainage department
UPDATE complaints 
SET assigned_authority_id = (
    SELECT a.id 
    FROM authorities a 
    WHERE a.category_id = complaints.category_id 
    AND a.authority_level = 'DEPARTMENT' 
    AND a.is_active = true 
    LIMIT 1
),
routing_reason = 'RETROACTIVE_ASSIGNMENT'
WHERE assigned_authority_id IS NULL 
AND category_id IN (1, 2, 3, 4, 5, 6);

-- Step 7: Verification query to check the fix
SELECT 
    c.id as category_id,
    c.name as category_name,
    a.id as authority_id,
    a.email,
    a.full_name,
    a.authority_level,
    a.department,
    a.is_active
FROM categories c
LEFT JOIN authorities a ON c.id = a.category_id AND a.authority_level = 'DEPARTMENT'
ORDER BY c.id;