const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
require('dotenv').config();

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
const { startEscalationScheduler } = require('./services/escalationService');
const slaMonitor = require('./services/slaMonitor');
const SLAService = require('./services/slaService');
const pool = require('./config/database');

const app = express();

const trimTrailingSlash = (value = '') => value.replace(/\/+$/, '');

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

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = trimTrailingSlash(origin);
    if (allowedOrigins.includes(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/test', express.static(path.join(__dirname, 'public')));

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Echo API is running' });
});

app.get('/api/health', (req, res) => {
  res.status(200).send('OK');
});

// Debug endpoint to check auth
app.get('/api/debug/whoami', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.json({ error: 'No token provided' });
  }
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ 
      message: 'Token is valid',
      decoded,
      isAdmin: decoded.role === 'admin'
    });
  } catch (error) {
    res.json({ error: 'Invalid token', details: error.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${PORT} is already in use. Another backend may already be running on http://localhost:${PORT}/health`
    );
    console.error(
      'Stop the existing process or start this server with a different PORT, for example: $env:PORT=5001; npm start'
    );
    process.exit(1);
  }

  console.error('Failed to start server:', error);
  process.exit(1);
});

const initializeDatabaseServices = async () => {
  if (!pool.isConfigured) {
    console.error(pool.configurationError);
    return;
  }

  try {
    await SLAService.ensureDatabaseFunctions();
    startEscalationScheduler();
    slaMonitor.start();
    console.log('SLA monitoring system started');
  } catch (error) {
    console.error('Failed to initialize database-dependent services:', error);

    if (error.code === 'ECONNREFUSED') {
      console.error(
        'PostgreSQL refused the connection. On Render, set DATABASE_URL to your Render Postgres connection string instead of relying on localhost.'
      );
    }
  }
};

const startServer = () => {
  server.listen(PORT, async () => {
    console.log(`Echo backend running on port ${PORT}`);
    await initializeDatabaseServices();
  });
};

startServer();
