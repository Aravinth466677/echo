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

async function checkAndFixPassword() {
  const client = await pool.connect();
  
  try {
    console.log('Checking authority accounts...\n');
    
    // Get all authority users
    const authorities = await client.query(`
      SELECT id, email, full_name, password_hash
      FROM users
      WHERE role = 'authority'
    `);
    
    if (authorities.rows.length === 0) {
      console.log('No authority accounts found.');
      console.log('Run: node createDrainageAuthority.js\n');
      return;
    }
    
    console.log(`Found ${authorities.rows.length} authority account(s):\n`);
    
    for (const auth of authorities.rows) {
      console.log(`Email: ${auth.email}`);
      console.log(`Name: ${auth.full_name}`);
      console.log(`Hash: ${auth.password_hash.substring(0, 20)}...`);
      
      // Test password
      const testPassword = 'drainage123';
      const isValid = await bcrypt.compare(testPassword, auth.password_hash);
      
      if (isValid) {
        console.log(`✓ Password '${testPassword}' is CORRECT\n`);
      } else {
        console.log(`✗ Password '${testPassword}' is INCORRECT`);
        console.log(`Fixing password...\n`);
        
        const newHash = await bcrypt.hash(testPassword, 10);
        await client.query(
          'UPDATE users SET password_hash = $1 WHERE id = $2',
          [newHash, auth.id]
        );
        
        console.log(`✓ Password updated to: ${testPassword}\n`);
      }
    }
    
    console.log('Done! Try logging in now.');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkAndFixPassword();
