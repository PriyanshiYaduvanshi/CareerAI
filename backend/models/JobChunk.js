// models/JobChunk.js
//
// RAG chunk collection for job postings. Populated by
// services/chunkService.js whenever a business creates or edits a job
// posting (businessJobsController.createJob / updateJob) and cleared out
// when the posting is deleted (businessJobsController.deleteJob), so
// stale chunks can never outlive their source job.
//
// sourceId = the Job's _id. owner = the posting business account
// (Job.postedByUser), so retrieval can be scoped to "this business's own
// postings" the same way businessSearchController already scopes regular
// search.
const mongoose = require('mongoose');
const { baseChunkFields } = require('./chunkSchemaFields');

const jobChunkSchema = new mongoose.Schema({
  ...baseChunkFields,
  sourceType: { type: String, enum: ['job_posting'], default: 'job_posting' },
}, { timestamps: true });

jobChunkSchema.index({ owner: 1, sourceId: 1 });

module.exports = mongoose.model('JobChunk', jobChunkSchema, 'job_chunks');
