// routes/businessSettings.js
const express = require('express');
const { body } = require('express-validator');
const { getNotificationPrefs, updateNotificationPrefs } = require('../controllers/businessSettingsController');
const { protect, requireBusiness } = require('../middleware/auth');

const router = express.Router();

// Every route below requires a logged-in business (company) account.
router.use(protect, requireBusiness);

const prefValidators = [
  body('newApplicants').optional().isBoolean().withMessage('newApplicants must be true or false'),
  body('jobApproved').optional().isBoolean().withMessage('jobApproved must be true or false'),
  body('weeklyReport').optional().isBoolean().withMessage('weeklyReport must be true or false'),
];

router.get('/notifications', getNotificationPrefs);
router.put('/notifications', prefValidators, updateNotificationPrefs);

module.exports = router;
