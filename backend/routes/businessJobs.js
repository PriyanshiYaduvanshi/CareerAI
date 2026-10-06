// routes/businessJobs.js
const express = require('express');
const { body, param } = require('express-validator');
const {
  createJob, getMyJobs, getMyJob, updateJob, deleteJob, closeJob, reopenJob,
} = require('../controllers/businessJobsController');
const { protect, requireBusiness } = require('../middleware/auth');

const router = express.Router();

// Every route below requires a logged-in business (company) account.
router.use(protect, requireBusiness);

const LOGO_DATA_URI_RE = /^data:image\/(png|jpe?g|webp|svg\+xml);base64,/;
// Rough cap so a base64 logo can't bloat the document — ~2.2MB decoded.
const MAX_LOGO_LENGTH = 3_000_000;

const validateLogo = (value) => {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || !LOGO_DATA_URI_RE.test(value)) {
    throw new Error('Company logo must be a valid PNG, JPG, WEBP, or SVG image');
  }
  if (value.length > MAX_LOGO_LENGTH) {
    throw new Error('Company logo is too large (max ~2MB)');
  }
  return true;
};

const arrayOfStrings = (field, label, { required = true } = {}) => {
  const chain = required
    ? body(field).exists({ checkFalsy: true }).withMessage(`${label} is required`).bail().isArray({ min: 1 }).withMessage(`${label} must have at least one entry`)
    : body(field).optional().isArray().withMessage(`${label} must be a list`);
  return chain;
};

// Shared field validators; `required` toggles strict vs partial (update) mode.
const jobFieldValidators = (required) => [
  required
    ? body('title').trim().notEmpty().withMessage('Job title is required').bail().isLength({ max: 150 })
    : body('title').optional().trim().notEmpty().withMessage('Job title cannot be empty').bail().isLength({ max: 150 }),

  required
    ? body('company').trim().notEmpty().withMessage('Company name is required').bail().isLength({ max: 150 })
    : body('company').optional().trim().notEmpty().withMessage('Company name cannot be empty').bail().isLength({ max: 150 }),

  required
    ? body('location').trim().notEmpty().withMessage('Location is required')
    : body('location').optional().trim().notEmpty().withMessage('Location cannot be empty'),

  required
    ? body('employmentType').isIn(['full-time', 'part-time', 'contract', 'internship', 'temporary']).withMessage('Invalid employment type')
    : body('employmentType').optional().isIn(['full-time', 'part-time', 'contract', 'internship', 'temporary']).withMessage('Invalid employment type'),

  required
    ? body('workMode').isIn(['remote', 'hybrid', 'onsite']).withMessage('Work mode must be Remote, Hybrid, or Onsite')
    : body('workMode').optional().isIn(['remote', 'hybrid', 'onsite']).withMessage('Work mode must be Remote, Hybrid, or Onsite'),

  required
    ? body('experience').isIn(['entry', 'mid', 'senior', 'lead', 'executive']).withMessage('Invalid experience level')
    : body('experience').optional().isIn(['entry', 'mid', 'senior', 'lead', 'executive']).withMessage('Invalid experience level'),

  body('salaryMin').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Minimum salary must be a positive number'),
  body('salaryMax').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Maximum salary must be a positive number')
    .bail()
    .custom((value, { req }) => {
      const min = Number(req.body.salaryMin) || 0;
      if (Number(value) < min) throw new Error('Maximum salary cannot be less than minimum salary');
      return true;
    }),
  body('currency').optional().trim().isLength({ min: 3, max: 3 }).withMessage('Currency should be a 3-letter code, e.g. INR'),

  arrayOfStrings('requiredSkills', 'Skills required', { required }),
  arrayOfStrings('responsibilities', 'Responsibilities', { required }),
  arrayOfStrings('qualifications', 'Qualifications', { required }),
  body('benefits').optional().isArray().withMessage('Benefits must be a list'),

  required
    ? body('description').trim().notEmpty().withMessage('Job description is required').bail().isLength({ min: 30 }).withMessage('Description should be at least 30 characters')
    : body('description').optional().trim().notEmpty().withMessage('Job description cannot be empty').bail().isLength({ min: 30 }).withMessage('Description should be at least 30 characters'),

  required
    ? body('deadline').notEmpty().withMessage('Application deadline is required').bail().isISO8601().withMessage('Invalid deadline date')
      .bail().custom(value => {
        if (new Date(value) <= new Date()) throw new Error('Application deadline must be in the future');
        return true;
      })
    : body('deadline').optional().isISO8601().withMessage('Invalid deadline date')
      .bail().custom(value => {
        if (new Date(value) <= new Date()) throw new Error('Application deadline must be in the future');
        return true;
      }),

  required
    ? body('vacancies').isInt({ min: 1 }).withMessage('Vacancies must be at least 1')
    : body('vacancies').optional().isInt({ min: 1 }).withMessage('Vacancies must be at least 1'),

  body('companyLogo').optional({ nullable: true }).custom(validateLogo),
];

const idParamValidator = [param('id').isMongoId().withMessage('Invalid job id')];

router.post('/', jobFieldValidators(true), createJob);
router.get('/', getMyJobs);
router.get('/:id', idParamValidator, getMyJob);
router.put('/:id', idParamValidator, jobFieldValidators(false), updateJob);
router.delete('/:id', idParamValidator, deleteJob);
router.patch('/:id/close', idParamValidator, closeJob);
router.patch('/:id/reopen', idParamValidator, reopenJob);

module.exports = router;
