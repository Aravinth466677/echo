const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function checkAndInsertCategories() {
  try {
    // Check if categories exist
    const result = await pool.query('SELECT COUNT(*) FROM categories');
    const count = parseInt(result.rows[0].count);
    
    console.log(`Found ${count} categories in database`);
    
    if (count === 0) {
      console.log('Inserting default categories...');
      
      await pool.query(`
        INSERT INTO categories (name, description, aggregation_radius_meters, aggregation_time_window_hours, sla_hours) VALUES
        ('Pothole', 'Road damage and potholes', 50, 72, 168),
        ('Streetlight', 'Non-functional or damaged streetlights', 30, 48, 120),
        ('Garbage', 'Uncollected garbage or illegal dumping', 100, 24, 72),
        ('Water Supply', 'Water leakage or supply issues', 75, 48, 96),
        ('Drainage', 'Blocked drains or sewage issues', 80, 48, 120),
        ('Encroachment', 'Illegal construction or encroachment', 50, 168, 336)
      `);
      
      console.log('✓ Categories inserted successfully!');
    } else {
      console.log('✓ Categories already exist');
    }
    
    // Display all categories
    const categories = await pool.query('SELECT id, name, description FROM categories ORDER BY id');
    console.log('\nCategories in database:');
    categories.rows.forEach(cat => {
      console.log(`  ${cat.id}. ${cat.name} - ${cat.description}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAndInsertCategories();
