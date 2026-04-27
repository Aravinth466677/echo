const express = require('express');
const router = express.Router();
const AnalyticsController = require('../controllers/analyticsController');
const { authenticate, authorize } = require('../middleware/auth');

// Analytics routes - only for authorities and admins
router.get('/heatmap', 
  authenticate, 
  authorize('authority', 'admin'), 
  AnalyticsController.getHeatmapData
);

router.get('/summary', 
  authenticate, 
  authorize('authority', 'admin'), 
  AnalyticsController.getSummaryAnalytics
);

router.get('/categories', 
  authenticate, 
  authorize('authority', 'admin'), 
  AnalyticsController.getCategories
);

module.exports = router;