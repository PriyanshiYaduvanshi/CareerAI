// services/vectorSearchService.js - MongoDB Atlas Vector Search query wrapper
//
// WHY THIS FILE EXISTS
// ---------------------
// This is the one place `$vectorSearch` aggregation stages get built, so
// every one of the five chunk collections (resume_chunks, job_chunks,
// learning_chunks, interview_chunks, market_chunks) is queried the same
// way, against the same-named Atlas Search index. The index itself is
// created out-of-band by scripts/setupVectorIndexes.js (index creation is
// an Atlas Search Admin operation, not something a normal Mongoose schema
// can declare) — this module only ever queries it.
//
// Kept intentionally low-level and collection-agnostic: it doesn't know
// what a "resume" or "job" is, just how to run a vector search against
// whichever chunk Model it's given. services/retrievalService.js is the
// higher-level, domain-aware layer built on top of this one.

const VECTOR_INDEX_NAME = process.env.VECTOR_SEARCH_INDEX_NAME || 'vector_index';

const DEFAULT_LIMIT = 5;
// Atlas guidance for approximate nearest-neighbor search: request roughly
// 10x more candidates than the final limit so the ANN search has enough
// of a pool to return accurate top-K results.
const NUM_CANDIDATES_MULTIPLIER = 10;
const MIN_NUM_CANDIDATES = 50;

/**
 * Runs a $vectorSearch aggregation against a chunk collection.
 *
 * @param {import('mongoose').Model} ChunkModel - one of ResumeChunk/JobChunk/LearningChunk/InterviewChunk/MarketChunk
 * @param {number[]} queryEmbedding - 768-dim embedding of the search query (see services/embeddingService.js)
 * @param {Object} [options]
 * @param {Object} [options.filter] - optional Atlas Search pre-filter, e.g. { owner: userId }
 * @param {number} [options.limit] - max chunks to return (default 5)
 * @param {number} [options.numCandidates] - ANN candidate pool size (default ~10x limit)
 * @param {number} [options.minScore] - drop matches scoring below this threshold (0-1, cosine similarity)
 * @returns {Promise<Array<Object>>} matching chunk documents (embedding field omitted) with a `score` field
 */
const vectorSearch = async (ChunkModel, queryEmbedding, options = {}) => {
  const {
    filter = {},
    limit = DEFAULT_LIMIT,
    numCandidates = Math.max(limit * NUM_CANDIDATES_MULTIPLIER, MIN_NUM_CANDIDATES),
    minScore = 0,
  } = options;

  const pipeline = [
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates,
        limit,
        ...(Object.keys(filter).length ? { filter } : {}),
      },
    },
    {
      $project: {
        embedding: 0, // raw vectors are an internal implementation detail — never ship them back to callers
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ];

  const results = await ChunkModel.aggregate(pipeline);
  return minScore > 0 ? results.filter((r) => r.score >= minScore) : results;
};

module.exports = { vectorSearch, VECTOR_INDEX_NAME };
