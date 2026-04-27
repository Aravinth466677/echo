-- EXPLAIN ANALYZE Query - Run this to test the optimization
-- The indexes are now created, so this will show the performance improvement

EXPLAIN ANALYZE
SELECT c.id, c.user_id, c.created_at, c.description, c.validation_status,
       ST_Distance(c.location, ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography) as distance_meters,
       cat.name as category_name
FROM complaints c
JOIN categories cat ON c.category_id = cat.id
WHERE ST_DWithin(
    c.location,
    ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography,
    150
  )
  AND c.category_id = 1
  AND c.created_at > CURRENT_TIMESTAMP - (24 * INTERVAL '1 hour')
  AND c.validation_status != 'DUPLICATE'
ORDER BY c.location <-> ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography
LIMIT 10;

-- Expected optimized output should show:
-- 1. "Index Scan using idx_complaints_spatial_filtered" (using the partial spatial index)
-- 2. "Order By: (location <-> ...)" (KNN ordering without separate sort)
-- 3. Much faster execution time
-- 4. No "Sort" operation in the plan