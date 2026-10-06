// controllers/businessSearchController.js
// Powers the "Search candidates, jobs..." box in BusinessNavbar. Scoped
// entirely to the logged-in business's own job postings and applicants —
// mirrors the shape/limits of the candidate-side searchController.js.
const Job = require('../models/Job');
const Application = require('../models/Application');
const { safeContainsRegex } = require('../utils/regexHelpers');

// @desc    Search this business's own job postings and applicants
// @route   GET /api/business/search?q=...
const businessGlobalSearch = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, jobs: [], applicants: [] });
    if (q.length > 100) {
      return res.status(400).json({ success: false, message: 'Search query is too long' });
    }

    const regex = safeContainsRegex(q);

    const jobs = await Job.find({
      postedByUser: req.user._id,
      $or: [{ title: regex }, { requiredSkills: regex }, { location: regex }],
    })
      .select('title location status employmentType')
      .limit(6)
      .lean();

    // Scope candidate matches to applications on this business's own jobs.
    const myJobs = await Job.find({ postedByUser: req.user._id }).select('_id').lean();
    const myJobIds = myJobs.map((j) => j._id);

    let applicants = [];
    if (myJobIds.length > 0) {
      const rows = await Application.aggregate([
        { $match: { job: { $in: myJobIds } } },
        { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'candidate' } },
        { $unwind: '$candidate' },
        { $lookup: { from: 'jobs', localField: 'job', foreignField: '_id', as: 'jobInfo' } },
        { $unwind: '$jobInfo' },
        {
          $match: {
            $or: [
              { 'candidate.name': regex },
              { 'candidate.email': regex },
              { 'candidate.skills.name': regex },
            ],
          },
        },
        {
          $project: {
            status: 1,
            name: '$candidate.name',
            email: '$candidate.email',
            jobTitle: '$jobInfo.title',
          },
        },
        { $limit: 6 },
      ]);
      applicants = rows;
    }

    res.json({ success: true, jobs, applicants });
  } catch (error) { next(error); }
};

module.exports = { businessGlobalSearch };
