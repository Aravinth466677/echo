const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function updateAdminPassword() {
  try {
    const passwordHash = await bcrypt.hash('admin123', 10);
    console.log('Generated hash:', passwordHash);
    
    await pool.query(
      `UPDATE users SET password_hash = $1 WHERE email = 'admin@echo.gov'`,
      [passwordHash]
    );
    
    console.log('Admin password updated successfully!');
    console.log('Email: admin@echo.gov');
    console.log('Password: admin123');
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

updateAdminPassword();
