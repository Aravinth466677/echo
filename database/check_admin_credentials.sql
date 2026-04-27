-- Check admin credentials in both tables
-- Run this in your PostgreSQL database

-- Check users table for admin accounts
SELECT id, email, role, full_name, is_active, 
       CASE WHEN password_hash IS NOT NULL THEN 'Has Password' ELSE 'No Password' END as password_status
FROM users 
WHERE role IN ('admin', 'super_admin') OR email LIKE '%admin%' OR email LIKE '%superadmin%';

-- Check authorities table for admin accounts  
SELECT id, email, authority_level, full_name, is_active,
       CASE WHEN password_hash IS NOT NULL THEN 'Has Password' ELSE 'No Password' END as password_status
FROM authorities 
WHERE authority_level = 'SUPER_ADMIN' OR email LIKE '%admin%' OR email LIKE '%superadmin%';

-- Check if there are any admin users at all
SELECT 'users' as table_name, COUNT(*) as admin_count FROM users WHERE role IN ('admin', 'super_admin')
UNION ALL
SELECT 'authorities' as table_name, COUNT(*) as admin_count FROM authorities WHERE authority_level = 'SUPER_ADMIN';