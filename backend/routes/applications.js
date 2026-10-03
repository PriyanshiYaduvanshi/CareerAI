// routes/applications.js
const express = require('express');
const {
  getApplications, deleteApplication,
  applyToJob, checkApplied, uploadResume,
} = require('../controllers/applicationsController');
const { protect } = require('../middleware/auth');
const router = express.Router();
router.use(protect);

// Apply Job flow — must come before '/:id' style routes to avoid collisions.
router.get('/check/:jobId', checkApplied);
router.post('/apply/:jobId', uploadResume, applyToJob);

router.get('/', getApplications);
router.delete('/:id', deleteApplication);
module.exports = router;
