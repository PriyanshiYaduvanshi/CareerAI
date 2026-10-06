// controllers/businessProfileController.js
// Company Profile — the info a business shows to candidates on its job
// postings. Lives on the company's own User document (role === 'company'),
// scoped under `companyProfile`. Requires `protect` + `requireBusiness`
// (see routes/businessProfile.js).
const { validationResult } = require('express-validator');
const User = require('../models/User');

// @desc    Get the logged-in company's profile
// @route   GET /api/business/profile
const getCompanyProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('name companyName companyProfile');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({
      success: true,
      profile: {
        name: user.companyName || user.name || '',
        industry: user.companyProfile?.industry || '',
        size: user.companyProfile?.size || '',
        founded: user.companyProfile?.founded ?? '',
        location: user.companyProfile?.location || '',
        website: user.companyProfile?.website || '',
        about: user.companyProfile?.about || '',
        logo: user.companyProfile?.logo || '',
      },
    });
  } catch (error) { next(error); }
};

// @desc    Update the logged-in company's profile
// @route   PUT /api/business/profile
const updateCompanyProfile = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, industry, size, founded, location, website, about, logo } = req.body;

    const update = {
      companyProfile: {
        industry: industry ?? '',
        size: size ?? '',
        founded: founded === '' || founded === undefined || founded === null ? null : Number(founded),
        location: location ?? '',
        website: website ?? '',
        about: about ?? '',
        logo: logo ?? '',
      },
    };
    // `companyName` is the display name used app-wide (sidebar, navbar, etc.),
    // so keep it in sync with the profile form's "Company Name" field.
    if (name !== undefined) update.companyName = name;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      update,
      { new: true, runValidators: true }
    ).select('name companyName companyProfile');

    res.json({
      success: true,
      profile: {
        name: user.companyName || user.name || '',
        industry: user.companyProfile?.industry || '',
        size: user.companyProfile?.size || '',
        founded: user.companyProfile?.founded ?? '',
        location: user.companyProfile?.location || '',
        website: user.companyProfile?.website || '',
        about: user.companyProfile?.about || '',
        logo: user.companyProfile?.logo || '',
      },
    });
  } catch (error) { next(error); }
};

module.exports = { getCompanyProfile, updateCompanyProfile };
