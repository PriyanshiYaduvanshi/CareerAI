// routes/businessProfile.js
const express = require('express');
const { body } = require('express-validator');
const { getCompanyProfile, updateCompanyProfile } = require('../controllers/businessProfileController');
const { protect, requireBusiness } = require('../middleware/auth');

const router = express.Router();

// Every route below requires a logged-in business (company) account.
router.use(protect, requireBusiness);

const LOGO_DATA_URI_RE = /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/;
const MAX_LOGO_LENGTH = 3_000_000; // ~2.2MB decoded — matches businessJobs.js's job-logo cap

const profileValidators = [
  body('name').optional().trim().notEmpty().withMessage('Company name cannot be empty').isLength({ max: 150 }).withMessage('Company name is too long'),
  body('industry').optional().trim().isLength({ max: 100 }).withMessage('Industry is too long'),
  body('size').optional().trim().isLength({ max: 50 }).withMessage('Company size is too long'),
  body('founded').optional({ checkFalsy: true }).isInt({ min: 1800, max: new Date().getFullYear() }).withMessage('Founded year is invalid'),
  body('location').optional().trim().isLength({ max: 150 }).withMessage('Location is too long'),
  body('website').optional({ checkFalsy: true }).trim().isURL().withMessage('Website must be a valid URL'),
  body('about').optional().trim().isLength({ max: 2000 }).withMessage('About must be under 2000 characters'),
  body('logo').optional({ nullable: true }).custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    if (typeof value !== 'string' || !LOGO_DATA_URI_RE.test(value)) {
      throw new Error('Logo must be a valid PNG, JPG, WEBP, or SVG image');
    }
    if (value.length > MAX_LOGO_LENGTH) {
      throw new Error('Logo is too large (max ~2MB)');
    }
    return true;
  }),
];

router.get('/', getCompanyProfile);
router.put('/', profileValidators, updateCompanyProfile);

module.exports = router;
