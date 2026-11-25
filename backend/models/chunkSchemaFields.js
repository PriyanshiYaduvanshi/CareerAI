// models/chunkSchemaFields.js
//
// Shared field set for the five RAG "chunk" collections (resume_chunks,
// job_chunks, learning_chunks, interview_chunks, market_chunks — see the
// individual model files in this directory).
//
// WHY THIS FILE EXISTS
// ---------------------
// Every chunk collection stores the same shape of thing — a slice of text
// carved out of a larger document by utils/textChunker.js, plus the
// text-embedding-004 vector for that slice — and only differs in what
// `sourceType` values are valid and which parent document `sourceId`
// points at. Factoring the common fields out here keeps the five model
// files small and guarantees every collection stays in sync on the parts
// that matter for vector search (the `embedding` field's shape) without
// five copies of the same validation logic.
//
// Per the "don't store embeddings inside the original documents" design
// requirement, NONE of these fields are ever added to User/Job/
// Application/Interview — chunk documents live only in their own
// collection, referencing the source document by `sourceId`.

const mongoose = require('mongoose');

// text-embedding-004 always returns a 768-dimension vector. This is
// duplicated (not imported) from services/embeddingService.js on purpose:
// models are the base layer of the app and shouldn't reach up into
// services/, so the same literal is documented in both places instead.
const EMBEDDING_DIMENSIONS = 768;

const baseChunkFields = {
  // The parent document this chunk was carved from (an Application, Job,
  // Interview, User, or a synthetic id for content that isn't persisted
  // as its own document, e.g. a generated market-trends report). Mixed
  // because the parent type varies by domain — see each model's
  // `sourceType` enum for what's actually stored here.
  sourceId: { type: mongoose.Schema.Types.Mixed, required: true, index: true },

  // Account this chunk is attributed/scoped to (candidate or business
  // user), when the domain has one. Lets retrieval be scoped to "this
  // user's own resume chunks" / "this business's own job chunks" instead
  // of searching across every user's data.
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

  // Detected section label from utils/textChunker.js's section-aware
  // splitter (e.g. 'experience', 'skills', 'responsibilities', 'phase',
  // 'question'), or 'general' when no section heading was detected and
  // the recursive fallback splitter was used on the whole text instead.
  section: { type: String, default: 'general' },

  // Position of this chunk within its source document's chunk sequence
  // (0-based), so callers can reconstruct reading order if needed.
  chunkIndex: { type: Number, required: true, default: 0 },

  // The actual chunk text that was embedded. Kept alongside the vector
  // so retrieval results are immediately usable as LLM grounding context
  // without a second lookup against the source document.
  text: { type: String, required: true },

  // Rough chars-per-token estimate (text.length / 4), stored for
  // diagnostics/cost-estimation only — never used in scoring.
  tokenEstimate: { type: Number, default: 0 },

  // The text-embedding-004 vector for `text`. Required and dimension-
  // checked so a malformed embedding can never silently land in the
  // collection and corrupt $vectorSearch results.
  embedding: {
    type: [Number],
    required: true,
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length === EMBEDDING_DIMENSIONS,
      message: `embedding must have exactly ${EMBEDDING_DIMENSIONS} dimensions (text-embedding-004)`,
    },
  },

  // Recorded so a future switch to a different embedding model can
  // coexist with (or safely replace) older chunks without guesswork.
  embeddingModel: { type: String, default: 'text-embedding-004' },

  // Free-form, domain-specific context that's cheap to filter/display
  // without joining back to the source document (e.g. { jobTitle,
  // company } on a job chunk, { targetRole } on a learning chunk).
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
};

module.exports = { baseChunkFields, EMBEDDING_DIMENSIONS };
