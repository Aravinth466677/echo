-- Optimize Filter Step Performance
-- Create more selective indexes to reduce rows processed in FILTER stage

-- 1. Replace existing spatial index with more selective one
DROP INDEX IF EXISTS idx_complaints_spatial_active;
DROP INDEX IF EXISTS idx_complaints_spatial_filtered;

CREATE INDEX idx_complaints_spatial_optimized
ON complaints
USING GIST (location)
WHERE validation_status != 'DUPLICATE'
  AND category_id IS NOT NULL;

-- 2. Add partial BTREE index for filter support
CREATE INDEX idx_complaints_filter_partial
ON complaints (category_id, created_at)
WHERE validation_status != 'DUPLICATE';

-- 3. Update table statistics
ANALYZE complaints;

-- 4. Verify new indexes
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'complaints' 
AND indexname IN ('idx_complaints_spatial_optimized', 'idx_complaints_filter_partial');