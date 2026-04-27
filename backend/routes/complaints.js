const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { authenticate, authorize } = require('../middleware/auth');
const { rateLimitComplaint } = require('../middleware/rateLimiter');
const {
  submitComplaint,
  getMyComplaints,
  getComplaintRoutingHistory,
  getAreaIssues,
  getCategories,
  validateRemoteReport,
  getJustificationOptions,
  getUserReportingStats,
  getComplaintDetails,
  getComplaintContact,
  getIssueDetails,
  getIssueContacts,
  getAuthorityIssues
} = require('../controllers/complaintController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
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

router.get('/categories', getCategories);
router.post('/submit', authenticate, authorize('citizen'), rateLimitComplaint, upload.single('evidence'), submitComplaint);
router.get('/my-complaints', authenticate, authorize('citizen'), getMyComplaints);
router.get('/routing-history/:complaintId', authenticate, authorize('citizen'), getComplaintRoutingHistory);
router.get('/area-issues', authenticate, getAreaIssues);
router.post('/validate-remote', authenticate, authorize('citizen'), validateRemoteReport);
router.get('/justification-options', authenticate, authorize('citizen'), getJustificationOptions);
router.get('/reporting-stats', authenticate, authorize('citizen'), getUserReportingStats);

// Authority/Admin only routes for contact information
router.get('/:id/details', authenticate, authorize(['authority', 'admin']), getComplaintDetails);
router.get('/:id/contact', authenticate, authorize(['authority', 'admin']), getComplaintContact);

// Merged complaints routes for authorities
router.get('/issues/:issueId/details', authenticate, authorize(['authority', 'admin']), getIssueDetails);
router.get('/issues/:issueId/contacts', authenticate, authorize(['authority', 'admin']), getIssueContacts);
router.get('/authority/issues', authenticate, authorize(['authority', 'admin']), getAuthorityIssues);

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  } else if (error) {
    return res.status(400).json({ error: error.message });
  }
  next();
});

module.exports = router;
