require("dotenv").config();
const bcrypt = require('bcrypt');
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function createProductionAdmin() {
  console.log("🔧 Creating admin in production database...");
  
  try {
    // Test connection
    await pool.query("SELECT NOW()");
    console.log("✅ Connected to production database");
    
    // Create password hash
    const passwordHash = await bcrypt.hash('admin123', 10);
    
    // Delete existing admin if exists
    await pool.query('DELETE FROM authorities WHERE email = $1', ['admin@echo.gov']);
    await pool.query('DELETE FROM users WHERE email = $1', ['admin@echo.gov']);
    
    // Insert fresh admin
    await pool.query(`
      INSERT INTO authorities (email, password_hash, full_name, authority_level, department, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['admin@echo.gov', passwordHash, 'System Admin', 'SUPER_ADMIN', 'Administration', true]);
    
    console.log("✅ Admin created successfully");
    
    // Verify login
    const result = await pool.query(
      'SELECT email, authority_level FROM authorities WHERE email = $1',
      ['admin@echo.gov']
    );
    
    if (result.rows.length > 0) {
      console.log("🎉 Admin verification:", result.rows[0]);
      
      // Test password
      const testResult = await pool.query(
        'SELECT password_hash FROM authorities WHERE email = $1',
        ['admin@echo.gov']
      );
      
      const passwordMatch = await bcrypt.compare('admin123', testResult.rows[0].password_hash);
      console.log("Password test:", passwordMatch ? '✅ Correct' : '❌ Wrong');
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await pool.end();
    process.exit();
  }
}

createProductionAdmin();