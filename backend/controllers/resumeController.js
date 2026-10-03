// controllers/resumeController.js
const multer = require('multer');
const pdfParse = require('pdf-parse');
const aiService = require('../utils/aiService');
const User = require('../models/User');
const chunkService = require('../services/chunkService');
const { runInBackground } = require('../utils/backgroundTask');

// Multer memory storage (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and TXT files are allowed'), false);
    }
  },
});

// @desc    Upload and analyze resume
// @route   POST /api/resume/analyze
const analyzeResume = async (req, res, next) => {
  try {
    let resumeText = '';

    if (req.file) {
      if (req.file.mimetype === 'application/pdf') {
        const pdfData = await pdfParse(req.file.buffer);
        resumeText = pdfData.text;
      } else {
        resumeText = req.file.buffer.toString('utf-8');
      }
    } else if (req.body.resumeText) {
      resumeText = req.body.resumeText;
    } else {
      return res.status(400).json({ success: false, message: 'Please provide a resume file or text' });
    }

    if (resumeText.length < 100) {
      return res.status(400).json({ success: false, message: 'Resume text is too short' });
    }
    if (resumeText.length > 50000) {
      return res.status(400).json({ success: false, message: 'Resume text is too long (max 50,000 characters)' });
    }

    // Save to user profile
    await User.findByIdAndUpdate(req.user._id, { resumeText });

    const analysis = await aiService.analyzeResume(resumeText, req.body.targetRole || '');

    // Best-effort RAG indexing — runs in the background so a slow/
    // unavailable embeddings provider never adds latency to this
    // response. This is the standalone self-check flow, so there's no
    // Application document to key off; sourceId is the User's own _id
    // (re-running this check re-indexes/replaces the previous chunk set
    // for that user).
    runInBackground(() => chunkService.indexResumeText(resumeText, {
      sourceId: req.user._id,
      sourceType: 'user',
      owner: req.user._id,
      metadata: { targetRole: req.body.targetRole || '' },
    }), 'resume self-check RAG indexing');

    res.json({ success: true, analysis, resumeText: resumeText.substring(0, 500) + '...' });
  } catch (error) {
    next(error);
  }
};

module.exports = { upload, analyzeResume };
