// models/ResumeChunk.js
//
// RAG chunk collection for resume text. Populated by
// services/chunkService.js whenever a resume is uploaded/analyzed via
// either of the two existing resume flows:
//   - the standalone self-check (resumeController.analyzeResume) —
//     sourceType 'user', sourceId = the User's _id (there's no separate
//     resume document in that flow; the text lives on User.resumeText)
//   - the Apply Job flow (applicationsController.applyToJob) and the
//     recruiter re-analyze action (businessApplicantsController
//     .analyzeApplicantResume) — sourceType 'application', sourceId =
//     the Application's _id
//
// Deliberately a separate collection (not a field on User/Application) so
// embeddings never bloat those documents or get shipped back to the
// client in a normal `Application.find()`/`User.findById()` response.
const mongoose = require('mongoose');
const { baseChunkFields } = require('./chunkSchemaFields');

const resumeChunkSchema = new mongoose.Schema({
  ...baseChunkFields,
  sourceType: { type: String, enum: ['application', 'user'], required: true },
}, { timestamps: true });

// Retrieval is almost always scoped to "this candidate's own resume" and
// re-indexing needs every chunk for one source, so this compound index
// covers both access patterns with a single index scan.
resumeChunkSchema.index({ owner: 1, sourceId: 1 });

module.exports = mongoose.model('ResumeChunk', resumeChunkSchema, 'resume_chunks');
