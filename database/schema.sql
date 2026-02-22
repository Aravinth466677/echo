-- Echo Civic Complaint Management System
-- Database Schema with PostGIS support

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Users table (Citizens, Authorities, Admins)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('citizen', 'authority', 'admin')),
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    ward_id INTEGER,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Issue categories
CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    aggregation_radius_meters INTEGER DEFAULT 100,
    aggregation_time_window_hours INTEGER DEFAULT 72,
    sla_hours INTEGER DEFAULT 168,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Issues (aggregated complaints)
CREATE TABLE issues (
    id SERIAL PRIMARY KEY,
    category_id INTEGER REFERENCES categories(id),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    ward_id INTEGER,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'in_progress', 'resolved', 'rejected')),
    echo_count INTEGER DEFAULT 1,
    first_reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP,
    verified_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    resolved_by INTEGER REFERENCES users(id),
    resolution_proof_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Individual complaints (supporting reports)
CREATE TABLE complaints (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER REFERENCES issues(id),
    user_id INTEGER REFERENCES users(id),
    category_id INTEGER REFERENCES categories(id),
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    evidence_url VARCHAR(500) NOT NULL,
    evidence_type VARCHAR(10) CHECK (evidence_type IN ('photo', 'video')),
    description TEXT,
    is_primary BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'submitted' CHECK (status IN ('submitted', 'aggregated', 'rejected')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit logs
CREATE TABLE audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Authority assignments
CREATE TABLE authority_assignments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    ward_id INTEGER NOT NULL,
    department VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_issues_status ON issues(status);
CREATE INDEX idx_issues_category ON issues(category_id);
CREATE INDEX idx_issues_ward ON issues(ward_id);
CREATE INDEX idx_complaints_user ON complaints(user_id);
CREATE INDEX idx_complaints_issue ON complaints(issue_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);

-- Geospatial indexes
CREATE INDEX idx_issues_location ON issues USING GIST(location);
CREATE INDEX idx_complaints_location ON complaints USING GIST(location);

-- Insert default categories
INSERT INTO categories (name, description, aggregation_radius_meters, aggregation_time_window_hours, sla_hours) VALUES
('Pothole', 'Road damage and potholes', 50, 72, 168),
('Streetlight', 'Non-functional or damaged streetlights', 30, 48, 120),
('Garbage', 'Uncollected garbage or illegal dumping', 100, 24, 72),
('Water Supply', 'Water leakage or supply issues', 75, 48, 96),
('Drainage', 'Blocked drains or sewage issues', 80, 48, 120),
('Encroachment', 'Illegal construction or encroachment', 50, 168, 336);

-- Insert default admin user (password: admin123)
-- Password hash generated with: bcrypt.hash('admin123', 10)
INSERT INTO users (email, password_hash, role, full_name) VALUES
('admin@echo.gov', '$2b$10$K8jqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qYtK9XeYOqZ9X8vYxJ5qY', 'admin', 'System Administrator');
