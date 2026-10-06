// routes/businessAnalytics.js
const express = require('express');
const { getDashboardAnalytics } = require('../controllers/businessAnalyticsController');
const { protect, requireBusiness } = require('../middleware/auth');

const router = express.Router();

// Every route below requires a logged-in business (company) account.
router.use(protect, requireBusiness);

router.get('/dashboard', getDashboardAnalytics);

module.exports = router;
