// routes/skills.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const router = express.Router();
router.use(protect);

// Get user skills
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).select('skills');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, skills: user.skills });
  } catch (err) { next(err); }
});

// Update skills
router.put(
  '/',
  [
    body('skills').isArray().withMessage('Skills must be a list'),
    body('skills.*.name').trim().notEmpty().withMessage('Each skill needs a name').isLength({ max: 80 }),
    body('skills.*.proficiency').optional().isIn(['beginner', 'intermediate', 'advanced', 'expert']).withMessage('Invalid proficiency level'),
    body('skills.*.yearsExp').optional().isFloat({ min: 0, max: 60 }).withMessage('Years of experience must be a realistic number'),
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

      const user = await User.findByIdAndUpdate(
        req.user._id,
        { skills: req.body.skills },
        { new: true, runValidators: true }
      );
      res.json({ success: true, skills: user.skills });
    } catch (err) { next(err); }
  }
);

module.exports = router;
