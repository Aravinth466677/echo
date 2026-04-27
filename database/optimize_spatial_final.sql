-- PostgreSQL Spatial Query Optimization
-- Remove conflicting indexes and create optimized spatial indexes

-- 1. Remove dominating BTREE index that overrides spatial planning
DROP INDEX IF EXISTS idx_complaints_created_at;

-- 2. Remove previous partial index if exists
DROP INDEX IF EXISTS idx_complaints_spatial_filtered;

-- 3. Remove previous composite index if exists  
DROP INDEX IF EXISTS idx_complaints_category_created;

-- 4. Create optimized partial spatial index
CREATE INDEX idx_complaints_spatial_active
ON complaints
USING GIST (location)
WHERE validation_status != 'DUPLICATE';

-- 5. Create supporting BTREE index for filtering
CREATE INDEX idx_complaints_category_time
ON complaints (category_id, created_at);

-- 6. Verify the new indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'complaints' 
AND indexname IN ('idx_complaints_spatial_active', 'idx_complaints_category_time');

-- 7. Update table statistics
ANALYZE complaints;