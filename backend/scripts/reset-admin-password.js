const bcrypt = require('bcrypt');
const pool = require('../config/database');

async function resetAdminPassword() {
  const newPassword = 'admin123'; // Change this to your desired password
  const email = 'superadmin@echo.gov';
  
  try {
    // Generate new password hash
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    
    console.log('Generated password hash:', passwordHash);
    
    // Update password in database
    const result = await pool.query(
      'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING id, email, role',
      [passwordHash, email]
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Superadmin password reset successful for:', result.rows[0]);
    } else {
      console.log('❌ Superadmin not found, creating new account...');
      
      // Create new superadmin user
      const createResult = await pool.query(
        `INSERT INTO users (email, password_hash, role, full_name, is_active) 
         VALUES ($1, $2, 'admin', 'Super Administrator', true) 
         RETURNING id, email, role`,
        [email, passwordHash]
      );
      
      console.log('✅ New superadmin user created:', createResult.rows[0]);
    }
    
  } catch (error) {
    console.error('❌ Error resetting superadmin password:', error);
  } finally {
    await pool.end();
  }
}

// Run the script
resetAdminPassword();