const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function keepOnly4Categories() {
  const client = await pool.connect();
  
  try {
    console.log('Keeping only 4 categories...\n');
    
    // Categories to keep
    const keepCategories = ['Pothole', 'Streetlight', 'Garbage', 'Drainage'];
    
    // Get all categories
    const allCategories = await client.query('SELECT id, name FROM categories ORDER BY id');
    
    console.log(`Current categories: ${allCategories.rows.length}`);
    allCategories.rows.forEach(cat => {
      console.log(`  - ID ${cat.id}: ${cat.name}`);
    });
    
    // Find categories to delete
    const toDelete = allCategories.rows.filter(cat => !keepCategories.includes(cat.name));
    
    if (toDelete.length === 0) {
      console.log('\nAlready have only the desired categories!');
      return;
    }
    
    console.log(`\nDeleting ${toDelete.length} categories:`);
    toDelete.forEach(cat => {
      console.log(`  - ID ${cat.id}: ${cat.name}`);
    });
    
    await client.query('BEGIN');
    
    const deleteIds = toDelete.map(cat => cat.id);
    
    // Update issues to null for deleted categories
    await client.query(
      'UPDATE issues SET category_id = NULL WHERE category_id = ANY($1)',
      [deleteIds]
    );
    
    // Update complaints to null for deleted categories
    await client.query(
      'UPDATE complaints SET category_id = NULL WHERE category_id = ANY($1)',
      [deleteIds]
    );
    
    // Delete categories
    await client.query(
      'DELETE FROM categories WHERE id = ANY($1)',
      [deleteIds]
    );
    
    await client.query('COMMIT');
    
    console.log('\n✓ Successfully deleted categories!');
    
    // Show final categories
    const finalCategories = await client.query('SELECT id, name FROM categories ORDER BY id');
    console.log(`\nFinal categories: ${finalCategories.rows.length}`);
    finalCategories.rows.forEach(cat => {
      console.log(`  - ID ${cat.id}: ${cat.name}`);
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
  } finally {
    client.release();
    await pool.end();
  }
}

keepOnly4Categories();
