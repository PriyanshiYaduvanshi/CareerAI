// routes/auth.js
const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe, googleAuth } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const router = express.Router();

router.post('/register', [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], register);
router.post('/login', [
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required'),
], login);
router.post('/google', googleAuth);
router.get('/me', protect, getMe);

module.exports = router;
