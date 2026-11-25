// models/InterviewChunk.js
//
// RAG chunk collection for AI Mock Interview sessions. Populated by
// services/chunkService.js from two points in aiController.js:
//   - startInterview: the generated question set (sourceType
//     'interview_question')
//   - submitAnswer: each answered question paired with the candidate's
//     answer and the AI's feedback (sourceType 'interview_answer')
//
// sourceId = the Interview document's _id (a real ObjectId — Interview
// sessions ARE persisted, unlike roadmaps/market reports), owner = the
// candidate. Kept separate from models/Interview.js so the growing
// transcript history never has to be loaded (or embedded) just to render
// a normal interview session.
const mongoose = require('mongoose');
const { baseChunkFields } = require('./chunkSchemaFields');

const interviewChunkSchema = new mongoose.Schema({
  ...baseChunkFields,
  sourceType: { type: String, enum: ['interview_question', 'interview_answer', 'interview_session'], required: true },
}, { timestamps: true });

interviewChunkSchema.index({ owner: 1, sourceId: 1 });

module.exports = mongoose.model('InterviewChunk', interviewChunkSchema, 'interview_chunks');
