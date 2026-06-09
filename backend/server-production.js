const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import routes
const authRoutes = require('./routes/auth');
const complaintRoutes = require('./routes/complaints');
const complaintHistoryRoutes = require('./routes/complaintHistory');
const authorityRoutes = require('./routes/authority');
const adminRoutes = require('./routes/admin');
const analyticsRoutes = require('./routes/analytics');
const jurisdictionRoutes = require('./routes/jurisdictions');
const jurisdictionDetectionRoutes = require('./routes/jurisdictionDetection');
const notificationRoutes = require('./routes/notificationRoutes');
const validationRoutes = require('./routes/validation');

// Import services
const { startEscalationScheduler } = require('./services/escalationService');
const slaMonitor = require('./services/slaMonitor');
const SLAService = require('./services/slaService');
const pool = require('./config/database');

const app = express();

// Create uploads directory if it doesn't exist (for local/compatible deployments)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('✅ Created uploads directory');
  } catch (error) {
    console.log('⚠️ Cannot create uploads directory (may be read-only filesystem)');
  }
}

// Utility function
const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

// CORS configuration with better error handling
const allowedOrigins = Array.from(
  new Set(
    [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://echo-ashy-chi.vercel.app',
      process.env.CLIENT_URL,
      process.env.CORS_ORIGIN
    ]
      .filter(Boolean)
      .map(trimTrailingSlash)
  )
);

console.log('🌐 Allowed CORS origins:', allowedOrigins);

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman, etc.)
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = trimTrailingSlash(origin);
    if (allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    console.log(`❌ CORS blocked for origin: ${origin}`);
    callback(null, false); // Don't throw error, just deny
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Basic middleware with better limits for production
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files - ensure uploads directory exists before serving
if (fs.existsSync(uploadsDir)) {
  app.use('/uploads', express.static(uploadsDir));
}

// Root endpoint with environment info
app.get('/', (req, res) => {
  res.json({ 
    message: 'Echo Civic Complaint Management API',
    status: 'running',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Health check endpoints
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    database: pool ? 'connected' : 'disconnected',
    uploads: fs.existsSync(uploadsDir) ? 'available' : 'unavailable'
  });
});

// Debug endpoint for deployment troubleshooting (remove in production)
if (process.env.NODE_ENV !== 'production') {
  app.get('/api/debug/config', (req, res) => {
    res.json({
      environment: process.env.NODE_ENV,
      hasJwtSecret: !!process.env.JWT_SECRET,
      hasDatabaseUrl: !!process.env.DATABASE_URL,
      clientUrl: process.env.CLIENT_URL,
      uploadsAvailable: fs.existsSync(uploadsDir),
      corsOrigins: allowedOrigins
    });
  });
}

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/complaints', complaintRoutes);
app.use('/api/complaints', complaintHistoryRoutes);
app.use('/api/authority', authorityRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/jurisdictions', jurisdictionRoutes);
app.use('/api/jurisdiction-detection', jurisdictionDetectionRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/validation', validationRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  
  // Handle specific error types
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File too large' });
  }
  
  if (err.message && err.message.includes('CORS')) {
    return res.status(403).json({ error: 'CORS policy violation' });
  }

  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler for unknown routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method
  });
});

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Enhanced server error handling
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`);
    console.error('Another process might be running. Stop it or use a different port.');
    process.exit(1);
  }
  
  console.error('❌ Server startup error:', error);
  process.exit(1);
});

// Initialize database services with better error handling
const initializeDatabaseServices = async () => {
  try {
    console.log('🔄 Testing database connection...');
    
    // Test database connection
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ Database connected successfully at:', result.rows[0].current_time);
    
    // Initialize SLA services only if database is working
    console.log('🔄 Initializing SLA services...');
    await SLAService.ensureDatabaseFunctions();
    
    startEscalationScheduler();
    slaMonitor.start();
    
    console.log('✅ SLA monitoring system started');
  } catch (error) {
    console.error('❌ Database/SLA initialization error:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('🔧 Fix: Check your DATABASE_URL environment variable');
    } else if (error.code === 'ENOTFOUND') {
      console.error('🔧 Fix: Database host not found. Check connection string');
    } else if (error.code === '28P01') {
      console.error('🔧 Fix: Authentication failed. Check database credentials');
    }
    
    // Don't exit - let the API run without database-dependent features
    console.log('⚠️ API will run with limited functionality');
  }
};

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('📡 SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('✅ Server closed');
    if (pool) {
      pool.end(() => {
        console.log('✅ Database pool closed');
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

// Start server
const startServer = async () => {
  server.listen(PORT, '0.0.0.0', async () => {
    console.log('🚀 Echo backend started successfully!');
    console.log(`📡 Server running on port ${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
    
    // Initialize database services after server starts
    await initializeDatabaseServices();
  });
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;