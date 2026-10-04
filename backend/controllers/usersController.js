// controllers/usersController.js
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Application = require('../models/Application');

// @desc    Get user profile
// @route   GET /api/users/profile
const getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('savedJobs');
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
const updateProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const allowedFields = ['name', 'title', 'bio', 'location', 'phone', 'skills',
      'experience', 'education', 'targetJob', 'targetSalary', 'avatar'];
    const updates = {};
    allowedFields.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    // Check if profile is complete
    if (updates.skills && updates.skills.length > 0 && updates.targetJob) {
      updates.profileComplete = true;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ success: true, user });
  } catch (error) { next(error); }
};

// @desc    Get dashboard stats
// @route   GET /api/users/dashboard
const getDashboard = async (req, res, next) => {
  try {
    // req.user is already fetched (minus password) by the `protect`
    // middleware — re-querying it here was a redundant DB round trip.
    const user = req.user;

    // Run every count + the recent-applications lookup concurrently instead
    // of sequentially awaiting each one — five independent queries in
    // series was five round trips where one round trip (in parallel) does.
    const [applications, total, applied, interviews, offers] = await Promise.all([
      Application.find({ user: user._id }).populate('job').sort({ createdAt: -1 }).limit(5),
      Application.countDocuments({ user: user._id }),
      Application.countDocuments({ user: user._id, status: 'applied' }),
      Application.countDocuments({ user: user._id, status: 'interview' }),
      Application.countDocuments({ user: user._id, status: 'offer' }),
    ]);

    const appStats = { total, applied, interviews, offers };

    res.json({
      success: true,
      data: {
        user,
        applications,
        appStats,
        profileCompletion: calculateProfileCompletion(user),
      },
    });
  } catch (error) { next(error); }
};

const calculateProfileCompletion = (user) => {
  let score = 0;
  if (user.name) score += 15;
  if (user.title) score += 10;
  if (user.bio) score += 10;
  if (user.location) score += 5;
  if (user.skills?.length > 0) score += 20;
  if (user.experience?.length > 0) score += 20;
  if (user.education?.length > 0) score += 10;
  if (user.targetJob) score += 10;
  return score;
};

module.exports = { getProfile, updateProfile, getDashboard };
