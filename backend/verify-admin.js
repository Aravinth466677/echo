const bcrypt = require('bcrypt');
const pool = require('./config/database');

async function verifyAdmin() {
  try {
    console.log('Checking admin accounts...');
    
    // Check if admin exists
    const result = await pool.query(
      'SELECT email, password_hash, authority_level FROM authorities WHERE email = $1',
      ['admin@echo.gov']
    );
    
    if (result.rows.length === 0) {
      console.log('❌ admin@echo.gov not found in authorities table');
      
      // Create admin account
      console.log('Creating admin account...');
      const passwordHash = await bcrypt.hash('admin123', 10);
      
      await pool.query(`
        INSERT INTO authorities (email, password_hash, full_name, authority_level, is_active)
        VALUES ($1, $2, $3, $4, $5)
      `, ['admin@echo.gov', passwordHash, 'System Admin', 'SUPER_ADMIN', true]);
      
      console.log('✅ Admin account created successfully');
    } else {
      const admin = result.rows[0];
      console.log('✅ Admin found:', admin.email, 'Level:', admin.authority_level);
      
      // Test password
      const passwordMatch = await bcrypt.compare('admin123', admin.password_hash);
      console.log('Password test:', passwordMatch ? '✅ Correct' : '❌ Wrong');
      
      if (!passwordMatch) {
        console.log('Updating password...');
        const newHash = await bcrypt.hash('admin123', 10);
        await pool.query(
          'UPDATE authorities SET password_hash = $1 WHERE email = $2',
          [newHash, 'admin@echo.gov']
        );
        console.log('✅ Password updated');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

verifyAdmin();