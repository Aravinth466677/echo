const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getAnalytics,
  createAuthority,
  getAuthorities,
  getSLABreaches
} = require('../controllers/adminController');

router.get('/analytics', authenticate, authorize('admin'), getAnalytics);
router.post('/authorities', authenticate, authorize('admin'), createAuthority);
router.get('/authorities', authenticate, authorize('admin'), getAuthorities);
router.get('/sla-breaches', authenticate, authorize('admin'), getSLABreaches);

module.exports = router;
