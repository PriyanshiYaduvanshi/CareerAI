// ============================================
// server.js - Main entry point for the API
// ============================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/database');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./utils/logger');

const app = express();

// Connect to MongoDB
connectDB();

// Trust the first proxy hop (Render/Heroku/Nginx, etc.) so req.ip and
// rate-limiting reflect the real client instead of the proxy's address.
app.set('trust proxy', 1);

// ── Security & performance middleware ───────────────────────────────────────
app.use(helmet({
  // The API only ever serves JSON — CSP is a browser/HTML concern and would
  // otherwise just add noise to API responses.
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(morgan('dev'));

// Strip any keys starting with `$` or containing `.` from user-controlled
// input so it can never be interpreted as a MongoDB operator (NoSQL
// injection guard) — e.g. `{ "email": { "$gt": "" } }`.
const sanitizeInPlace = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete obj[key];
      continue;
    }
    if (obj[key] && typeof obj[key] === 'object') sanitizeInPlace(obj[key]);
  }
};
app.use((req, res, next) => {
  sanitizeInPlace(req.body);
  sanitizeInPlace(req.query);
  next();
});

// General API rate limit — generous, just a backstop against abuse/loops.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

// Tighter limit on auth endpoints specifically, to slow down credential
// stuffing / brute-force login attempts without affecting normal usage.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// AI endpoints call an external, metered AI provider — rate-limit them a
// little tighter than the general API so a runaway client loop can't rack
// up cost or exhaust the provider's own rate limit for every user.
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many AI requests, please slow down.' },
});
app.use('/api/ai', aiLimiter);
app.use('/api/career', aiLimiter);

// Same reasoning as aiLimiter above: this is chatbot infrastructure that a
// future phase will wire up to a metered AI provider, so it gets the same
// tighter-than-general limit from the start rather than being loosened
// later.
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many chat requests, please slow down.' },
});
app.use('/api/chat', chatLimiter);

// Routes
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/users',        require('./routes/users'));
app.use('/api/jobs',         require('./routes/jobs'));
app.use('/api/business/jobs', require('./routes/businessJobs'));
app.use('/api/business/applicants', require('./routes/businessApplicants'));
app.use('/api/business/analytics', require('./routes/businessAnalytics'));
app.use('/api/business/profile', require('./routes/businessProfile'));
app.use('/api/business/settings', require('./routes/businessSettings'));
app.use('/api/business/inbox', require('./routes/businessInbox'));
app.use('/api/business/search', require('./routes/businessSearch'));
app.use('/api/skills',       require('./routes/skills'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/interview',    require('./routes/interview'));
app.use('/api/resume',       require('./routes/resume'));
app.use('/api/ai',           require('./routes/ai'));
app.use('/api/career',       require('./routes/career'));
app.use('/api/notifications',require('./routes/notifications'));
app.use('/api/search',       require('./routes/search'));
app.use('/api/chat',         require('./routes/chat'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK', message: 'AI Job Platform API is running' }));

// 404 handler for unknown API routes (must come after all routes, before the error handler)
app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT}`));

module.exports = app;
