const express = require('express');
const multer = require('multer');
const path = require('path');

const { authenticate, authorize } = require('../middleware/auth');
const ValidationPipelineService = require('../services/validationPipelineService');
const ValidationUtils = require('../utils/validationUtils');
const pool = require('../config/database');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-validation-${Math.round(Math.random() * 1e9)}`;
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExtensions = /\.(jpg|jpeg|png|webp|heic|heif)$/i;
    const extname = allowedExtensions.test(path.extname(file.originalname).toLowerCase());
    const mimetype = file.mimetype?.startsWith('image/');

    if (mimetype && extname) {
      return cb(null, true);
    }

    cb(new Error('Only image uploads are allowed'));
  }
});

// Test validation without submitting complaint
router.post(
  '/test-validation',
  authenticate,
  authorize('citizen'),
  upload.single('evidence'),
  async (req, res) => {
    const {
      categoryId,
      latitude,
      longitude,
      reporterLatitude,
      reporterLongitude,
      gpsAccuracy
    } = req.body;

    const userId = req.user.id;
    const imagePath = path.join(__dirname, '..', req.file.path);

    try {
      const validationResults = await ValidationPipelineService.validateComplaint({
        imagePath,
        categoryId: parseInt(categoryId, 10),
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        reporterLatitude: reporterLatitude ? parseFloat(reporterLatitude) : null,
        reporterLongitude: reporterLongitude ? parseFloat(reporterLongitude) : null,
        userId,
        gpsAccuracy: gpsAccuracy ? parseFloat(gpsAccuracy) : null,
        isManualSelection: req.body.isManualSelection === 'true'
      });

      const response = ValidationUtils.formatValidationResponse(validationResults);
      const summary = ValidationUtils.generateValidationSummary(validationResults);

      res.json({
        ...response,
        summary,
        shouldFlagForReview: ValidationUtils.shouldFlagForReview(validationResults),
        statusColor: ValidationUtils.getValidationStatusColor(validationResults.overall.status),
        confidenceLevel: ValidationUtils.getConfidenceLevel(validationResults.overall.confidence),
        fullResults: validationResults
      });
    } catch (error) {
      console.error('Validation test error:', error);
      res.status(500).json({
        error: 'Validation test failed',
        details: error.message
      });
    }
  }
);

// Get validation statistics
router.get('/validation-stats', authenticate, authorize('admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        validation_status,
        location_confidence,
        COUNT(*) as count,
        COUNT(CASE WHEN created_at > CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as recent_count
      FROM complaints
      WHERE validation_status IS NOT NULL
      GROUP BY validation_status, location_confidence
      ORDER BY validation_status, location_confidence
    `);

    const duplicateStats = await pool.query(`
      SELECT
        COUNT(*) as total_duplicates,
        COUNT(DISTINCT duplicate_of) as unique_originals
      FROM complaints
      WHERE duplicate_of IS NOT NULL
    `);

    const imageHashStats = await pool.query(`
      SELECT
        COUNT(*) as total_hashes,
        COUNT(DISTINCT image_hash) as unique_hashes
      FROM image_hashes
    `);

    res.json({
      validationStats: result.rows,
      duplicateStats: duplicateStats.rows[0],
      imageHashStats: imageHashStats.rows[0]
    });
  } catch (error) {
    console.error('Validation stats error:', error);
    res.status(500).json({ error: 'Failed to fetch validation statistics' });
  }
});

// Get rate limit status for user
router.get('/rate-limit-status', authenticate, authorize('citizen'), async (req, res) => {
  const userId = req.user.id;
  const currentDate = new Date().toISOString().split('T')[0];

  try {
    const result = await pool.query(
      'SELECT * FROM user_rate_limits WHERE user_id = $1 AND submission_date = $2',
      [userId, currentDate]
    );

    const rateLimit = result.rows[0] || {
      hourly_count: 0,
      daily_count: 0,
      last_submission: null
    };

    const { RATE_LIMITS } = require('../middleware/rateLimiter');

    res.json({
      current: {
        hourly: rateLimit.hourly_count,
        daily: rateLimit.daily_count
      },
      limits: {
        hourly: RATE_LIMITS.HOURLY_LIMIT,
        daily: RATE_LIMITS.DAILY_LIMIT
      },
      remaining: {
        hourly: Math.max(0, RATE_LIMITS.HOURLY_LIMIT - rateLimit.hourly_count),
        daily: Math.max(0, RATE_LIMITS.DAILY_LIMIT - rateLimit.daily_count)
      },
      lastSubmission: rateLimit.last_submission
    });
  } catch (error) {
    console.error('Rate limit status error:', error);
    res.status(500).json({ error: 'Failed to fetch rate limit status' });
  }
});

module.exports = router;
