// models/Application.js
const mongoose = require('mongoose');
const { isValidIndianPhone, PHONE_ERROR_MESSAGE, isValidLinkedInUrl, LINKEDIN_ERROR_MESSAGE } = require('../utils/validators');

const applicationSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  job:       { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
  // The business (company) account that owns the job being applied to.
  // Populated automatically from job.postedByUser for real job-board
  // applications; left blank for manually-added / external applications.
  business:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  // For manually added jobs not in DB
  jobTitle:  String,
  company:   String,
  status:    {
    type: String,
    enum: ['saved', 'applied', 'shortlisted', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'],
    default: 'applied',
  },
  appliedAt:   { type: Date, default: Date.now },
  notes:       { type: String, default: '' },
  nextStep:    { type: String, default: '' },
  salary:      { type: String, default: '' },
  contactName: { type: String, default: '' },
  contactEmail:{ type: String, default: '' },

  // ── Email module (set automatically when a business sends an Interview
  // Invitation email; shown back to the candidate on their Applications page) ──
  interviewDate: { type: Date, default: null },
  meetingLink:   { type: String, default: '' },
  lastEmailSentAt:  { type: Date, default: null },
  lastEmailType:    { type: String, enum: ['shortlisted', 'interview', 'rejected', 'custom', null], default: null },

  // ── Job Application module (Apply Job flow) ──────────────────────────
  resumeUrl:      { type: String, default: '' }, // secure resume file (data URI) or storage URL
  resumeFileName: { type: String, default: '' },
  phone:          {
    type: String,
    default: '',
    // Defense-in-depth: mirrors the controller-level check so an invalid
    // number can never be written directly via a model call either.
    validate: {
      validator: (value) => !value || isValidIndianPhone(value),
      message: PHONE_ERROR_MESSAGE,
    },
  },
  coverLetter:    { type: String, default: '' },
  linkedin:       {
    type: String,
    default: '',
    validate: {
      validator: (value) => !value || isValidLinkedInUrl(value),
      message: LINKEDIN_ERROR_MESSAGE,
    },
  },
  portfolio:      { type: String, default: '' },

  // ── AI Resume Analysis (generated automatically when a resume is uploaded) ──
  resumeAnalysis: {
    atsScore:            { type: Number, default: null },
    resumeScore:         { type: Number, default: null },
    skillMatch:          { type: Number, default: null }, // % of the job's required skills found on the resume
    jobMatchPercentage:  { type: Number, default: null }, // overall fit against the full job posting
    requiredSkillsFound: { type: [String], default: [] },
    missingSkills:       { type: [String], default: [] },
    strengths:           { type: [String], default: [] },
    weaknesses:          { type: [String], default: [] },
    experienceMatch:     { type: Number, default: null }, // 0-100
    educationMatch:      { type: Number, default: null }, // 0-100
    projectRelevance:    { type: Number, default: null }, // 0-100
    resumeRelevance:     { type: Number, default: null }, // 0-100
    experienceSummary:   { type: String, default: '' },
    educationSummary:    { type: String, default: '' },
    projectsSummary:     { type: String, default: '' },
    suggestions:         { type: [String], default: [] },
    recruiterSummary:    { type: String, default: '' }, // short recruiter-facing rationale for the recommendation
    overallRecommendation: {
      type: String,
      enum: ['Highly Recommended', 'Recommended', 'Average', 'Not Suitable', null],
      default: null,
    },
    analyzedAt:  { type: Date, default: null },
    error:       { type: String, default: '' }, // set if AI analysis failed, so the UI can offer a retry
  },

  timeline: [{
    status:    String,
    note:      String,
    changedBy: { type: String, enum: ['candidate', 'business', 'system'], default: 'system' },
    date:      { type: Date, default: Date.now },
  }],
}, { timestamps: true });

// Prevent duplicate applications for the same job by the same user.
// Partial index so manually-added applications (no `job` reference) never collide.
applicationSchema.index(
  { user: 1, job: 1 },
  { unique: true, partialFilterExpression: { job: { $type: 'objectId' } } }
);

// ── Dashboard / analytics query optimization ──────────────────────────────
// Every business-dashboard query starts by scoping to a set of job ids and
// then either filters by status or sorts/groups by appliedAt, so a compound
// index covering (job, status) and (job, appliedAt) lets Mongo satisfy those
// aggregation stages with an index scan instead of a collection scan.
applicationSchema.index({ job: 1, status: 1 });
applicationSchema.index({ job: 1, appliedAt: -1 });

module.exports = mongoose.model('Application', applicationSchema);
