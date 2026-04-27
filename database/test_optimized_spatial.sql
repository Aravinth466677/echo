-- Test query to verify optimization
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

-- Expected optimized output:
-- Limit  (cost=0.41..8.43 rows=10 width=XXX) (actual time=0.089..0.234 rows=5 loops=1)
--   ->  Nested Loop  (cost=0.41..XX.XX rows=XX width=XXX) (actual time=0.088..0.232 rows=5 loops=1)
--         ->  Index Scan using idx_complaints_spatial_filtered on complaints c  (cost=0.28..XX.XX rows=XX width=XXX) (actual time=0.067..0.156 rows=5 loops=1)
--               Order By: (location <-> ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography)
--               Filter: ((category_id = 1) AND (created_at > (CURRENT_TIMESTAMP - ('24'::double precision * '01:00:00'::interval))) AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography, 150))
--         ->  Index Scan using categories_pkey on categories cat  (cost=0.13..0.15 rows=1 width=XXX) (actual time=0.015..0.015 rows=1 loops=5)
--               Index Cond: (id = c.category_id)
-- Planning Time: 0.156 ms
-- Execution Time: 0.267 ms

-- Key improvements to look for:
-- 1. "Index Scan using idx_complaints_spatial_filtered" (partial index usage)
-- 2. "Order By: (location <-> ...)" (KNN ordering, no separate sort step)
-- 3. Reduced execution time compared to previous query
-- 4. No "Sort" node in the execution plan