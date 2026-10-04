// ============================================
// models/User.js
// ============================================
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { isValidIndianPhone, PHONE_ERROR_MESSAGE } = require('../utils/validators');

const skillSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  proficiency: { type: String, enum: ['beginner', 'intermediate', 'advanced', 'expert'], default: 'beginner' },
  yearsExp:    { type: Number, default: 0 },
});

const userSchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  email:     { type: String, required: true, unique: true, lowercase: true },
  password:  { type: String, required: function () { return this.authProvider !== 'google'; }, minlength: 6 },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  googleId:  { type: String, default: null, unique: true, sparse: true },
  // 'candidate' accounts see the job-seeker dashboard; 'company' accounts are
  // provisioned internally (see RoleSelectionPage) and are redirected to the
  // Business Dashboard on login.
  role:      { type: String, enum: ['candidate', 'company'], default: 'candidate' },
  companyName: { type: String, default: '' }, // only used when role === 'company'
  // Company Profile — only used when role === 'company'. Shown to candidates
  // on the company's job postings and edited from Business Dashboard →
  // Company Profile.
  companyProfile: {
    industry:    { type: String, default: '' },
    size:        { type: String, default: '' },     // e.g. "201-500 employees"
    founded:     { type: Number, default: null },
    location:    { type: String, default: '' },
    website:     { type: String, default: '' },
    about:       { type: String, default: '' },
    logo:        { type: String, default: '' },      // data URI or storage URL
  },
  // Notification preferences — only used when role === 'company'. Edited
  // from Business Dashboard → Settings. Reserved for future email/digest
  // notifications; the in-app Notification bell does not consult these
  // (it only ever fires on candidate round-advancement — see
  // notificationsController.notifyRoundAdvancement).
  notificationPrefs: {
    newApplicants: { type: Boolean, default: true },
    jobApproved:   { type: Boolean, default: true },
    weeklyReport:  { type: Boolean, default: false },
  },
  avatar:    { type: String, default: '' },
  title:     { type: String, default: '' },
  bio:       { type: String, default: '' },
  location:  { type: String, default: '' },
  phone:     {
    type: String,
    default: '',
    // Last line of defense: even if a route/script skips the request-level
    // validators, an invalid phone number can never be persisted. Empty
    // string is allowed since phone is optional on the profile.
    validate: {
      validator: (value) => !value || isValidIndianPhone(value),
      message: PHONE_ERROR_MESSAGE,
    },
  },
  skills:    [skillSchema],
  experience: [{
    company:   String,
    role:      String,
    startDate: Date,
    endDate:   Date,
    current:   { type: Boolean, default: false },
    description: String,
  }],
  education: [{
    institution: String,
    degree:      String,
    field:       String,
    graduationYear: Number,
  }],
  targetJob:         { type: String, default: '' },
  targetSalary:      { type: Number, default: 0 },
  savedJobs:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'Job' }],
  learningProgress:  [{
    courseId:    String,
    courseName:  String,
    progress:    { type: Number, default: 0 },  // 0-100
    completedAt: Date,
  }],
  resumeText:    { type: String, default: '' },
  profileComplete: { type: Boolean, default: false },
}, { timestamps: true });

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
