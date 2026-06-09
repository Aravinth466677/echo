const { Pool } = require('pg');

let pool;
let isConfigured = false;
let configurationError = null;

try {
  // Determine database configuration based on environment
  const dbConfig = process.env.DATABASE_URL 
    ? {
        // Production: Use connection string (Render, Railway, Heroku, etc.)
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? {
          rejectUnauthorized: false // Required for most cloud databases
        } : false,
        // Connection pool settings for production
        max: 20, // Maximum pool size
        idleTimeoutMillis: 30000, // 30 seconds
        connectionTimeoutMillis: 10000, // 10 seconds
      }
    : {
        // Development: Use individual connection parameters
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'echo_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? {
          rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
        } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      };

  console.log('🔧 Database configuration:', {
    host: dbConfig.host || 'connection string',
    database: dbConfig.database || 'from connection string',
    ssl: !!dbConfig.ssl,
    environment: process.env.NODE_ENV || 'development'
  });

  pool = new Pool(dbConfig);
  isConfigured = true;

  // Connection event handlers
  pool.on('connect', (client) => {
    console.log('✅ New database client connected');
  });

  pool.on('error', (err, client) => {
    console.error('❌ Database pool error:', err.message);
    
    // Log specific error types for better debugging
    if (err.code === 'ECONNREFUSED') {
      console.error('🔧 Database connection refused. Check if PostgreSQL is running and accessible.');
    } else if (err.code === 'ENOTFOUND') {
      console.error('🔧 Database host not found. Check your DATABASE_URL or DB_HOST.');
    } else if (err.code === '28P01') {
      console.error('🔧 Authentication failed. Check database username/password.');
    } else if (err.code === '3D000') {
      console.error('🔧 Database does not exist. Create the database first.');
    }
  });

  pool.on('acquire', (client) => {
    // Uncomment for detailed connection debugging
    // console.log('Database client acquired from pool');
  });

  pool.on('release', (err, client) => {
    if (err) {
      console.error('❌ Error releasing database client:', err.message);
    }
    // Uncomment for detailed connection debugging
    // console.log('Database client released back to pool');
  });

} catch (error) {
  console.error('❌ Database configuration error:', error.message);
  configurationError = `Database setup failed: ${error.message}`;
  isConfigured = false;
}

// Helper function to test database connection
const testConnection = async () => {
  if (!isConfigured) {
    throw new Error('Database not configured');
  }

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as postgres_version');
    client.release();
    
    console.log('✅ Database connection test successful');
    console.log('📊 PostgreSQL version:', result.rows[0].postgres_version.split(' ')[0]);
    
    return {
      success: true,
      timestamp: result.rows[0].current_time,
      version: result.rows[0].postgres_version
    };
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    throw error;
  }
};

// Helper function to get database stats
const getDatabaseStats = async () => {
  if (!isConfigured) {
    return null;
  }

  try {
    const result = await pool.query(`
      SELECT 
        pg_database_size(current_database()) as db_size,
        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
        current_database() as db_name
    `);
    
    return {
      size: result.rows[0].db_size,
      activeConnections: result.rows[0].active_connections,
      name: result.rows[0].db_name,
      poolStats: {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      }
    };
  } catch (error) {
    console.error('Error getting database stats:', error.message);
    return null;
  }
};

// Graceful shutdown
const closePool = async () => {
  if (pool && isConfigured) {
    try {
      await pool.end();
      console.log('✅ Database pool closed gracefully');
    } catch (error) {
      console.error('❌ Error closing database pool:', error.message);
    }
  }
};

// Export pool and utilities
module.exports = {
  query: (text, params) => {
    if (!isConfigured) {
      throw new Error(configurationError || 'Database not configured');
    }
    return pool.query(text, params);
  },
  connect: () => {
    if (!isConfigured) {
      throw new Error(configurationError || 'Database not configured');
    }
    return pool.connect();
  },
  pool,
  isConfigured,
  configurationError,
  testConnection,
  getDatabaseStats,
  closePool
};