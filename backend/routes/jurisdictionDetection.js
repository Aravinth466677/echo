const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  detectJurisdiction,
  testCoordinates,
  getAllJurisdictions
} = require('../controllers/jurisdictionDetectionController');

// Detect jurisdiction from coordinates
router.post('/detect', authenticate, detectJurisdiction);

// Test multiple coordinates (admin/debug)
router.post('/test', authenticate, testCoordinates);

// Get all jurisdictions
router.get('/all', authenticate, getAllJurisdictions);

module.exports = router;