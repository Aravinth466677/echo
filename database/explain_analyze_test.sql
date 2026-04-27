-- EXPLAIN ANALYZE Query for Optimized Spatial Performance
-- Run this exact query to test the optimization

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

-- Replace the coordinates (-74.006, 40.7128) with actual test coordinates from your data
-- Replace category_id = 1 with an actual category ID that has data
-- Adjust the time window (24 hours) if needed to match your test data

-- What to look for in the output:
-- ✅ GOOD: "Index Scan using idx_complaints_spatial_filtered"
-- ✅ GOOD: "Order By: (location <-> ...)"
-- ✅ GOOD: No "Sort" node in execution plan
-- ❌ BAD: "Seq Scan" or "Index Scan using idx_complaints_created_at"