require("dotenv").config();

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Connection event handlers for debugging
pool.on('connect', () => {
  console.log('✅ Database client connected');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err.message);
});

module.exports = pool;