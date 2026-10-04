// routes/users.js
const express = require('express');
const { body } = require('express-validator');
const { getProfile, updateProfile, getDashboard } = require('../controllers/usersController');
const { protect } = require('../middleware/auth');
const { isValidIndianPhone, PHONE_ERROR_MESSAGE } = require('../utils/validators');
const router = express.Router();

router.use(protect);

const AVATAR_DATA_URI_RE = /^data:image\/(png|jpe?g|webp|gif);base64,/;
const MAX_AVATAR_LENGTH = 2_000_000; // ~1.4MB decoded

const profileValidators = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty').isLength({ max: 100 }).withMessage('Name is too long'),
  body('title').optional().trim().isLength({ max: 150 }).withMessage('Title is too long'),
  body('bio').optional().trim().isLength({ max: 2000 }).withMessage('Bio must be under 2000 characters'),
  body('location').optional().trim().isLength({ max: 150 }).withMessage('Location is too long'),
  body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 20 }).withMessage('Phone number is too long')
    .custom((value) => isValidIndianPhone(value)).withMessage(PHONE_ERROR_MESSAGE),
  body('targetJob').optional().trim().isLength({ max: 150 }).withMessage('Target job is too long'),
  body('targetSalary').optional({ checkFalsy: true }).isFloat({ min: 0 }).withMessage('Target salary must be a positive number'),
  body('skills').optional().isArray().withMessage('Skills must be a list'),
  body('experience').optional().isArray().withMessage('Experience must be a list'),
  body('education').optional().isArray().withMessage('Education must be a list'),
  body('avatar').optional({ nullable: true }).custom((value) => {
    if (value === '' || value === null || value === undefined) return true;
    if (typeof value !== 'string' || !AVATAR_DATA_URI_RE.test(value)) {
      throw new Error('Avatar must be a valid PNG, JPG, WEBP, or GIF image');
    }
    if (value.length > MAX_AVATAR_LENGTH) {
      throw new Error('Avatar image is too large (max ~1.4MB)');
    }
    return true;
  }),
];

router.get('/profile', getProfile);
router.put('/profile', profileValidators, updateProfile);
router.get('/dashboard', getDashboard);

module.exports = router;
