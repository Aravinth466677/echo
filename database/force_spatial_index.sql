-- Alternative query with explicit spatial index forcing
-- Use this if the reordered query still doesn't use spatial index

-- Option 1: Use a CTE to force spatial index first
WITH spatial_matches AS (
  SELECT c.id, c.user_id, c.created_at, c.description, c.validation_status,
         ST_Distance(c.location, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography) as distance_meters
  FROM complaints c
  WHERE ST_DWithin(
    c.location,
    ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
    $4
  )
)
SELECT sm.*, cat.name as category_name
FROM spatial_matches sm
JOIN categories cat ON sm.category_id = cat.id
WHERE sm.category_id = $1
  AND sm.created_at > CURRENT_TIMESTAMP - ($5 * INTERVAL '1 hour')
  AND sm.validation_status != 'DUPLICATE'
ORDER BY distance_meters ASC
LIMIT 10;

-- Option 2: Disable specific index temporarily (use with caution)
-- SET enable_indexscan = off;  -- Disable non-spatial indexes
-- <your query here>
-- SET enable_indexscan = on;   -- Re-enable

-- Option 3: Check if you need to update table statistics
-- ANALYZE complaints;