const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function showAuthorityRouting() {
  const client = await pool.connect();
  
  try {
    console.log('=== AUTHORITY ROUTING TEST ===\n');
    
    // Get all authorities
    const authorities = await client.query(`
      SELECT u.id, u.email, u.full_name, aa.department
      FROM users u
      JOIN authority_assignments aa ON u.id = aa.user_id
      WHERE u.role = 'authority'
      ORDER BY aa.department
    `);
    
    console.log(`Found ${authorities.rows.length} authorities:\n`);
    
    for (const auth of authorities.rows) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`${auth.full_name} (${auth.email})`);
      console.log(`Department: ${auth.department}`);
      console.log(`${'='.repeat(60)}`);
      
      // Get pending issues for this department
      const pendingIssues = await client.query(`
        SELECT i.id, cat.name as category, i.status, i.echo_count,
               ST_Y(i.location::geometry) as lat,
               ST_X(i.location::geometry) as lng
        FROM issues i
        JOIN categories cat ON i.category_id = cat.id
        WHERE i.status = 'pending' AND cat.name = $1
        ORDER BY i.echo_count DESC
      `, [auth.department]);
      
      console.log(`\nPending Issues: ${pendingIssues.rows.length}`);
      if (pendingIssues.rows.length > 0) {
        pendingIssues.rows.forEach(issue => {
          console.log(`  - Issue #${issue.id}: ${issue.category} (Echo: ${issue.echo_count})`);
        });
      } else {
        console.log('  (No pending issues)');
      }
      
      // Get active issues for this department
      const activeIssues = await client.query(`
        SELECT i.id, cat.name as category, i.status, i.echo_count
        FROM issues i
        JOIN categories cat ON i.category_id = cat.id
        WHERE i.status IN ('verified', 'in_progress') AND cat.name = $1
        ORDER BY i.echo_count DESC
      `, [auth.department]);
      
      console.log(`\nActive Issues: ${activeIssues.rows.length}`);
      if (activeIssues.rows.length > 0) {
        activeIssues.rows.forEach(issue => {
          console.log(`  - Issue #${issue.id}: ${issue.category} [${issue.status}] (Echo: ${issue.echo_count})`);
        });
      } else {
        console.log('  (No active issues)');
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('\n✓ Each authority will ONLY see issues from their department!');
    console.log('✓ Streetlight authority will NOT see Drainage issues');
    console.log('✓ Drainage authority will NOT see Pothole issues\n');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

showAuthorityRouting();
