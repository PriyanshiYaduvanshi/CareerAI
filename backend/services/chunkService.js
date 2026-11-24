// services/chunkService.js - the write path of the RAG layer
//
// WHY THIS FILE EXISTS
// ---------------------
// Turns raw text (a resume, a job description, a generated learning
// roadmap, an interview question/answer, a market-trends report) into
// embedded, searchable chunks stored in their own collection —
// resume_chunks / job_chunks / learning_chunks / interview_chunks /
// market_chunks (see models/*Chunk.js) — instead of on the primary domain
// documents (User, Job, Application, Interview). Embeddings never touch
// those documents at all; the chunk collections are the only place a
// vector ever lives.
//
// Every indexing call here is meant to be used as a best-effort side
// effect from the caller's point of view: controllers call these and
// swallow/log any failure (the same pattern applicationsController's
// runResumeAnalysis already uses for AI analysis — a slow or unavailable
// embeddings provider must never block resume upload, job posting,
// interview practice, or any other existing request).

const { chunkText } = require('../utils/textChunker');
const { embedTexts } = require('./embeddingService');
const ResumeChunk = require('../models/ResumeChunk');
const JobChunk = require('../models/JobChunk');
const LearningChunk = require('../models/LearningChunk');
const InterviewChunk = require('../models/InterviewChunk');
const MarketChunk = require('../models/MarketChunk');

const CHUNK_MODELS_BY_DOMAIN = {
  resume: ResumeChunk,
  job: JobChunk,
  learning: LearningChunk,
  interview: InterviewChunk,
  market: MarketChunk,
};

/**
 * Core routine shared by every domain: chunk the text (section-aware with
 * recursive fallback — see utils/textChunker.js), embed every chunk in as
 * few round trips as possible, and replace any previously-indexed chunks
 * for the same source with the fresh set.
 *
 * @param {'resume'|'job'|'learning'|'interview'|'market'} domain
 * @param {string} text - raw source text to index
 * @param {Object} params
 * @param {*} params.sourceId - id of the parent document (or a synthetic id for content that isn't persisted)
 * @param {string} params.sourceType - one of the enum values on that domain's chunk model
 * @param {import('mongoose').Types.ObjectId} [params.owner] - account this content is scoped/attributed to
 * @param {Object} [params.metadata] - extra domain-specific context to store alongside each chunk
 * @param {number} [params.maxChars]
 * @param {number} [params.overlapChars]
 * @returns {Promise<{indexed: number}>}
 */
const indexText = async (domain, text, params = {}) => {
  const { sourceId, sourceType, owner, metadata = {}, maxChars, overlapChars } = params;

  const ChunkModel = CHUNK_MODELS_BY_DOMAIN[domain];
  if (!ChunkModel) throw new Error(`Unknown RAG domain: ${domain}`);
  if (sourceId === undefined || sourceId === null) throw new Error('indexText requires a sourceId');

  const chunks = chunkText(text, { domain, maxChars, overlapChars });
  if (!chunks.length) return { indexed: 0 };

  const embeddings = await embedTexts(chunks.map((c) => c.text));

  // Re-indexing (a resume re-uploaded, a job posting edited, an on-demand
  // re-analyze) replaces the previous chunk set for that exact source
  // rather than accumulating stale duplicates alongside fresh ones.
  await ChunkModel.deleteMany({ sourceId });

  const docs = chunks.map((chunk, i) => ({
    sourceId,
    sourceType,
    owner,
    section: chunk.section,
    chunkIndex: chunk.chunkIndex,
    text: chunk.text,
    tokenEstimate: Math.ceil(chunk.text.length / 4), // rough chars-per-token heuristic, diagnostics only
    embedding: embeddings[i],
    metadata,
  }));

  await ChunkModel.insertMany(docs);
  return { indexed: docs.length };
};

/**
 * Removes every chunk belonging to a given source — e.g. when a job
 * posting is deleted, so retrieval can never surface chunks for a
 * listing that no longer exists.
 */
const deleteChunksForSource = async (domain, sourceId) => {
  const ChunkModel = CHUNK_MODELS_BY_DOMAIN[domain];
  if (!ChunkModel) throw new Error(`Unknown RAG domain: ${domain}`);
  await ChunkModel.deleteMany({ sourceId });
};

// ── Domain-specific convenience wrappers ────────────────────────────────
// Kept thin on purpose: they just pin down the domain (and, where there's
// only one sensible value, the sourceType) so call sites in controllers
// don't need to know anything about chunking/embedding internals.

const indexResumeText = (text, { sourceId, sourceType, owner, metadata }) =>
  indexText('resume', text, { sourceId, sourceType, owner, metadata });

const indexJobText = (text, { sourceId, owner, metadata }) =>
  indexText('job', text, { sourceId, sourceType: 'job_posting', owner, metadata });

const indexLearningText = (text, { sourceId, owner, metadata }) =>
  indexText('learning', text, { sourceId, sourceType: 'learning_roadmap', owner, metadata });

const indexInterviewText = (text, { sourceId, sourceType, owner, metadata }) =>
  indexText('interview', text, { sourceId, sourceType: sourceType || 'interview_session', owner, metadata });

const indexMarketText = (text, { sourceId, owner, metadata }) =>
  indexText('market', text, { sourceId, sourceType: 'market_trends_report', owner, metadata });

module.exports = {
  indexText,
  deleteChunksForSource,
  indexResumeText,
  indexJobText,
  indexLearningText,
  indexInterviewText,
  indexMarketText,
  CHUNK_MODELS_BY_DOMAIN,
};
