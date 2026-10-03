// routes/resume.js
const express = require('express');
const { upload, analyzeResume } = require('../controllers/resumeController');
const { protect } = require('../middleware/auth');
const router = express.Router();
router.use(protect);
router.post('/analyze', upload.single('resume'), analyzeResume);
module.exports = router;
