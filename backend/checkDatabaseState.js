const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function checkDatabaseState() {
  const client = await pool.connect();
  
  try {
    console.log('=== ECHO DATABASE STATE ===\n');
    
    // Check categories
    console.log('1. CATEGORIES:');
    const categories = await client.query('SELECT * FROM categories ORDER BY id');
    console.log(`   Total: ${categories.rows.length}`);
    categories.rows.forEach(cat => {
      console.log(`   - ID ${cat.id}: ${cat.name} (Radius: ${cat.aggregation_radius_meters}m, Time: ${cat.aggregation_time_window_hours}h)`);
    });
    
    // Check for duplicates
    const duplicates = await client.query(`
      SELECT name, COUNT(*) as count 
      FROM categories 
      GROUP BY name 
      HAVING COUNT(*) > 1
    `);
    if (duplicates.rows.length > 0) {
      console.log('\n   ⚠️  DUPLICATES FOUND:');
      duplicates.rows.forEach(dup => {
        console.log(`   - "${dup.name}" appears ${dup.count} times`);
      });
    }
    
    // Check users
    console.log('\n2. USERS:');
    const users = await client.query('SELECT id, email, role, full_name, ward_id FROM users ORDER BY role, id');
    console.log(`   Total: ${users.rows.length}`);
    users.rows.forEach(user => {
      console.log(`   - ${user.role.toUpperCase()}: ${user.full_name} (${user.email}) [Ward: ${user.ward_id || 'N/A'}]`);
    });
    
    // Check authorities specifically
    const authorities = await client.query(`
      SELECT u.id, u.email, u.full_name, u.ward_id, aa.department
      FROM users u
      LEFT JOIN authority_assignments aa ON u.id = aa.user_id
      WHERE u.role = 'authority'
    `);
    if (authorities.rows.length > 0) {
      console.log('\n3. AUTHORITY DETAILS:');
      authorities.rows.forEach(auth => {
        console.log(`   - ${auth.full_name}`);
        console.log(`     Email: ${auth.email}`);
        console.log(`     Ward: ${auth.ward_id || 'Not assigned'}`);
        console.log(`     Department: ${auth.department || 'Not assigned'}`);
      });
    }
    
    // Check issues
    console.log('\n4. ISSUES:');
    const issues = await client.query(`
      SELECT i.id, c.name as category, i.status, i.echo_count, i.ward_id,
             ST_Y(i.location::geometry) as lat, ST_X(i.location::geometry) as lng
      FROM issues i
      JOIN categories c ON i.category_id = c.id
      ORDER BY i.created_at DESC
    `);
    console.log(`   Total: ${issues.rows.length}`);
    if (issues.rows.length > 0) {
      issues.rows.forEach(issue => {
        console.log(`   - Issue #${issue.id}: ${issue.category} [${issue.status}] Echo: ${issue.echo_count} Ward: ${issue.ward_id || 'N/A'}`);
        console.log(`     Location: ${issue.lat.toFixed(6)}, ${issue.lng.toFixed(6)}`);
      });
    }
    
    // Check complaints
    console.log('\n5. COMPLAINTS:');
    const complaints = await client.query(`
      SELECT co.id, u.full_name as user, ca.name as category, co.status, co.issue_id
      FROM complaints co
      JOIN users u ON co.user_id = u.id
      JOIN categories ca ON co.category_id = ca.id
      ORDER BY co.created_at DESC
    `);
    console.log(`   Total: ${complaints.rows.length}`);
    if (complaints.rows.length > 0) {
      complaints.rows.forEach(comp => {
        console.log(`   - Complaint #${comp.id}: ${comp.category} by ${comp.user} [${comp.status}] → Issue #${comp.issue_id}`);
      });
    }
    
    // Authority Dashboard Preview
    console.log('\n6. AUTHORITY DASHBOARD PREVIEW (Drainage Department):');
    const drainageCategory = await client.query(`SELECT id FROM categories WHERE name = 'Drainage' LIMIT 1`);
    
    if (drainageCategory.rows.length > 0) {
      const drainageIssues = await client.query(`
        SELECT i.id, i.status, i.echo_count, i.ward_id,
               ST_Y(i.location::geometry) as lat, ST_X(i.location::geometry) as lng,
               i.first_reported_at, i.last_reported_at,
               c.name as category
        FROM issues i
        JOIN categories c ON i.category_id = c.id
        WHERE i.category_id = $1
        ORDER BY i.status, i.first_reported_at DESC
      `, [drainageCategory.rows[0].id]);
      
      console.log(`   Drainage Issues: ${drainageIssues.rows.length}`);
      if (drainageIssues.rows.length > 0) {
        drainageIssues.rows.forEach(issue => {
          console.log(`   - Issue #${issue.id}: ${issue.status.toUpperCase()} | Echo: ${issue.echo_count} | Ward: ${issue.ward_id || 'N/A'}`);
          console.log(`     First: ${issue.first_reported_at.toLocaleString()}`);
          console.log(`     Last: ${issue.last_reported_at.toLocaleString()}`);
        });
      } else {
        console.log('   No drainage issues found yet.');
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

checkDatabaseState();
