-- Spatial Query Performance Optimization
-- Add partial spatial index and composite btree index

-- 1. Partial GIST index to exclude DUPLICATE records
CREATE INDEX idx_complaints_spatial_filtered
ON complaints
USING GIST (location)
WHERE validation_status != 'DUPLICATE';

-- 2. Composite BTREE index for category and time filtering
CREATE INDEX idx_complaints_category_created
ON complaints (category_id, created_at);

-- 3. Verify indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'complaints' 
AND indexname IN ('idx_complaints_spatial_filtered', 'idx_complaints_category_created');