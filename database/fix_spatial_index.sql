-- Diagnostic and Fix Script
-- Check current indexes and force spatial optimization

-- 1. Check what indexes currently exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'complaints'
ORDER BY indexname;

-- 2. Check table structure
\d complaints

-- 3. Force drop the problematic index (it still exists!)
DROP INDEX IF EXISTS idx_complaints_created_at CASCADE;

-- 4. Recreate the spatial index with proper settings
DROP INDEX IF EXISTS idx_complaints_spatial_active;
CREATE INDEX idx_complaints_spatial_active
ON complaints
USING GIST (location)
WHERE validation_status != 'DUPLICATE';

-- 5. Update statistics
ANALYZE complaints;

-- 6. Test with query hints to force spatial index
SET enable_indexscan = off;  -- Disable BTREE indexes temporarily
SET enable_bitmapscan = off;

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

-- 7. Reset settings
SET enable_indexscan = on;
SET enable_bitmapscan = on;