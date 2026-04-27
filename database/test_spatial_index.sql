-- Example EXPLAIN ANALYZE output after optimization
-- Run this query to verify spatial index is being used:

EXPLAIN ANALYZE
SELECT c.id, c.user_id, c.created_at, c.description, c.validation_status,
       ST_Distance(c.location, ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography) as distance_meters,
       cat.name as category_name
FROM complaints c
JOIN categories cat ON c.category_id = cat.id
WHERE c.category_id = 1
  AND c.created_at > CURRENT_TIMESTAMP - (24 * INTERVAL '1 hour')
  AND ST_DWithin(
    c.location,
    ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography,
    150
  )
  AND c.validation_status != 'DUPLICATE'
ORDER BY distance_meters ASC
LIMIT 10;

-- Expected output should include:
-- "Index Scan using idx_complaints_location_geog on complaints c"
-- 
-- Example successful output:
-- Limit  (cost=0.41..8.43 rows=10 width=XXX) (actual time=0.123..0.456 rows=5 loops=1)
--   ->  Nested Loop  (cost=0.41..XX.XX rows=XX width=XXX) (actual time=0.122..0.454 rows=5 loops=1)
--         ->  Index Scan using idx_complaints_location_geog on complaints c  (cost=0.28..XX.XX rows=XX width=XXX) (actual time=0.089..0.234 rows=5 loops=1)
--               Index Cond: (location && ST_Expand(ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography, 150))
--               Filter: ((validation_status <> 'DUPLICATE') AND (created_at > (CURRENT_TIMESTAMP - ('24'::double precision * '01:00:00'::interval))) AND (category_id = 1) AND ST_DWithin(location, ST_SetSRID(ST_MakePoint(-74.006, 40.7128), 4326)::geography, 150))
--         ->  Index Scan using categories_pkey on categories cat  (cost=0.13..0.15 rows=1 width=XXX) (actual time=0.043..0.044 rows=1 loops=5)
--               Index Cond: (id = c.category_id)
-- Planning Time: 0.234 ms
-- Execution Time: 0.567 ms