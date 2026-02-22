const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getVerificationQueue,
  getIssueDetails,
  verifyIssue,
  updateIssueStatus,
  getActiveIssues
} = require('../controllers/authorityController');

router.get('/verification-queue', authenticate, authorize('authority'), getVerificationQueue);
router.get('/active-issues', authenticate, authorize('authority'), getActiveIssues);
router.get('/issue/:issueId', authenticate, authorize('authority'), getIssueDetails);
router.post('/issue/:issueId/verify', authenticate, authorize('authority'), verifyIssue);
router.post('/issue/:issueId/status', authenticate, authorize('authority'), updateIssueStatus);

module.exports = router;
