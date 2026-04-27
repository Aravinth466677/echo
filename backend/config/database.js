const { Pool } = require('pg');
require('dotenv').config();

function parseOptionalBoolean(value) {
  if (value === undefined) {
    return null;
  }

  return value === 'true';
}

function getSslConfig() {
  const sslEnabled = parseOptionalBoolean(process.env.DB_SSL);
  const rejectUnauthorized = parseOptionalBoolean(process.env.DB_SSL_REJECT_UNAUTHORIZED);

  if (sslEnabled === false) {
    return false;
  }

  if (sslEnabled === true || (sslEnabled === null && process.env.NODE_ENV === 'production')) {
    return {
      rejectUnauthorized: rejectUnauthorized === true
    };
  }

  return undefined;
}

function getDatabaseConfig() {
  const connectionString =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_INTERNAL_URL;

  const ssl = getSslConfig();

  if (connectionString) {
    return {
      connectionString,
      ssl
    };
  }

  const hasDiscreteConfig = [
    process.env.DB_HOST,
    process.env.DB_PORT,
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD
  ].every(Boolean);

  if (!hasDiscreteConfig) {
    return null;
  }

  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl
  };
}

const databaseConfig = getDatabaseConfig();
const configurationError =
  'Database is not configured. Set DATABASE_URL (recommended for Render) or all DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD variables.';

const pool = databaseConfig
  ? new Pool(databaseConfig)
  : {
      isConfigured: false,
      on() {},
      async query() {
        throw new Error(configurationError);
      },
      async connect() {
        throw new Error(configurationError);
      }
    };

pool.isConfigured = Boolean(databaseConfig);
pool.configurationError = configurationError;

pool.on('connect', () => {
  console.log('Database connected');
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

module.exports = pool;
