-- Diagnostic script to check complaint routing issues

-- 1. Check if authorities table exists and has data
SELECT 'authorities_check' as check_type, COUNT(*) as count FROM authorities;

-- 2. Check categories and their assigned authorities
SELECT 
    'category_authority_mapping' as check_type,
    c.id as category_id,
    c.name as category_name,
    a.id as authority_id,
    a.email as authority_email,
    a.authority_level
FROM categories c
LEFT JOIN authorities a ON c.id = a.category_id AND a.authority_level = 'DEPARTMENT'
ORDER BY c.id;

-- 3. Check recent complaints and their assignment status
SELECT 
    'recent_complaints' as check_type,
    c.id,
    c.created_at,
    c.category_id,
    cat.name as category_name,
    c.assigned_authority_id,
    a.email as assigned_to_email,
    c.status,
    c.routing_reason
FROM complaints c
JOIN categories cat ON c.category_id = cat.id
LEFT JOIN authorities a ON c.assigned_authority_id = a.id
ORDER BY c.created_at DESC
LIMIT 10;

-- 4. Check issues and their status
SELECT 
    'recent_issues' as check_type,
    i.id,
    i.status,
    i.echo_count,
    i.first_reported_at,
    cat.name as category_name,
    COUNT(c.id) as complaint_count
FROM issues i
JOIN categories cat ON i.category_id = cat.id
LEFT JOIN complaints c ON i.id = c.issue_id
GROUP BY i.id, cat.name
ORDER BY i.first_reported_at DESC
LIMIT 10;

-- 5. Check for complaints without authority assignment
SELECT 
    'unassigned_complaints' as check_type,
    COUNT(*) as count
FROM complaints c
WHERE c.assigned_authority_id IS NULL
AND c.created_at > CURRENT_DATE - INTERVAL '7 days';