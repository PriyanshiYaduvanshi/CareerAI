// routes/ai.js
const express = require('express');
const { skillGapAnalysis, marketTrends, getLiveMarketData, learningRoadmap, searchLearningResources } = require('../controllers/aiController');
const { protect } = require('../middleware/auth');
const router = express.Router();
router.use(protect);
router.post('/skill-gap', skillGapAnalysis);
router.post('/market-trends', marketTrends);
router.get('/market-trends/live', getLiveMarketData);
router.post('/learning-roadmap', learningRoadmap);
router.post('/learning-resources/search', searchLearningResources);
module.exports = router;
