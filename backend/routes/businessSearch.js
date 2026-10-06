// routes/businessSearch.js
const express = require('express');
const { businessGlobalSearch } = require('../controllers/businessSearchController');
const { protect, requireBusiness } = require('../middleware/auth');

const router = express.Router();

router.use(protect, requireBusiness);
router.get('/', businessGlobalSearch);

module.exports = router;
