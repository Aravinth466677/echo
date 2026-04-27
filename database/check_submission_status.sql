-- Test complaint submission by checking what happens when we try to submit
-- First, let's check if there are any users (citizens) to submit complaints

SELECT 'Users Check' as test_name, COUNT(*) as count, role FROM users GROUP BY role;

-- Check if there are any issues (even without complaints)
SELECT 'Issues Check' as test_name, COUNT(*) as count FROM issues;

-- Check recent audit logs to see if there's any activity
SELECT 'Recent Activity' as test_name, action, entity_type, created_at 
FROM audit_logs 
ORDER BY created_at DESC 
LIMIT 5;

-- Check if the uploads directory exists by looking for any evidence URLs
SELECT 'Evidence Files' as test_name, COUNT(*) as count 
FROM complaints 
WHERE evidence_url IS NOT NULL;