-- Final EXPLAIN ANALYZE Test Query
-- Run this after creating the optimized indexes

EXPLAIN ANALYZE
SELECT c.id, c.user_id, c.created_at, c.description, c.validation_status,
       ST_Distance(c.location, ST_MakePoint(-74.006, 40.7128)::geography) as distance_meters,
       cat.name as category_name
FROM complaints c
JOIN categories cat ON c.category_id = cat.id
WHERE ST_DWithin(
    c.location,
    ST_MakePoint(-74.006, 40.7128)::geography,
    150
  )
  AND c.category_id = 1
  AND c.created_at > CURRENT_TIMESTAMP - (24 * INTERVAL '1 hour')
  AND c.validation_status != 'DUPLICATE'
ORDER BY c.location <-> ST_MakePoint(-74.006, 40.7128)::geography
LIMIT 10;

-- EXPECTED OPTIMIZED OUTPUT:
-- Limit  (cost=0.28..8.35 rows=10 width=XXX) (actual time=0.045..0.123 rows=X loops=1)
--   ->  Nested Loop  (cost=0.28..XX.XX rows=XX width=XXX) (actual time=0.044..0.121 rows=X loops=1)
--         ->  Index Scan using idx_complaints_spatial_active on complaints c  (cost=0.15..XX.XX rows=XX width=XXX) (actual time=0.032..0.089 rows=X loops=1)
--               Order By: (location <-> ST_MakePoint(-74.006, 40.7128)::geography)
--               Filter: ((category_id = 1) AND (created_at > (CURRENT_TIMESTAMP - ('24'::double precision * '01:00:00'::interval))) AND ST_DWithin(location, ST_MakePoint(-74.006, 40.7128)::geography, '150'::double precision))
--         ->  Index Scan using categories_pkey on categories cat  (cost=0.13..0.15 rows=1 width=XXX) (actual time=0.008..0.008 rows=1 loops=X)
--               Index Cond: (id = c.category_id)
-- Planning Time: 0.234 ms
-- Execution Time: 0.156 ms

-- CRITICAL SUCCESS INDICATORS:
-- ✅ "Index Scan using idx_complaints_spatial_active"
-- ✅ "Order By: (location <-> ST_MakePoint(...))"  
-- ✅ NO "Sort Method: quicksort" anywhere
-- ✅ NO "Index Scan using idx_complaints_created_at"
-- ✅ Fast execution time (< 1ms for small datasets)