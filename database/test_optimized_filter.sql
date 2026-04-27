-- Test Query for Optimized Filter Performance
-- Run this to verify reduced filter cost

EXPLAIN ANALYZE
SELECT c.id, c.user_id, c.created_at, c.description, c.validation_status,
       ST_Distance(c.location, ST_MakePoint(-74.006, 40.7128)::geography) as distance_meters,
       cat.name as category_name
FROM complaints c
JOIN categories cat ON c.category_id = cat.id
WHERE c.category_id = 1
  AND c.created_at > CURRENT_TIMESTAMP - (24 * INTERVAL '1 hour')
  AND c.validation_status != 'DUPLICATE'
  AND ST_DWithin(
    c.location,
    ST_MakePoint(-74.006, 40.7128)::geography,
    150
  )
ORDER BY c.location <-> ST_MakePoint(-74.006, 40.7128)::geography
LIMIT 10;

-- EXPECTED OPTIMIZED RESULTS:
-- 1. Index Scan using idx_complaints_spatial_optimized (more selective spatial index)
-- 2. Order By: (location <-> ST_MakePoint(...))
-- 3. Reduced "Rows Removed by Filter" count
-- 4. Lower buffer usage in spatial index scan
-- 5. Faster execution time due to fewer rows processed in filter

-- IMPROVEMENTS TO LOOK FOR:
-- ✅ "Index Scan using idx_complaints_spatial_optimized"
-- ✅ Lower "Rows Removed by Filter" number
-- ✅ Reduced "Buffers: shared hit" count
-- ✅ Same or better execution time
-- ✅ KNN ordering still active: "Order By: (location <-> ...)"

-- The spatial index now pre-filters out:
-- - DUPLICATE validation_status records
-- - NULL category_id records
-- This reduces the number of rows that need filter processing