-- Final Spatial Index Optimization
-- Remove conflicting indexes and force spatial index usage

-- 1. Drop the problematic BTREE indexes that override spatial planning
DROP INDEX IF EXISTS idx_complaints_created_at;
DROP INDEX IF EXISTS idx_complaints_category_created;

-- 2. Keep only the spatial indexes we need
-- idx_complaints_spatial_filtered already exists and is good

-- 3. Create a minimal supporting index for category filtering only
CREATE INDEX idx_complaints_category_only
ON complaints (category_id);

-- 4. Update statistics
ANALYZE complaints;

-- 5. Test the optimized query (with indexes enabled)
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