const bcrypt = require('bcrypt');
const pool = require('../config/database');

async function resetSuperadminPassword() {
  const newPassword = 'admin123';
  const email = 'superadmin@echo.gov';
  
  try {
    // Generate new password hash
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);
    
    console.log('Generated password hash:', passwordHash);
    
    // Update password in authorities table
    const result = await pool.query(
      'UPDATE authorities SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING id, email, authority_level',
      [passwordHash, email]
    );
    
    if (result.rows.length > 0) {
      console.log('✅ Superadmin password reset successful in authorities table:', result.rows[0]);
    } else {
      console.log('❌ Superadmin not found in authorities table:', email);
      
      // Check if exists in users table instead
      const userResult = await pool.query(
        'SELECT email, role FROM users WHERE email = $1',
        [email]
      );
      
      if (userResult.rows.length > 0) {
        console.log('Found in users table:', userResult.rows[0]);
        
        // Update in users table
        const updateUser = await pool.query(
          'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING id, email, role',
          [passwordHash, email]
        );
        
        console.log('✅ Updated password in users table:', updateUser.rows[0]);
      }
    }
    
  } catch (error) {
    console.error('❌ Error resetting superadmin password:', error);
  } finally {
    await pool.end();
  }
}

// Run the script
resetSuperadminPassword();