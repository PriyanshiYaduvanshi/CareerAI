// models/Interview.js
const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  question:     { type: String, required: true },
  difficulty:   { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  type:         { type: String, enum: ['behavioral', 'technical', 'situational', 'cultural'], default: 'technical' },
  userAnswer:   { type: String, default: '' },
  idealAnswer:  { type: String, default: '' },
  score:        { type: Number, default: 0 },   // 0-10
  feedback:     { type: String, default: '' },
  answered:     { type: Boolean, default: false },
});

const interviewSchema = new mongoose.Schema({
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role:      { type: String, required: true },
  company:   { type: String, default: '' },
  difficulty:{ type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  status:    { type: String, enum: ['in-progress', 'completed'], default: 'in-progress' },
  questions: [questionSchema],
  overallScore:  { type: Number, default: 0 },
  overallFeedback: { type: String, default: '' },
  completedAt:   { type: Date },
}, { timestamps: true });

// Every "my interviews" list query filters by user and sorts by
// createdAt, so this compound index turns that into an index scan
// instead of a full collection scan as interview history grows.
interviewSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Interview', interviewSchema);
