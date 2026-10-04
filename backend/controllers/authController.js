// controllers/authController.js
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const { validationResult } = require('express-validator');
const User = require('../models/User');

// Generate JWT token
const generateToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// @desc    Register user
// @route   POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { name, email, password, role, companyName } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ success: false, message: 'Email already registered' });

    // Whitelist role so arbitrary values (e.g. 'admin') can never be injected.
    const safeRole = role === 'company' ? 'company' : 'candidate';

    const user = await User.create({
      name,
      email,
      password,
      role: safeRole,
      ...(safeRole === 'company' && companyName ? { companyName } : {}),
    });
    const token = generateToken(user._id);

    res.status(201).json({ success: true, token, user });
  } catch (error) {
    next(error);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = generateToken(user._id);
    res.json({ success: true, token, user });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
const getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};

// @desc    Login/register via Google Identity Services
// @route   POST /api/auth/google
const googleAuth = async (req, res, next) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ success: false, message: 'Missing Google credential' });

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email: payload.email }] });
    if (!user) {
      user = await User.create({
        name: payload.name,
        email: payload.email,
        googleId: payload.sub,
        authProvider: 'google',
      });
    } else if (!user.googleId) {
      user.googleId = payload.sub;
      await user.save();
    }

    const token = generateToken(user._id);
    res.json({ success: true, token, user });
  } catch (error) {
    next(error);
  }
};

module.exports = { register, login, getMe, googleAuth };
