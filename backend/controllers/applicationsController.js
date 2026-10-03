// controllers/applicationsController.js
const multer = require('multer');
const pdfParse = require('pdf-parse');
const Application = require('../models/Application');
const Job = require('../models/Job');
const aiService = require('../utils/aiService');
const chunkService = require('../services/chunkService');
const { runInBackground } = require('../utils/backgroundTask');
const {
  isValidIndianPhone,
  isValidLinkedInUrl,
} = require('../utils/validators');

// ── Resume upload (Apply Job flow) ──────────────────────────────────────────
// Memory storage: the file never touches disk. We validate it, then persist
// it as a base64 data URI on the Application document — the same "store the
// file securely inside the DB record" pattern already used for companyLogo.
const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5MB

const resumeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_SIZE },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Resume must be a PDF file'));
    }
  },
}).single('resume');

// Wraps multer so upload errors (wrong type, too large, etc.) come back as
// a normal 400 JSON response instead of an unhandled/500 error.
const uploadResume = (req, res, next) => {
  resumeUpload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Resume file is too large. Maximum size is 5MB.'
        : err.message;
      return res.status(400).json({ success: false, message });
    }
    if (err) {
      return res.status(400).json({ success: false, message: err.message || 'Invalid resume file' });
    }
    next();
  });
};

const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+/i;
// Phone (Indian mobile numbers) and LinkedIn profile URL validation now
// live in utils/validators.js so every route/model enforces the same rule.

// ── AI Resume Analysis (runs automatically whenever a resume is uploaded) ──
// Extracts the resume text from the uploaded PDF and runs it through the
// shared aiService agent. Never throws — a failed/unavailable AI call
// should not block the candidate's application from being submitted.
//
// Returns the extracted text alongside the analysis (not just the
// analysis) so the caller can also hand it to chunkService for RAG
// indexing without parsing the same PDF buffer a second time.
const runResumeAnalysis = async (fileBuffer, job) => {
  try {
    const { text } = await pdfParse(fileBuffer);
    if (!text || text.trim().length < 50) {
      return { text: '', analysis: { error: 'Resume text could not be extracted for analysis.', analyzedAt: new Date() } };
    }
    const analysis = await aiService.analyzeApplicantResume(text, job);
    return { text, analysis: { ...analysis, error: '', analyzedAt: new Date() } };
  } catch (err) {
    return { text: '', analysis: { error: err.message || 'Resume analysis failed', analyzedAt: new Date() } };
  }
};

// @desc    Get all applications
// @route   GET /api/applications
const getApplications = async (req, res, next) => {
  try {
    const { status } = req.query;
    const query = { user: req.user._id };
    if (status) query.status = status;

    const applications = await Application.find(query).populate('job').sort({ createdAt: -1 });
    res.json({ success: true, count: applications.length, applications });
  } catch (error) { next(error); }
};

// @desc    Apply to a real job posting (Apply Job flow)
// @route   POST /api/applications/apply/:jobId
// @body    phone, linkedin, coverLetter?, portfolio?  (multipart/form-data)
// @file    resume (PDF, required)
const applyToJob = async (req, res, next) => {
  try {
    const { jobId } = req.params;
    const { phone, coverLetter = '', linkedin = '', portfolio = '' } = req.body;

    // ── Validate the job ────────────────────────────────────────────────
    const job = await Job.findById(jobId).catch(() => null);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }
    if (job.isActive === false || job.status === 'closed') {
      return res.status(400).json({ success: false, message: 'This job is no longer accepting applications' });
    }
    if (job.deadline) {
      const deadlineEnd = new Date(job.deadline);
      deadlineEnd.setHours(23, 59, 59, 999);
      if (Date.now() > deadlineEnd.getTime()) {
        return res.status(400).json({ success: false, message: 'The application deadline for this job has passed' });
      }
    }

    // ── Validate inputs ─────────────────────────────────────────────────
    const errors = [];
    if (!req.file) errors.push('Resume (PDF) is required');
    if (!phone || !phone.trim()) errors.push('Phone number is required');
    else if (!isValidIndianPhone(phone.trim())) errors.push('Please enter a valid phone number');
    if (!linkedin || !linkedin.trim()) errors.push('LinkedIn profile URL is required');
    else if (!isValidLinkedInUrl(linkedin.trim())) {
      errors.push('Please enter a valid LinkedIn profile URL');
    }

    if (portfolio && portfolio.trim() && !URL_RE.test(portfolio.trim())) {
      errors.push('Please enter a valid portfolio URL');
    }
    if (coverLetter && coverLetter.length > 5000) {
      errors.push('Cover letter must be under 5000 characters');
    }
    if (errors.length) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    // ── Prevent duplicate applications for the same job ─────────────────
    const existing = await Application.findOne({ user: req.user._id, job: jobId });
    if (existing) {
      return res.status(409).json({ success: false, message: 'You have already applied to this job', alreadyApplied: true });
    }

    // ── Upload resume securely (stored as a data URI on the record) ─────
    const resumeUrl = `data:application/pdf;base64,${req.file.buffer.toString('base64')}`;

    // ── Extract text + run AI analysis (ATS score, skill match, etc.) ────
    const { text: resumeText, analysis: resumeAnalysis } = await runResumeAnalysis(req.file.buffer, job);

    let application;
    try {
      application = await Application.create({
        user: req.user._id,
        job: job._id,
        business: job.postedByUser || undefined,
        jobTitle: job.title,
        company: job.company,
        status: 'applied',
        resumeUrl,
        resumeFileName: req.file.originalname,
        resumeAnalysis,
        phone: phone.trim(),
        coverLetter: coverLetter.trim(),
        linkedin: linkedin.trim(),
        portfolio: portfolio.trim(),
        timeline: [{ status: 'applied', note: 'Application submitted', changedBy: 'candidate' }],
      });
    } catch (err) {
      // Race-condition guard: unique index also blocks duplicate submissions.
      if (err.code === 11000) {
        return res.status(409).json({ success: false, message: 'You have already applied to this job', alreadyApplied: true });
      }
      throw err;
    }

    await application.populate('job');

    // Best-effort RAG indexing — runs in the background so it never adds
    // latency to application submission.
    if (resumeText) {
      runInBackground(() => chunkService.indexResumeText(resumeText, {
        sourceId: application._id,
        sourceType: 'application',
        owner: req.user._id,
        metadata: { jobId: job._id, jobTitle: job.title, company: job.company },
      }), 'application resume RAG indexing');
    }

    // Note: no notification is created here — either for the candidate
    // ("application submitted") or the business ("new application
    // received"). Per current product policy, the only in-app notification
    // this platform generates is for the candidate when a business selects
    // them for the next recruitment round; see
    // notificationsController.notifyRoundAdvancement, called from
    // businessApplicantsController.updateApplicantStatus and
    // emailController.sendApplicantEmail.
    res.status(201).json({
      success: true,
      message: 'Application submitted successfully!',
      application,
    });
  } catch (error) { next(error); }
};

// @desc    Check whether the current user already applied to a job
// @route   GET /api/applications/check/:jobId
const checkApplied = async (req, res, next) => {
  try {
    const existing = await Application.findOne({ user: req.user._id, job: req.params.jobId }).select('_id status appliedAt');
    res.json({ success: true, applied: !!existing, application: existing || null });
  } catch (error) { next(error); }
};

// @desc    Delete application
// @route   DELETE /api/applications/:id
const deleteApplication = async (req, res, next) => {
  try {
    await Application.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    res.json({ success: true, message: 'Application removed' });
  } catch (error) { next(error); }
};

module.exports = {
  getApplications, deleteApplication,
  applyToJob, checkApplied, uploadResume,
};
