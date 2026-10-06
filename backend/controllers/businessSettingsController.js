// controllers/businessSettingsController.js
// Notification preferences for a company account, edited from Business
// Dashboard → Settings. These are stored for potential future email/digest
// notification workflows (e.g. a "new applicant" email, a job-approval
// email, a scheduled weekly report) — none of them currently gate the
// in-app Notification bell, which under current policy only ever fires
// when a business selects a candidate for the next recruitment round (see
// notificationsController.notifyRoundAdvancement).
const { validationResult } = require('express-validator');
const User = require('../models/User');

const DEFAULT_PREFS = { newApplicants: true, jobApproved: true, weeklyReport: false };

// @desc    Get the logged-in company's notification preferences
// @route   GET /api/business/settings/notifications
const getNotificationPrefs = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('notificationPrefs');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, notificationPrefs: { ...DEFAULT_PREFS, ...(user.notificationPrefs?.toObject?.() || user.notificationPrefs || {}) } });
  } catch (error) { next(error); }
};

// @desc    Update the logged-in company's notification preferences
// @route   PUT /api/business/settings/notifications
const updateNotificationPrefs = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { newApplicants, jobApproved, weeklyReport } = req.body;
    const update = {};
    if (newApplicants !== undefined) update['notificationPrefs.newApplicants'] = newApplicants;
    if (jobApproved !== undefined) update['notificationPrefs.jobApproved'] = jobApproved;
    if (weeklyReport !== undefined) update['notificationPrefs.weeklyReport'] = weeklyReport;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: update },
      { new: true, runValidators: true }
    ).select('notificationPrefs');

    res.json({ success: true, notificationPrefs: { ...DEFAULT_PREFS, ...(user.notificationPrefs?.toObject?.() || user.notificationPrefs || {}) } });
  } catch (error) { next(error); }
};

module.exports = { getNotificationPrefs, updateNotificationPrefs };
