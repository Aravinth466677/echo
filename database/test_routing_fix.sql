-- Test script to verify complaint routing is working
-- Run this after applying the fix

-- Test 1: Check all categories have department authorities
SELECT 
    'Category Coverage' as test_name,
    c.id,
    c.name,
    CASE 
        WHEN a.id IS NOT NULL THEN 'HAS_AUTHORITY'
        ELSE 'MISSING_AUTHORITY'
    END as status,
    a.email,
    a.full_name
FROM categories c
LEFT JOIN authorities a ON c.id = a.category_id AND a.authority_level = 'DEPARTMENT' AND a.is_active = true
ORDER BY c.id;

-- Test 2: Check recent complaints assignment status
SELECT 
    'Recent Complaints Assignment' as test_name,
    c.id,
    c.created_at,
    cat.name as category,
    CASE 
        WHEN c.assigned_authority_id IS NOT NULL THEN 'ASSIGNED'
        ELSE 'UNASSIGNED'
    END as assignment_status,
    a.email as assigned_to,
    c.routing_reason
FROM complaints c
JOIN categories cat ON c.category_id = cat.id
LEFT JOIN authorities a ON c.assigned_authority_id = a.id
WHERE c.created_at > CURRENT_DATE - INTERVAL '7 days'
ORDER BY c.created_at DESC
LIMIT 10;

-- Test 3: Count unassigned complaints by category
SELECT 
    'Unassigned by Category' as test_name,
    cat.name as category,
    COUNT(c.id) as unassigned_count
FROM complaints c
JOIN categories cat ON c.category_id = cat.id
WHERE c.assigned_authority_id IS NULL
AND c.created_at > CURRENT_DATE - INTERVAL '30 days'
GROUP BY cat.name
ORDER BY unassigned_count DESC;

-- Test 4: Verify drainage department specifically
SELECT 
    'Drainage Department Check' as test_name,
    a.id,
    a.email,
    a.full_name,
    a.category_id,
    c.name as category_name,
    a.is_active
FROM authorities a
JOIN categories c ON a.category_id = c.id
WHERE c.name = 'Drainage'
AND a.authority_level = 'DEPARTMENT';