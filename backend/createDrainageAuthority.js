const { Pool } = require('pg');
const bcrypt = require('bcrypt');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function createDrainageAuthority() {
  const client = await pool.connect();
  
  try {
    console.log('Creating Drainage Department Authority...\n');
    
    // Authority details
    const email = 'drainage@echo.gov';
    const password = 'drainage123';
    const fullName = 'Drainage Department';
    const wardId = 1;
    const department = 'Drainage';
    
    // Check if user already exists
    const existingUser = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    
    if (existingUser.rows.length > 0) {
      console.log('⚠️  User already exists with email:', email);
      console.log('   User ID:', existingUser.rows[0].id);
      console.log('\nTo reset password, delete the user first:');
      console.log(`   DELETE FROM users WHERE email = '${email}';`);
      return;
    }
    
    await client.query('BEGIN');
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash, role, full_name, ward_id, is_active)
       VALUES ($1, $2, 'authority', $3, $4, true)
       RETURNING id`,
      [email, passwordHash, fullName, wardId]
    );
    
    const userId = userResult.rows[0].id;
    
    // Create authority assignment
    await client.query(
      `INSERT INTO authority_assignments (user_id, ward_id, department)
       VALUES ($1, $2, $3)`,
      [userId, wardId, department]
    );
    
    await client.query('COMMIT');
    
    console.log('✓ Successfully created Drainage Department Authority!\n');
    console.log('Login Credentials:');
    console.log('─────────────────────────────────────');
    console.log(`Email:      ${email}`);
    console.log(`Password:   ${password}`);
    console.log(`Role:       authority`);
    console.log(`Ward:       ${wardId}`);
    console.log(`Department: ${department}`);
    console.log('─────────────────────────────────────\n');
    console.log('Login at: http://localhost:3000');
    console.log('Select "Authority" role when logging in\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating authority:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

createDrainageAuthority();
