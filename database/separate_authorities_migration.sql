-- Create separate authorities table
-- This separates authorities from users table for better control

-- Create authorities table
CREATE TABLE authorities (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    authority_level VARCHAR(20) NOT NULL CHECK (authority_level IN ('SUPER_ADMIN', 'DEPARTMENT', 'JURISDICTION')),
    jurisdiction_id INTEGER REFERENCES jurisdictions(id),
    category_id INTEGER REFERENCES categories(id),
    department VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_authorities_email ON authorities(email);
CREATE INDEX idx_authorities_level ON authorities(authority_level);
CREATE INDEX idx_authorities_jurisdiction ON authorities(jurisdiction_id);
CREATE INDEX idx_authorities_category ON authorities(category_id);

-- Migrate existing authorities from users table
INSERT INTO authorities (email, password_hash, full_name, phone, authority_level, jurisdiction_id, category_id, department, is_active, created_at)
SELECT 
    u.email,
    u.password_hash,
    u.full_name,
    u.phone,
    COALESCE(aa.authority_level, 'JURISDICTION') as authority_level,
    aa.jurisdiction_id,
    aa.category_id,
    aa.department,
    u.is_active,
    u.created_at
FROM users u
JOIN authority_assignments aa ON u.id = aa.user_id
WHERE u.role = 'authority';

-- Remove authorities from users table (keep only citizens and admin)
DELETE FROM authority_assignments WHERE user_id IN (SELECT id FROM users WHERE role = 'authority');
DELETE FROM users WHERE role = 'authority';

-- Update users table to only allow citizen and admin roles
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('citizen', 'admin'));

-- Update complaints table to reference authorities table
ALTER TABLE complaints ADD COLUMN assigned_authority_id INTEGER REFERENCES authorities(id);
ALTER TABLE complaints ADD COLUMN escalated_authority_id INTEGER REFERENCES authorities(id);

-- Update issues table to reference authorities table  
ALTER TABLE issues ADD COLUMN verified_by_authority_id INTEGER REFERENCES authorities(id);
ALTER TABLE issues ADD COLUMN resolved_by_authority_id INTEGER REFERENCES authorities(id);

-- Drop old foreign key constraints that referenced users table for authorities
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_verified_by_fkey;
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_resolved_by_fkey;

-- Drop authority_assignments table as it's no longer needed
DROP TABLE IF EXISTS authority_assignments;

-- Insert 4 default department authorities (one for each main category)
INSERT INTO authorities (email, password_hash, full_name, authority_level, category_id, department, is_active) VALUES
('roads.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Roads Department Head', 'DEPARTMENT', 1, 'Roads & Infrastructure', true),
('utilities.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Utilities Department Head', 'DEPARTMENT', 2, 'Public Utilities', true),
('sanitation.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Sanitation Department Head', 'DEPARTMENT', 3, 'Sanitation & Waste', true),
('water.dept@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Water Department Head', 'DEPARTMENT', 34, 'Water Supply', true);

-- Insert super admin authority
INSERT INTO authorities (email, password_hash, full_name, authority_level, department, is_active) VALUES
('superadmin@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'Super Administrator', 'SUPER_ADMIN', 'Administration', true);

COMMIT;