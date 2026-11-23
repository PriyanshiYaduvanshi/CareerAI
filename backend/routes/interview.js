// routes/interview.js
const express = require('express');
const { startInterview, submitAnswer, getInterviews } = require('../controllers/aiController');
const { protect } = require('../middleware/auth');
const router = express.Router();
router.use(protect);
router.get('/', getInterviews);
router.post('/start', startInterview);
router.post('/:id/answer', submitAnswer);
module.exports = router;
