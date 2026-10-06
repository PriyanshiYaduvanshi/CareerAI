// controllers/businessApplicantsController.js
const mongoose = require('mongoose');
const pdfParse = require('pdf-parse');
const Application = require('../models/Application');
const Job = require('../models/Job');
const aiService = require('../utils/aiService');
const chunkService = require('../services/chunkService');
const { runInBackground } = require('../utils/backgroundTask');
const { notifyRoundAdvancement } = require('./notificationsController');
const { escapeRegex } = require('../utils/regexHelpers');
const {
  VALID_STATUSES,
  BUSINESS_ASSIGNABLE_STATUSES,
  STATUS_DISPLAY_LABELS,
  EXPERIENCE_LABELS,
  computeExperienceYears,
  experienceBucket,
} = require('../utils/applicationConstants');

const VALID_SORT_FIELDS = ['appliedAt', 'name', 'status', 'experienceYears'];

// @desc    Get applicants across all (or one) of the logged-in business's jobs.
//          Supports search, filtering, sorting, and pagination.
// @route   GET /api/business/applicants
// @query   jobId, search, status, experience, sortBy, sortOrder, page, limit
const getApplicants = async (req, res, next) => {
  try {
    const {
      jobId,
      search = '',
      status = 'all',
      experience = 'all',
      sortBy = 'appliedAt',
      sortOrder = 'desc',
      page = 1,
      limit = 10,
    } = req.query;

    if (jobId && !mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid job id' });
    }
    if (status !== 'all' && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status filter' });
    }

    // ── Scope to only this business's own job postings ──────────────────
    const jobFilter = { postedByUser: req.user._id };
    if (jobId) jobFilter._id = jobId;
    const myJobs = await Job.find(jobFilter).select('_id');
    const myJobIds = myJobs.map((j) => j._id);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 10));

    if (myJobIds.length === 0) {
      return res.json({ success: true, total: 0, page: pageNum, pages: 0, limit: limitNum, applicants: [] });
    }

    const matchStage = { job: { $in: myJobIds } };
    if (status !== 'all') matchStage.status = status;

    const pipeline = [
      { $match: matchStage },
      { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'candidate' } },
      { $unwind: '$candidate' },
      { $lookup: { from: 'jobs', localField: 'job', foreignField: '_id', as: 'jobInfo' } },
      { $unwind: '$jobInfo' },
    ];

    if (search && search.trim()) {
      const re = new RegExp(escapeRegex(search.trim()), 'i');
      pipeline.push({
        $match: {
          $or: [
            { 'candidate.name': re },
            { 'candidate.email': re },
            { 'jobInfo.title': re },
            { 'candidate.skills.name': re },
          ],
        },
      });
    }

    pipeline.push({
      $project: {
        appliedAt: 1,
        status: 1,
        resumeFileName: 1,
        resumeUrl: 1,
        resumeAnalysis: 1,
        interviewDate: 1,
        meetingLink: 1,
        candidateId: '$candidate._id',
        name: '$candidate.name',
        email: '$candidate.email',
        avatar: '$candidate.avatar',
        title: '$candidate.title',
        location: '$candidate.location',
        skills: '$candidate.skills',
        experience: '$candidate.experience',
        jobId: '$jobInfo._id',
        jobTitle: '$jobInfo.title',
      },
    });

    const rows = await Application.aggregate(pipeline);

    // Experience is derived from work-history durations, which isn't
    // practical to bucket inside the aggregation pipeline, so it — along
    // with the final sort/paginate — happens here on the (already
    // job-scoped, searched, and status-filtered) result set.
    let applicants = rows.map((r) => {
      const years = computeExperienceYears(r.experience);
      return {
        _id: r._id,
        candidateId: r.candidateId,
        name: r.name,
        email: r.email,
        avatar: r.avatar || '',
        title: r.title || '',
        location: r.location || '',
        appliedAt: r.appliedAt,
        status: r.status,
        experienceYears: years,
        experienceLevel: experienceBucket(years),
        skills: (r.skills || []).map((s) => s.name).filter(Boolean),
        hasResume: !!r.resumeUrl,
        resumeFileName: r.resumeFileName || '',
        interviewDate: r.interviewDate || null,
        meetingLink: r.meetingLink || '',
        atsScore: r.resumeAnalysis?.atsScore ?? null,
        overallRecommendation: r.resumeAnalysis?.overallRecommendation || null,
        job: { _id: r.jobId, title: r.jobTitle },
      };
    });

    if (experience && experience !== 'all') {
      applicants = applicants.filter((a) => a.experienceLevel === experience);
    }

    const sortKey = VALID_SORT_FIELDS.includes(sortBy) ? sortBy : 'appliedAt';
    const dir = sortOrder === 'asc' ? 1 : -1;
    applicants.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === 'appliedAt') {
        av = new Date(av).getTime();
        bv = new Date(bv).getTime();
      } else if (typeof av === 'string' || typeof bv === 'string') {
        av = (av || '').toString().toLowerCase();
        bv = (bv || '').toString().toLowerCase();
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    const total = applicants.length;
    const pages = Math.max(1, Math.ceil(total / limitNum));
    const start = (pageNum - 1) * limitNum;
    const paginated = applicants.slice(start, start + limitNum);

    res.json({ success: true, total, page: pageNum, pages, limit: limitNum, applicants: paginated });
  } catch (error) {
    next(error);
  }
};

// @desc    Get full detail for a single applicant (must belong to one of
//          the logged-in business's jobs).
// @route   GET /api/business/applicants/:id
const getApplicantById = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid applicant id' });
    }

    const application = await Application.findById(req.params.id)
      .populate('user', 'name email avatar title bio location phone skills experience education resumeText')
      .populate('job', 'title company location postedByUser employmentType workMode experience');

    if (!application || !application.job || String(application.job.postedByUser) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: 'Applicant not found' });
    }

    const years = computeExperienceYears(application.user?.experience);

    res.json({
      success: true,
      applicant: {
        _id: application._id,
        appliedAt: application.appliedAt,
        status: application.status,
        phone: application.phone,
        coverLetter: application.coverLetter,
        linkedin: application.linkedin,
        portfolio: application.portfolio,
        resumeFileName: application.resumeFileName,
        hasResume: !!application.resumeUrl,
        interviewDate: application.interviewDate,
        meetingLink: application.meetingLink,
        lastEmailSentAt: application.lastEmailSentAt,
        lastEmailType: application.lastEmailType,
        timeline: application.timeline,
        resumeAnalysis: application.resumeAnalysis || null,
        experienceYears: years,
        experienceLevel: experienceBucket(years),
        experienceLevelLabel: EXPERIENCE_LABELS[experienceBucket(years)],
        candidate: application.user,
        job: application.job,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    View or download an applicant's resume (must belong to one of
//          the logged-in business's jobs).
// @route   GET /api/business/applicants/:id/resume?download=true
const getApplicantResume = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid applicant id' });
    }

    const application = await Application.findById(req.params.id).populate('job', 'postedByUser');

    if (!application || !application.job || String(application.job.postedByUser) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: 'Applicant not found' });
    }
    if (!application.resumeUrl) {
      return res.status(404).json({ success: false, message: 'No resume on file for this applicant' });
    }

    const match = /^data:([^;]+);base64,(.+)$/.exec(application.resumeUrl);
    if (!match) {
      return res.status(500).json({ success: false, message: 'Resume file is corrupted' });
    }

    const mimeType = match[1] || 'application/pdf';
    const buffer = Buffer.from(match[2], 'base64');
    const filename = (application.resumeFileName || 'resume.pdf').replace(/["\r\n]/g, '');
    const disposition = req.query.download === 'true' ? 'attachment' : 'inline';

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `${disposition}; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

// @desc    (Re-)run AI resume analysis for an applicant on demand — useful
//          for applications submitted before this feature existed, or if
//          the automatic analysis failed at upload time (e.g. AI provider
//          was briefly unavailable). Reuses the exact same extraction +
//          aiService agent used when the resume was first uploaded.
// @route   POST /api/business/applicants/:id/analyze-resume
const analyzeApplicantResume = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid applicant id' });
    }

    const application = await Application.findById(req.params.id).populate('job');
    if (!application || !application.job || String(application.job.postedByUser) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: 'Applicant not found' });
    }
    if (!application.resumeUrl) {
      return res.status(404).json({ success: false, message: 'No resume on file for this applicant' });
    }

    const match = /^data:([^;]+);base64,(.+)$/.exec(application.resumeUrl);
    if (!match) {
      return res.status(500).json({ success: false, message: 'Resume file is corrupted' });
    }

    let extractedText = '';
    try {
      const buffer = Buffer.from(match[2], 'base64');
      const { text } = await pdfParse(buffer);
      if (!text || text.trim().length < 50) {
        application.resumeAnalysis = { error: 'Resume text could not be extracted for analysis.', analyzedAt: new Date() };
      } else {
        extractedText = text;
        const analysis = await aiService.analyzeApplicantResume(text, application.job);
        application.resumeAnalysis = { ...analysis, error: '', analyzedAt: new Date() };
      }
    } catch (err) {
      application.resumeAnalysis = { error: err.message || 'Resume analysis failed', analyzedAt: new Date() };
    }

    await application.save();

    // Best-effort RAG re-indexing — runs in the background (replaces this
    // application's previous resume_chunks with the freshly re-analyzed
    // text; chunkService handles the delete-then-insert for the same
    // sourceId internally).
    if (extractedText) {
      runInBackground(() => chunkService.indexResumeText(extractedText, {
        sourceId: application._id,
        sourceType: 'application',
        owner: application.user,
        metadata: { jobId: application.job._id, jobTitle: application.job.title },
      }), 'applicant resume RAG re-indexing');
    }

    res.json({ success: true, resumeAnalysis: application.resumeAnalysis });
  } catch (error) {
    next(error);
  }
};

// @desc    Update an applicant's status (Shortlist / Reject / Keep Pending /
//          or move to any other stage). Records every change in the
//          application's timeline so a full status history is kept, and
//          notifies the candidate that their status changed.
// @route   PATCH /api/business/applicants/:id/status
// @body    { status, note }
const updateApplicantStatus = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid applicant id' });
    }

    const { status, note = '' } = req.body;
    if (!status || !BUSINESS_ASSIGNABLE_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Status must be one of: ${BUSINESS_ASSIGNABLE_STATUSES.join(', ')}`,
      });
    }

    const application = await Application.findById(req.params.id).populate('job', 'title company postedByUser');
    if (!application || !application.job || String(application.job.postedByUser) !== String(req.user._id)) {
      return res.status(404).json({ success: false, message: 'Applicant not found' });
    }

    const previousStatus = application.status;

    application.status = status;
    application.timeline.push({
      status,
      note: note || `Status updated to "${STATUS_DISPLAY_LABELS[status] || status}"`,
      changedBy: 'business',
    });
    await application.save();

    // Best-effort notification to the candidate — never blocks the
    // response. notifyRoundAdvancement itself decides whether this status
    // change actually warrants a notification (only "selected for the next
    // round" statuses do — see ROUND_ADVANCEMENT_STATUSES).
    try {
      await notifyRoundAdvancement({ application, previousStatus, newStatus: status });
    } catch (notifyErr) {
      // Notification failures shouldn't fail the status update itself.
    }

    res.json({
      success: true,
      applicant: {
        _id: application._id,
        status: application.status,
        timeline: application.timeline,
      },
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Counts of applicants by status across all of the logged-in
//          business's jobs (optionally scoped to a single job). Powers the
//          Dashboard statistics cards and the applicant filter badges.
// @route   GET /api/business/applicants/stats/summary
// @query   jobId
const getApplicantStatusCounts = async (req, res, next) => {
  try {
    const { jobId } = req.query;
    if (jobId && !mongoose.Types.ObjectId.isValid(jobId)) {
      return res.status(400).json({ success: false, message: 'Invalid job id' });
    }

    const jobFilter = { postedByUser: req.user._id };
    if (jobId) jobFilter._id = jobId;
    const myJobs = await Job.find(jobFilter).select('_id');
    const myJobIds = myJobs.map((j) => j._id);

    const counts = Object.fromEntries(VALID_STATUSES.map((s) => [s, 0]));
    let total = 0;

    if (myJobIds.length > 0) {
      const rows = await Application.aggregate([
        { $match: { job: { $in: myJobIds } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]);
      rows.forEach((r) => {
        if (r._id in counts) counts[r._id] = r.count;
        total += r.count;
      });
    }

    // "pending" is the business-facing name for the default 'applied' status.
    res.json({
      success: true,
      total,
      counts: {
        pending: counts.applied,
        shortlisted: counts.shortlisted,
        screening: counts.screening,
        interview: counts.interview,
        offer: counts.offer,
        rejected: counts.rejected,
        withdrawn: counts.withdrawn,
        saved: counts.saved,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getApplicants,
  getApplicantById,
  getApplicantResume,
  analyzeApplicantResume,
  updateApplicantStatus,
  getApplicantStatusCounts,
};
