const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  createJurisdiction,
  getJurisdictions,
  deleteJurisdiction,
  testPoint
} = require('../controllers/jurisdictionController');

// Test point route (must come before /:id)
router.get('/test-point', authenticate, testPoint);

// Admin only routes
router.post('/', authenticate, authorize('admin'), createJurisdiction);
router.get('/', authenticate, getJurisdictions);
router.delete('/:id', authenticate, authorize('admin'), deleteJurisdiction);

module.exports = router;
