require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function setupCompleteDatabase() {
  console.log("🚀 Setting up complete Echo database schema...");
  
  try {
    // Test connection
    await pool.query("SELECT NOW()");
    console.log("✅ Database connection successful");
    
    // Enable extensions
    await pool.query("CREATE EXTENSION IF NOT EXISTS postgis");
    await pool.query("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"");
    console.log("✅ Extensions enabled");
    
    // Categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        role VARCHAR(50) DEFAULT 'citizen',
        ward_id INTEGER,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Authorities table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS authorities (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        authority_level VARCHAR(50) NOT NULL,
        jurisdiction_id INTEGER,
        category_id INTEGER,
        department VARCHAR(100),
        ward_id INTEGER,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Jurisdictions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jurisdictions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        boundary GEOMETRY(POLYGON, 4326),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Complaints table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS complaints (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        evidence_url VARCHAR(500),
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        location_geometry GEOMETRY(POINT, 4326),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (category_id) REFERENCES categories(id)
      )
    `);
    
    // Issues table (merged complaints)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS issues (
        id SERIAL PRIMARY KEY,
        category_id INTEGER NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        echo_count INTEGER DEFAULT 1,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        location_geometry GEOMETRY(POINT, 4326),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        sla_due_date TIMESTAMP,
        assigned_authority_id INTEGER,
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (assigned_authority_id) REFERENCES authorities(id)
      )
    `);
    
    // Complaint issue mapping
    await pool.query(`
      CREATE TABLE IF NOT EXISTS complaint_issues (
        id SERIAL PRIMARY KEY,
        complaint_id INTEGER NOT NULL,
        issue_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
        FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
        UNIQUE(complaint_id, issue_id)
      )
    `);
    
    // SLA tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sla_tracking (
        id SERIAL PRIMARY KEY,
        issue_id INTEGER NOT NULL,
        sla_start_time TIMESTAMP NOT NULL,
        sla_due_time TIMESTAMP NOT NULL,
        breach_reported BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE
      )
    `);
    
    console.log("✅ All tables created");
    
    // Insert basic categories
    await pool.query(`
      INSERT INTO categories (name, description) VALUES 
      ('Drainage', 'Water logging and drainage issues'),
      ('Roads', 'Road maintenance and repairs'),
      ('Garbage', 'Waste management issues'),
      ('Street Lights', 'Public lighting problems')
      ON CONFLICT (name) DO NOTHING
    `);
    
    // Insert admin user
    await pool.query(`
      INSERT INTO users (email, password_hash, full_name, role) VALUES 
      ('admin@echo.gov', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'System Admin', 'admin')
      ON CONFLICT (email) DO NOTHING
    `);
    
    // Insert super admin authority
    await pool.query(`
      INSERT INTO authorities (email, password_hash, full_name, authority_level, department) VALUES 
      ('superadmin@echo.gov', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Super Administrator', 'SUPER_ADMIN', 'Administration')
      ON CONFLICT (email) DO NOTHING
    `);
    
    // Create indexes
    await pool.query("CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints (user_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_complaints_category_id ON complaints (category_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints (status)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_issues_status ON issues (status)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_issues_sla_due ON issues (sla_due_date)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_complaints_location ON complaints USING GIST (location_geometry)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_issues_location ON issues USING GIST (location_geometry)");
    
    console.log("✅ Database indexes created");
    
    console.log("");
    console.log("🎉 Complete database setup successful!");
    console.log("📋 Available accounts:");
    console.log("   👤 Admin: admin@echo.gov / admin123");
    console.log("   🔧 Super Admin: superadmin@echo.gov / admin123");
    console.log("");
    console.log("🔗 Next steps:");
    console.log("   1. Update DATABASE_URL in Render environment");
    console.log("   2. Test: https://echo-1-jbxj.onrender.com/health");
    console.log("   3. Update frontend REACT_APP_API_URL in Vercel");
    
  } catch (error) {
    console.error("❌ Database setup failed:", error.message);
    console.error("Full error:", error);
  } finally {
    await pool.end();
    process.exit();
  }
}

setupCompleteDatabase();