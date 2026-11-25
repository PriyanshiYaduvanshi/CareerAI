// models/LearningChunk.js
//
// RAG chunk collection for the Learning Roadmap feature. Populated by
// services/chunkService.js after aiController.learningRoadmap generates a
// roadmap (aiService.generateLearningRoadmap) — sourceType
// 'learning_roadmap', sourceId is a synthetic id (roadmaps are computed
// on demand and never persisted as their own document, so there's no
// real ObjectId to point at; see chunkService for how it's built).
//
// 'course_catalog' is reserved for optionally indexing
// data/courseCatalog.js itself in the future so course descriptions can
// be retrieved semantically (today courseRecommendation.js only matches
// on exact skill-tag overlap) — not populated yet, but modeled now so
// adding it later doesn't require a migration.
const mongoose = require('mongoose');
const { baseChunkFields } = require('./chunkSchemaFields');

const learningChunkSchema = new mongoose.Schema({
  ...baseChunkFields,
  sourceType: { type: String, enum: ['learning_roadmap', 'course_catalog'], required: true },
}, { timestamps: true });

learningChunkSchema.index({ owner: 1, sourceId: 1 });

module.exports = mongoose.model('LearningChunk', learningChunkSchema, 'learning_chunks');
