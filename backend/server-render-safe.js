const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Load environment variables with error handling
try {
  require('dotenv').config();
} catch (error) {
  console.log('No .env file found, using environment variables');
}

const app = express();

// Validate critical environment variables
const validateEnvironment = () => {
  const errors = [];
  
  if (!process.env.JWT_SECRET) {
    errors.push('JWT_SECRET is required');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long');
  }
  
  if (!process.env.DATABASE_URL && !process.env.DB_PASSWORD) {
    errors.push('DATABASE_URL or database credentials are required');
  }
  
  return errors;
};

// Check environment on startup
const envErrors = validateEnvironment();
if (envErrors.length > 0) {
  console.error('❌ Environment validation failed:');
  envErrors.forEach(error => console.error(`  - ${error}`));
  console.error('');
  console.error('🔧 Fix these environment variables in Render Dashboard:');
  console.error('  - JWT_SECRET: Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  console.error('  - DATABASE_URL: Use your Render PostgreSQL internal URL');
  
  // Don't exit completely - run with limited functionality
  console.log('⚠️ Running with limited functionality...');
}

// Safe route imports with error handling
let authRoutes, complaintRoutes, complaintHistoryRoutes, authorityRoutes;
let adminRoutes, analyticsRoutes, jurisdictionRoutes, jurisdictionDetectionRoutes;
let notificationRoutes, validationRoutes;

try {
  authRoutes = require('./routes/auth');
  complaintRoutes = require('./routes/complaints');
  complaintHistoryRoutes = require('./routes/complaintHistory');
  authorityRoutes = require('./routes/authority');
  adminRoutes = require('./routes/admin');
  analyticsRoutes = require('./routes/analytics');
  jurisdictionRoutes = require('./routes/jurisdictions');
  jurisdictionDetectionRoutes = require('./routes/jurisdictionDetection');
  notificationRoutes = require('./routes/notificationRoutes');
  validationRoutes = require('./routes/validation');
} catch (error) {
  console.error('❌ Error loading routes:', error.message);
  console.log('🔧 Check if all route files exist and have no syntax errors');
}

// Safe service imports
let startEscalationScheduler, slaMonitor, SLAService, pool;
try {
  const escalationService = require('./services/escalationService');
  startEscalationScheduler = escalationService.startEscalationScheduler;
  slaMonitor = require('./services/slaMonitor');
  SLAService = require('./services/slaService');
  pool = require('./config/database');
} catch (error) {
  console.error('❌ Error loading services:', error.message);
  console.log('⚠️ Database services disabled');
}

// Create uploads directory safely
const uploadsDir = path.join(__dirname, 'uploads');
try {
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory');
  }
} catch (error) {
  console.log('⚠️ Cannot create uploads directory (read-only filesystem)');
}

// Utility function
const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

// CORS configuration with fallbacks
const allowedOrigins = Array.from(
  new Set(
    [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://echo-ashy-chi.vercel.app',
      process.env.CLIENT_URL,
      process.env.CORS_ORIGIN,
      /^https:\/\/.*\.vercel\.app$/
    ]
      .filter(Boolean)
      .map(origin => typeof origin === 'string' ? trimTrailingSlash(origin) : origin)
  )
);

console.log('🌐 CORS origins configured:', allowedOrigins.filter(o => typeof o === 'string'));

// CORS middleware with error handling
app.use(cors({
  origin(origin, callback) {
    // Always allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = trimTrailingSlash(origin);
    
    // Check exact matches and patterns
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return allowed === normalizedOrigin;
      }
      if (allowed instanceof RegExp) {
        return allowed.test(normalizedOrigin);
      }
      return false;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      console.log(`⚠️ CORS blocked: ${origin}`);
      callback(null, false); // Don't throw error, just deny
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Basic middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (if uploads directory exists)
if (fs.existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir));
}

// Health check endpoints (always available)
app.get('/', (req, res) => {
  res.json({ 
    message: 'Echo Backend API',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasDatabase: !!(process.env.DATABASE_URL || process.env.DB_PASSWORD)
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    database: pool ? 'configured' : 'not configured',
    uploads: fs.existsSync(uploadsDir) ? 'available' : 'unavailable'
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    api: 'running',
    routes: {
      auth: !!authRoutes,
      complaints: !!complaintRoutes,
      authority: !!authorityRoutes,
      admin: !!adminRoutes
    }
  });
});

// Debug endpoint for environment issues
app.get('/api/debug/env', (req, res) => {
  res.json({
    nodeEnv: process.env.NODE_ENV,
    hasJwtSecret: !!process.env.JWT_SECRET,
    jwtSecretLength: process.env.JWT_SECRET ? process.env.JWT_SECRET.length : 0,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    hasDbPassword: !!process.env.DB_PASSWORD,
    clientUrl: process.env.CLIENT_URL,
    corsOrigin: process.env.CORS_ORIGIN,
    port: process.env.PORT,
    uploadsAvailable: fs.existsSync(uploadsDir)
  });
});

// API Routes (only if loaded successfully)
if (authRoutes) app.use('/api/auth', authRoutes);
if (complaintRoutes) app.use('/api/complaints', complaintRoutes);
if (complaintHistoryRoutes) app.use('/api/complaints', complaintHistoryRoutes);
if (authorityRoutes) app.use('/api/authority', authorityRoutes);
if (adminRoutes) app.use('/api/admin', adminRoutes);
if (analyticsRoutes) app.use('/api/analytics', analyticsRoutes);
if (jurisdictionRoutes) app.use('/api/jurisdictions', jurisdictionRoutes);
if (jurisdictionDetectionRoutes) app.use('/api/jurisdiction-detection', jurisdictionDetectionRoutes);
if (notificationRoutes) app.use('/api/notifications', notificationRoutes);
if (validationRoutes) app.use('/api/validation', validationRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err.message);
  console.error('Stack:', err.stack);
  
  // Handle specific error types
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  
  if (err.message && err.message.includes('JWT')) {
    return res.status(401).json({ error: 'Authentication error' });
  }

  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    availableEndpoints: ['/health', '/api/health', '/api/debug/env']
  });
});

const PORT = process.env.PORT || 10000;
const server = http.createServer(app);

// Enhanced error handling for server startup
server.on('error', (error) => {
  console.error('❌ Server error:', error.message);
  
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  }
  
  console.error('Server failed to start');
  process.exit(1);
});

// Initialize database services safely
const initializeDatabaseServices = async () => {
  if (!pool) {
    console.log('⚠️ Database not configured, skipping database services');
    return;
  }

  try {
    console.log('🔄 Testing database connection...');
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connected:', result.rows[0].current_time);
    
    if (SLAService && startEscalationScheduler && slaMonitor) {
      await SLAService.ensureDatabaseFunctions();
      startEscalationScheduler();
      slaMonitor.start();
      console.log('✅ SLA services started');
    }
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    console.error('🔧 Check DATABASE_URL and database connectivity');
  }
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('📡 SIGTERM received, shutting down...');
  server.close(() => {
    if (pool && pool.end) {
      pool.end(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

// Start server
const startServer = async () => {
  try {
    server.listen(PORT, '0.0.0.0', async () => {
      console.log('🚀 Echo backend started!');
      console.log(`📡 Port: ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health: http://localhost:${PORT}/health`);
      
      await initializeDatabaseServices();
      
      console.log('✅ Server initialization complete');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  console.error(error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

// Start the server
startServer();

module.exports = app;