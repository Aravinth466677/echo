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
  
  // Log specific error types for better debugging
  if (err.code === 'ECONNREFUSED') {
    console.error('🔧 Database connection refused. Check if PostgreSQL is running and accessible.');
  } else if (err.code === 'ENOTFOUND') {
    console.error('🔧 Database host not found. Check your DATABASE_URL.');
  } else if (err.code === '28P01') {
    console.error('🔧 Authentication failed. Check database credentials.');
  }
});

module.exports = pool;