const pool = require('../config/database');

async function testSpatialQuery() {
    console.log('=== ST_DWithin Query Test ===\n');
    
    try {
        const testLat = 10.656265;
        const testLng = 78.744675;
        const radiusMeters = 100;
        
        console.log(`Testing ST_DWithin query for location (${testLat}, ${testLng}) within ${radiusMeters}m\n`);
        
        // Measure execution time
        const startTime = Date.now();
        
        const result = await pool.query(`
            SELECT 
                c.id,
                c.description,
                c.longitude,
                c.latitude,
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
        
        const executionTime = Date.now() - startTime;
        
        console.log(`✅ Query executed successfully in ${executionTime}ms`);
        console.log(`📊 Found ${result.rows.length} complaints within ${radiusMeters}m\n`);
        
        // Show results
        if (result.rows.length > 0) {
            console.log('Results:');
            result.rows.forEach((row, i) => {
                console.log(`${i+1}. ID: ${row.id}, Distance: ${Math.round(row.distance_meters)}m`);
                console.log(`   Location: (${row.latitude}, ${row.longitude})`);
                console.log(`   Description: ${row.description?.substring(0, 60)}...`);
                console.log('');
            });
        } else {
            console.log('No complaints found in the specified radius.');
        }
        
        // Test EXPLAIN ANALYZE to check index usage
        console.log('=== Index Usage Analysis ===');
        const explainResult = await pool.query(`
            EXPLAIN ANALYZE
            SELECT id
            FROM complaints c
            WHERE ST_DWithin(
                c.location::geography,
                ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
                $3
            )
        `, [testLat, testLng, radiusMeters]);
        
        console.log('\nQuery Plan:');
        explainResult.rows.forEach(row => {
            console.log(row['QUERY PLAN']);
        });
        
        // Check for index usage
        const planText = explainResult.rows.map(r => r['QUERY PLAN']).join(' ');
        const indexUsed = /Index Scan|Bitmap Index Scan/i.test(planText);
        const spatialIndexUsed = /gist|spatial/i.test(planText);
        
        console.log('\n=== Index Analysis ===');
        console.log(`Index used: ${indexUsed ? '✅ YES' : '❌ NO'}`);
        console.log(`Spatial index used: ${spatialIndexUsed ? '✅ YES' : '❌ NO'}`);
        
        if (!indexUsed) {
            console.log('⚠️  Consider creating a spatial index on location column:');
            console.log('   CREATE INDEX idx_complaints_location_gist ON complaints USING GIST (location);');
        }
        
    } catch (error) {
        console.error('❌ Query failed:', error.message);
    }
    
    await pool.end();
}

testSpatialQuery();