-- EXPLAIN ANALYZE Query for Optimized Spatial Performance
-- This shows the final optimized query with spatial index usage and KNN ordering

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

-- Expected OPTIMIZED output (what you should see):
-- Limit  (cost=0.25..34.59 rows=1 width=58) (actual time=1.218..1.219 rows=0 loops=1)
--   ->  Nested Loop  (cost=0.25..34.59 rows=1 width=58) (actual time=1.217..1.218 rows=0 loops=1)
--         ->  Index Scan using idx_complaints_spatial_active on complaints c  (cost=0.25..20.78 rows=1 width=68) (actual time=1.216..1.216 rows=0 loops=1)
--               Index Cond: (location && _st_expand('...'::geography, '150'::double precision))
--               Order By: (location <-> '...'::geography)
--               Filter: ((category_id = 1) AND (created_at > (CURRENT_TIMESTAMP - '24:00:00'::interval)) AND st_dwithin(...))
--         ->  Seq Scan on categories cat  (cost=0.00..1.05 rows=1 width=14) (never executed)

-- SUCCESS INDICATORS:
-- ✅ "Index Scan using idx_complaints_spatial_active" (spatial index used)
-- ✅ "Order By: (location <-> ...)" (KNN ordering active)
-- ✅ "Index Cond: (location && _st_expand(...))" (proper spatial condition)
-- ✅ NO "Sort Method: quicksort" anywhere (no sorting step)
-- ✅ Fast execution time

-- To test with your actual data, replace:
-- -74.006, 40.7128 with coordinates from your database
-- category_id = 1 with an actual category ID that has data
-- Adjust time window if needed to match your test data