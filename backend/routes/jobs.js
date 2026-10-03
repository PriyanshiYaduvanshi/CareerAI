// routes/jobs.js
const express = require('express');
const { getJobs, getJob, getRecommendedJobs, toggleSaveJob, seedJobs, semanticSearchJobs } = require('../controllers/jobsController');
const { protect } = require('../middleware/auth');
const { cacheGet } = require('../middleware/apiCache');
const router = express.Router();

router.use(protect);
// getJobs' response depends only on the query string (isActive/search/
// location/experience/type filters), never on which user is asking, so a
// short cache collapses repeated identical listing requests without ever
// risking one user's response leaking to another. 15s keeps this well
// under "a newly posted job feels missing".
router.get('/', cacheGet(15 * 1000), getJobs);
router.get('/recommended', getRecommendedJobs);
// Must be registered before '/:id' so 'semantic-search' isn't matched as a job id.
router.get('/semantic-search', semanticSearchJobs);
router.get('/:id', getJob);
router.post('/:id/save', toggleSaveJob);
router.post('/seed', seedJobs); // dev only

module.exports = router;
