require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function setupDatabase() {
  console.log("🚀 Setting up Echo database...");
  
  try {
    // Test connection first
    await pool.query("SELECT NOW()");
    console.log("✅ Database connection successful");
    
    // Enable PostGIS
    await pool.query("CREATE EXTENSION IF NOT EXISTS postgis");
    console.log("✅ PostGIS extension enabled");
    
    // Categories table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ Categories table created");
    
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
    console.log("✅ Users table created");
    
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
    console.log("✅ Authorities table created");
    
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
    console.log("✅ Complaints table created");
    
    // Insert basic categories
    await pool.query(`
      INSERT INTO categories (name, description) VALUES 
      ('Drainage', 'Water logging and drainage issues'),
      ('Roads', 'Road maintenance and repairs'),
      ('Garbage', 'Waste management issues'),
      ('Street Lights', 'Public lighting problems')
      ON CONFLICT (name) DO NOTHING
    `);
    console.log("✅ Basic categories inserted");
    
    // Insert admin user (password: admin123)
    await pool.query(`
      INSERT INTO users (email, password_hash, full_name, role) VALUES 
      ('admin@echo.gov', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'System Admin', 'admin')
      ON CONFLICT (email) DO NOTHING
    `);
    console.log("✅ Admin user created (admin@echo.gov / admin123)");
    
    // Create indexes
    await pool.query("CREATE INDEX IF NOT EXISTS idx_complaints_user_id ON complaints (user_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_complaints_category_id ON complaints (category_id)");
    await pool.query("CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints (status)");
    console.log("✅ Database indexes created");
    
    console.log("");
    console.log("🎉 Database setup complete!");
    console.log("📋 You can now:");
    console.log("   - Login with: admin@echo.gov / admin123");
    console.log("   - Test backend: https://echo-1-jbxj.onrender.com/health");
    console.log("   - Use all Echo features!");
    
  } catch (error) {
    console.error("❌ Database setup failed:", error.message);
  } finally {
    await pool.end();
    process.exit();
  }
}

setupDatabase();