const loggedDb = require('../config/loggedDatabase');

async function testSpatialQuery() {
    console.log('=== Testing ST_DWithin Query with Logging ===\n');
    
    try {
        // Test ST_DWithin query - find complaints within 100m of a point
        const testLat = 10.656265;
        const testLng = 78.744675;
        const radiusMeters = 100;
        
        console.log(`Searching for complaints within ${radiusMeters}m of (${testLat}, ${testLng})\n`);
        
        const result = await loggedDb.query(`
            SELECT 
                c.complaint_id,
                c.description,
                ST_X(c.location) as longitude,
                ST_Y(c.location) as latitude,
                ST_Distance(
                    c.location::geography,
                    ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
                ) as distance_meters
            FROM complaints c
            WHERE ST_DWithin(
                c.location::geography,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
            ORDER BY distance_meters
            LIMIT 10
        `, [testLat, testLng, radiusMeters]);
        
        console.log(`\nQuery returned ${result.rows.length} results:`);
        result.rows.forEach((row, i) => {
            console.log(`${i+1}. Distance: ${Math.round(row.distance_meters)}m - ${row.description?.substring(0, 50)}...`);
        });
        
    } catch (error) {
        console.error('Query failed:', error.message);
    }
    
    // Show query statistics
    console.log('\n=== Query Statistics ===');
    const stats = loggedDb.getStatistics();
    console.log(`Total queries: ${stats.totalQueries}`);
    console.log(`Spatial queries: ${stats.spatialQueries}`);
    console.log(`Average execution time: ${stats.averageExecutionTime}ms`);
    
    process.exit(0);
}

testSpatialQuery();