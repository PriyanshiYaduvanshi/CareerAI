// routes/businessApplicants.js
const express = require('express');
const {
  getApplicants, getApplicantById, getApplicantResume, analyzeApplicantResume,
  updateApplicantStatus, getApplicantStatusCounts,
} = require('../controllers/businessApplicantsController');
const { sendApplicantEmail, getApplicantEmailHistory } = require('../controllers/emailController');
const { protect, requireBusiness } = require('../middleware/auth');

const router = express.Router();

// Every route below requires a logged-in business (company) account.
router.use(protect, requireBusiness);

// NOTE: placed above '/:id' so "stats" isn't swallowed by the :id param route.
router.get('/stats/summary', getApplicantStatusCounts);

router.get('/', getApplicants);
router.get('/:id', getApplicantById);
router.get('/:id/resume', getApplicantResume);
router.post('/:id/analyze-resume', analyzeApplicantResume);
router.patch('/:id/status', updateApplicantStatus);

// Email module: send Shortlisted / Interview Invitation / Rejected / Custom
// emails to an applicant, and view the email history for one applicant.
router.post('/:id/send-email', sendApplicantEmail);
router.get('/:id/emails', getApplicantEmailHistory);

module.exports = router;
