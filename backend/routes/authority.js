const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const {
  getVerificationQueue,
  getIssueDetails,
  verifyIssue,
  updateIssueStatus,
  getActiveIssues,
  updateComplaintStatus,
  manualEscalate,
  updateIssueLocation
} = require('../controllers/authorityController');

router.get('/verification-queue', authenticate, authorize('authority'), getVerificationQueue);
router.get('/active-issues', authenticate, authorize('authority'), getActiveIssues);
router.get('/issue/:issueId', authenticate, authorize('authority'), getIssueDetails);
router.post('/issue/:issueId/verify', authenticate, authorize('authority'), verifyIssue);
router.post('/issue/:issueId/status', authenticate, authorize('authority'), updateIssueStatus);
router.post('/issue/:issueId/location', authenticate, authorize('authority'), updateIssueLocation);
router.put('/complaints/:id/status', authenticate, authorize('authority'), updateComplaintStatus);
router.post('/complaints/:id/escalate', authenticate, authorize('authority'), manualEscalate);

module.exports = router;
