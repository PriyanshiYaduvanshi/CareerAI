// controllers/searchController.js
const Job = require('../models/Job');
const Application = require('../models/Application');
const { safeContainsRegex } = require('../utils/regexHelpers');

// @desc    Global search across jobs and the user's own applications
// @route   GET /api/search?q=...
const globalSearch = async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, jobs: [], applications: [] });
    if (q.length > 100) {
      return res.status(400).json({ success: false, message: 'Search query is too long' });
    }

    const regex = safeContainsRegex(q);

    const jobs = await Job.find({
      isActive: true,
      $or: [{ title: regex }, { company: regex }, { requiredSkills: regex }],
    })
      .select('title company location type')
      .limit(6)
      .lean();

    const applications = await Application.find({
      user: req.user._id,
      $or: [{ jobTitle: regex }, { company: regex }],
    })
      .select('jobTitle company status')
      .limit(6)
      .lean();

    // Also match applications linked to a Job document by populating and filtering title/company
    const linkedApplications = await Application.find({ user: req.user._id, job: { $ne: null } })
      .populate({ path: 'job', select: 'title company', match: { $or: [{ title: regex }, { company: regex }] } })
      .select('job status')
      .limit(6)
      .lean();
    const populatedMatches = linkedApplications.filter(a => a.job);

    res.json({
      success: true,
      jobs,
      applications: [...applications, ...populatedMatches],
    });
  } catch (error) { next(error); }
};

module.exports = { globalSearch };
