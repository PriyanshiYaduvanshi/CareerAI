// controllers/businessJobsController.js
const { validationResult } = require('express-validator');
const Job = require('../models/Job');
const Application = require('../models/Application');
const chunkService = require('../services/chunkService');
const { runInBackground } = require('../utils/backgroundTask');

// Derive the legacy `type` field (used by the existing candidate-facing
// job board) from the new employmentType/workMode fields so old queries,
// filters, and badges keep working without any change on the candidate side.
const deriveLegacyType = (employmentType, workMode) => {
  if (workMode === 'remote') return 'remote';
  if (workMode === 'hybrid') return 'hybrid';
  return employmentType || 'full-time';
};

const toStringArray = (val) => {
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(',').map(v => v.trim()).filter(Boolean);
  return [];
};

// ── RAG indexing (job_chunks) ───────────────────────────────────────────────
// Composes the posting's free-text fields under the same section headings
// utils/textChunker.js's 'job' domain already knows how to detect
// (Overview/Responsibilities/Requirements/Benefits), so the section-aware
// chunker splits it the way it's meant to instead of falling straight
// through to the recursive fallback.
const buildJobIndexText = (job) => [
  `Overview\n${job.description || ''}`,
  job.responsibilities?.length ? `Responsibilities\n${job.responsibilities.join('\n')}` : '',
  job.qualifications?.length ? `Requirements\n${job.qualifications.join('\n')}` : '',
  job.benefits?.length ? `Benefits\n${job.benefits.join('\n')}` : '',
].filter(Boolean).join('\n\n');

// Best-effort — runs in the background so it never adds latency to
// job create/update requests.
const indexJobPosting = (job) => {
  runInBackground(() => chunkService.indexJobText(buildJobIndexText(job), {
    sourceId: job._id,
    owner: job.postedByUser,
    metadata: { title: job.title, company: job.company, requiredSkills: job.requiredSkills || [] },
  }), 'job posting RAG indexing');
};

// @desc    Create a job posting
// @route   POST /api/business/jobs
const createJob = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const {
      title, company, location, employmentType, workMode, experience,
      salaryMin, salaryMax, currency, requiredSkills, responsibilities,
      qualifications, benefits, description, deadline, vacancies, companyLogo,
    } = req.body;

    const job = await Job.create({
      title: title.trim(),
      company: (company || req.user.companyName || req.user.name).trim(),
      location: location.trim(),
      employmentType,
      workMode,
      type: deriveLegacyType(employmentType, workMode),
      experience,
      salaryMin: Number(salaryMin) || 0,
      salaryMax: Number(salaryMax) || 0,
      currency: currency || 'INR',
      requiredSkills: toStringArray(requiredSkills),
      responsibilities: toStringArray(responsibilities),
      qualifications: toStringArray(qualifications),
      requirements: toStringArray(qualifications), // keep legacy field in sync
      benefits: toStringArray(benefits),
      description: description.trim(),
      deadline,
      vacancies: Number(vacancies) || 1,
      companyLogo: companyLogo || '',
      logoUrl: companyLogo || '',
      postedBy: req.user.companyName || req.user.name,
      postedByUser: req.user._id,
      status: 'open',
      isActive: true,
    });

    await indexJobPosting(job);

    res.status(201).json({ success: true, job });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all jobs posted by the logged-in business account
// @route   GET /api/business/jobs
const getMyJobs = async (req, res, next) => {
  try {
    // .lean() skips Mongoose document hydration for this read-only list.
    const jobs = await Job.find({ postedByUser: req.user._id }).sort({ createdAt: -1 }).lean();

    // A single grouped aggregate for every job's applicant count in one
    // round trip, instead of one countDocuments() query per job (which
    // previously cost N queries for N postings).
    const jobIds = jobs.map((j) => j._id);
    const counts = jobIds.length
      ? await Application.aggregate([
          { $match: { job: { $in: jobIds } } },
          { $group: { _id: '$job', count: { $sum: 1 } } },
        ])
      : [];
    const countByJobId = new Map(counts.map((c) => [String(c._id), c.count]));

    const jobsWithCounts = jobs.map((job) => ({
      ...job,
      applicantsCount: countByJobId.get(String(job._id)) || 0,
    }));

    res.json({ success: true, count: jobsWithCounts.length, jobs: jobsWithCounts });
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single job owned by the logged-in business account
// @route   GET /api/business/jobs/:id
const getMyJob = async (req, res, next) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, postedByUser: req.user._id }).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const applicantsCount = await Application.countDocuments({ job: job._id });
    res.json({ success: true, job: { ...job, applicantsCount } });
  } catch (error) {
    next(error);
  }
};

// @desc    Update a job posting
// @route   PUT /api/business/jobs/:id
const updateJob = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const job = await Job.findOne({ _id: req.params.id, postedByUser: req.user._id });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    const {
      title, company, location, employmentType, workMode, experience,
      salaryMin, salaryMax, currency, requiredSkills, responsibilities,
      qualifications, benefits, description, deadline, vacancies, companyLogo,
    } = req.body;

    if (title !== undefined) job.title = title.trim();
    if (company !== undefined) job.company = company.trim();
    if (location !== undefined) job.location = location.trim();
    if (experience !== undefined) job.experience = experience;
    if (salaryMin !== undefined) job.salaryMin = Number(salaryMin) || 0;
    if (salaryMax !== undefined) job.salaryMax = Number(salaryMax) || 0;
    if (currency !== undefined) job.currency = currency;
    if (requiredSkills !== undefined) job.requiredSkills = toStringArray(requiredSkills);
    if (responsibilities !== undefined) job.responsibilities = toStringArray(responsibilities);
    if (qualifications !== undefined) {
      job.qualifications = toStringArray(qualifications);
      job.requirements = toStringArray(qualifications);
    }
    if (benefits !== undefined) job.benefits = toStringArray(benefits);
    if (description !== undefined) job.description = description.trim();
    if (deadline !== undefined) job.deadline = deadline;
    if (vacancies !== undefined) job.vacancies = Number(vacancies) || 1;
    if (companyLogo !== undefined) { job.companyLogo = companyLogo; job.logoUrl = companyLogo; }

    if (employmentType !== undefined) job.employmentType = employmentType;
    if (workMode !== undefined) job.workMode = workMode;
    if (employmentType !== undefined || workMode !== undefined) {
      job.type = deriveLegacyType(job.employmentType, job.workMode);
    }

    await job.save();
    await indexJobPosting(job);

    res.json({ success: true, job });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete a job posting
// @route   DELETE /api/business/jobs/:id
const deleteJob = async (req, res, next) => {
  try {
    const job = await Job.findOneAndDelete({ _id: req.params.id, postedByUser: req.user._id });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    // Best-effort cleanup — a job's chunks outliving the job itself would
    // let retrieval surface a listing that no longer exists.
    try {
      await chunkService.deleteChunksForSource('job', job._id);
    } catch (err) {
      console.error('RAG chunk cleanup failed for deleted job:', err.message);
    }

    res.json({ success: true, message: 'Job deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// @desc    Close a job posting (stops accepting new applicants)
// @route   PATCH /api/business/jobs/:id/close
const closeJob = async (req, res, next) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, postedByUser: req.user._id });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    job.isActive = false;
    job.status = 'closed';
    await job.save();

    res.json({ success: true, job });
  } catch (error) {
    next(error);
  }
};

// @desc    Reopen a previously closed job posting
// @route   PATCH /api/business/jobs/:id/reopen
const reopenJob = async (req, res, next) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, postedByUser: req.user._id });
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    job.isActive = true;
    job.status = 'open';
    await job.save();

    res.json({ success: true, job });
  } catch (error) {
    next(error);
  }
};

module.exports = { createJob, getMyJobs, getMyJob, updateJob, deleteJob, closeJob, reopenJob };
