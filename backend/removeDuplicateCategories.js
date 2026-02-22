const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function removeDuplicateCategories() {
  const client = await pool.connect();
  
  try {
    console.log('Checking for duplicate categories...\n');
    
    // Find duplicate categories
    const duplicatesQuery = `
      SELECT name, COUNT(*) as count, ARRAY_AGG(id ORDER BY id) as ids
      FROM categories
      GROUP BY name
      HAVING COUNT(*) > 1
    `;
    
    const duplicates = await client.query(duplicatesQuery);
    
    if (duplicates.rows.length === 0) {
      console.log('No duplicate categories found.');
      return;
    }
    
    console.log(`Found ${duplicates.rows.length} duplicate category names:\n`);
    
    for (const dup of duplicates.rows) {
      console.log(`Category: "${dup.name}"`);
      console.log(`  Count: ${dup.count}`);
      console.log(`  IDs: ${dup.ids.join(', ')}`);
      console.log(`  Keeping ID: ${dup.ids[0]} (oldest)`);
      console.log(`  Removing IDs: ${dup.ids.slice(1).join(', ')}\n`);
    }
    
    await client.query('BEGIN');
    
    for (const dup of duplicates.rows) {
      const keepId = dup.ids[0];
      const removeIds = dup.ids.slice(1);
      
      // Update issues to point to the kept category
      await client.query(
        'UPDATE issues SET category_id = $1 WHERE category_id = ANY($2)',
        [keepId, removeIds]
      );
      
      // Update complaints to point to the kept category
      await client.query(
        'UPDATE complaints SET category_id = $1 WHERE category_id = ANY($2)',
        [keepId, removeIds]
      );
      
      // Delete duplicate categories
      await client.query(
        'DELETE FROM categories WHERE id = ANY($1)',
        [removeIds]
      );
      
      console.log(`✓ Merged duplicates for "${dup.name}" into ID ${keepId}`);
    }
    
    await client.query('COMMIT');
    
    console.log('\n✓ Successfully removed all duplicate categories!');
    
    // Show final categories
    const finalCategories = await client.query('SELECT id, name FROM categories ORDER BY id');
    console.log('\nFinal categories:');
    finalCategories.rows.forEach(cat => {
      console.log(`  ID ${cat.id}: ${cat.name}`);
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error removing duplicates:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

removeDuplicateCategories();
