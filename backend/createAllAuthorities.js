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

const authorities = [
  { email: 'pothole@echo.gov', password: 'pothole123', name: 'Pothole Department', department: 'Pothole', wardId: 1 },
  { email: 'streetlight@echo.gov', password: 'streetlight123', name: 'Streetlight Department', department: 'Streetlight', wardId: 1 },
  { email: 'garbage@echo.gov', password: 'garbage123', name: 'Garbage Department', department: 'Garbage', wardId: 1 },
  { email: 'drainage@echo.gov', password: 'drainage123', name: 'Drainage Department', department: 'Drainage', wardId: 1 }
];

async function createAllAuthorities() {
  const client = await pool.connect();
  
  try {
    console.log('Creating all department authorities...\n');
    
    for (const auth of authorities) {
      // Check if exists
      const existing = await client.query('SELECT id FROM users WHERE email = $1', [auth.email]);
      
      if (existing.rows.length > 0) {
        console.log(`⚠️  ${auth.department}: Already exists (${auth.email})`);
        continue;
      }
      
      await client.query('BEGIN');
      
      const passwordHash = await bcrypt.hash(auth.password, 10);
      
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, full_name, ward_id, is_active)
         VALUES ($1, $2, 'authority', $3, $4, true) RETURNING id`,
        [auth.email, passwordHash, auth.name, auth.wardId]
      );
      
      const userId = userResult.rows[0].id;
      
      await client.query(
        `INSERT INTO authority_assignments (user_id, ward_id, department)
         VALUES ($1, $2, $3)`,
        [userId, auth.wardId, auth.department]
      );
      
      await client.query('COMMIT');
      
      console.log(`✓ Created: ${auth.department} Department`);
      console.log(`  Email: ${auth.email}`);
      console.log(`  Password: ${auth.password}\n`);
    }
    
    console.log('\n=== ALL AUTHORITY CREDENTIALS ===');
    console.log('─────────────────────────────────────────────────');
    authorities.forEach(auth => {
      console.log(`${auth.department.padEnd(15)} | ${auth.email.padEnd(25)} | ${auth.password}`);
    });
    console.log('─────────────────────────────────────────────────\n');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

createAllAuthorities();
