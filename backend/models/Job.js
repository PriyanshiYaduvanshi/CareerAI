// models/Job.js
const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title:       { type: String, required: true },
  company:     { type: String, required: true },
  location:    { type: String, required: true },
  type:        { type: String, enum: ['full-time', 'part-time', 'contract', 'remote', 'hybrid'], default: 'full-time' },
  description: { type: String, required: true },
  requirements:   [String],
  requiredSkills: [String],
  niceToHave:     [String],
  salaryMin:   { type: Number, default: 0 },
  salaryMax:   { type: Number, default: 0 },
  currency:    { type: String, default: 'INR' },
  experience:  { type: String, enum: ['entry', 'mid', 'senior', 'lead', 'executive'], default: 'mid' },
  category:    { type: String, default: 'Technology' },
  postedBy:    { type: String, default: 'AI Platform' },
  postedAt:    { type: Date, default: Date.now },
  deadline:    { type: Date },
  isActive:    { type: Boolean, default: true },
  logoUrl:     { type: String, default: '' },
  applyUrl:    { type: String, default: '' },
  tags:        [String],

  // ── Business Job Posting module (additive — does not affect candidate flows) ──
  // The business (company) account that owns this posting. Only present for
  // jobs created through the Business Dashboard's Job Posting module.
  postedByUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  employmentType:  { type: String, enum: ['full-time', 'part-time', 'contract', 'internship', 'temporary'], default: 'full-time' },
  workMode:        { type: String, enum: ['remote', 'hybrid', 'onsite'], default: 'onsite' },
  responsibilities: [String],
  qualifications:   [String],
  benefits:         [String],
  vacancies:        { type: Number, default: 1, min: 1 },
  // Company logo stored as a base64 data URI so everything lives in the database.
  companyLogo:      { type: String, default: '' },
  // 'open' / 'closed' mirrors `isActive` for business-facing status labels
  // while keeping the original `isActive` flag (used by candidate queries) authoritative.
  status:           { type: String, enum: ['open', 'closed'], default: 'open' },
}, { timestamps: true });

// Text index for search
jobSchema.index({ title: 'text', description: 'text', requiredSkills: 'text' });

// Every candidate-facing job listing/search query filters on `isActive`
// and sorts by `postedAt`, so this compound index turns that into an index
// scan instead of a full collection scan as the Jobs collection grows.
jobSchema.index({ isActive: 1, postedAt: -1 });

// Every Business Dashboard query starts by looking up "my jobs" by owner,
// so this index turns that lookup into an index scan instead of a full
// collection scan.
jobSchema.index({ postedByUser: 1, createdAt: -1 });

module.exports = mongoose.model('Job', jobSchema);
