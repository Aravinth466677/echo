const loggedDb = require('./config/loggedDatabase');

async function testQueryLogging() {
  console.log('🧪 Testing Query Logging System\n');

  try {
    // Test 1: Simple non-spatial query
    console.log('Test 1: Simple SELECT query');
    await loggedDb.query('SELECT COUNT(*) as total FROM users WHERE role = $1', ['citizen']);

    // Test 2: Spatial query with ST_DWithin
    console.log('\nTest 2: Spatial query with ST_DWithin');
    await loggedDb.query(`
      SELECT c.id, c.description,
             ST_Distance(c.location::geography, ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography) as distance
      FROM complaints c
      WHERE ST_DWithin(
        c.location::geography,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
        $3
      )
      LIMIT 5
    `, [40.7128, -74.0060, 1000]);

    // Test 3: Complex spatial query with multiple functions
    console.log('\nTest 3: Complex spatial query');
    await loggedDb.query(`
      SELECT i.id, i.echo_count, i.status,
             ST_Y(i.location::geometry) as latitude,
             ST_X(i.location::geometry) as longitude
      FROM issues i
      JOIN categories cat ON i.category_id = cat.id
      WHERE ST_DWithin(
        i.location::geography,
        ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
        $3
      )
      AND i.status NOT IN ('rejected')
      ORDER BY i.echo_count DESC
      LIMIT 10
    `, [-74.0060, 40.7128, 5000]);

    // Test 4: Insert with spatial data
    console.log('\nTest 4: INSERT with spatial data');
    await loggedDb.query(`
      INSERT INTO test_locations (name, location, created_at)
      VALUES ($1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, CURRENT_TIMESTAMP)
      ON CONFLICT DO NOTHING
    `, ['Test Location', -74.0060, 40.7128]);

    // Test 5: Query that should be slow (simulate)
    console.log('\nTest 5: Potentially slow query');
    await loggedDb.query(`
      SELECT c.*, cat.name as category_name
      FROM complaints c
      JOIN categories cat ON c.category_id = cat.id
      WHERE c.created_at > CURRENT_TIMESTAMP - INTERVAL '30 days'
      ORDER BY c.created_at DESC
      LIMIT 100
    `);

    // Test 6: Error query (intentional)
    console.log('\nTest 6: Query with error (intentional)');
    try {
      await loggedDb.query('SELECT invalid_column FROM complaints WHERE ST_DWithin(location, ST_MakePoint($1, $2), 100)', [-74.0060, 40.7128]);
    } catch (error) {
      console.log('Expected error caught:', error.message);
    }

    // Test 7: Transaction with client
    console.log('\nTest 7: Transaction with client');
    const client = await loggedDb.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT 1 as test_transaction');
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    // Show statistics
    console.log('\n📊 Final Statistics:');
    loggedDb.logStatsSummary();

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run tests if called directly
if (require.main === module) {
  testQueryLogging()
    .then(() => {
      console.log('\n✅ Query logging tests completed!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Tests failed:', error);
      process.exit(1);
    });
}

module.exports = testQueryLogging;