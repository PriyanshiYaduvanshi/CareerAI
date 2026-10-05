// models/LearningResource.js
//
// WHY THIS FILE EXISTS
// ---------------------
// Backs the new `learning_resources` collection: a catalog of real,
// individually-embedded learning resources (courses, projects,
// certifications) pulled from Coursera, IBM SkillsBuild, Infosys
// Springboard, Udemy, and GitHub — see data/learningResourceCatalog.js
// for the seed data and scripts/seedLearningResources.js for how it gets
// embedded and loaded.
//
// This is deliberately a SEPARATE collection from learning_chunks
// (models/LearningChunk.js), not a sixth `sourceType` bolted onto it:
// learning_chunks holds fragments carved out of *generated* content (a
// user's own past roadmaps — see services/learningRoadmapIndexService.js)
// via utils/textChunker.js's section-aware splitter, scoped per-owner.
// learning_resources holds whole catalog entries — one document per
// course/project/certification, not owned by any single user, meant to
// be searched by every candidate. Conflating the two would mean every
// vector search against a user's own roadmap history would also have to
// filter out (or risk surfacing) unrelated catalog entries, and vice
// versa. Reused rather than duplicated: the same embedding dimension
// convention and validation pattern as models/chunkSchemaFields.js, the
// same services/embeddingService.js (text-embedding-004) for generating
// vectors, and the same services/vectorSearchService.js $vectorSearch
// wrapper for querying them — see services/learningResourceRetrievalService.js.
//
// EXTENSIBILITY — the schema is intentionally permissive where the brief
// asks for it to be:
//   - `provider` and `resourceType` are plain Strings (with a documented,
//     non-exhaustive set of known values exported below) rather than a
//     hard Mongoose `enum`, so a 6th provider or a new resource type
//     (e.g. "specialization", "bootcamp") can be added by seeding data
//     alone — no schema migration required.
//   - `metadata` is a free-form Mixed bag for provider-specific extras
//     that don't deserve a first-class column (e.g. GitHub star count,
//     an instructor name, a rating) — the same pattern
//     chunkSchemaFields.js already uses for the same reason.
const mongoose = require('mongoose');
const { EMBEDDING_DIMENSIONS } = require('./chunkSchemaFields');

// Known values as of this phase — informational only (see EXTENSIBILITY
// note above), used by data/learningResourceCatalog.js and validated
// nowhere at the schema level so new providers/types never require a
// migration.
const KNOWN_PROVIDERS = ['Coursera', 'IBM SkillsBuild', 'Infosys Springboard', 'Udemy', 'GitHub'];
const KNOWN_RESOURCE_TYPES = ['course', 'project', 'certification'];
const DIFFICULTY_LEVELS = ['beginner', 'intermediate', 'advanced'];

const learningResourceSchema = new mongoose.Schema(
  {
    // ── Core catalog fields ────────────────────────────────────────────
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    // 'course' | 'project' | 'certification' today, extensible — see
    // KNOWN_RESOURCE_TYPES above. Kept as a plain String (indexed, not
    // enum-constrained) on purpose.
    resourceType: { type: String, required: true, default: 'course', index: true },

    // e.g. 'Coursera', 'IBM SkillsBuild', 'Infosys Springboard', 'Udemy',
    // 'GitHub' — see KNOWN_PROVIDERS above. Plain String, not enum, for
    // the same extensibility reason.
    provider: { type: String, required: true, trim: true, index: true },

    // Finer-grained attribution within a provider (an instructor, an
    // organization, a repo owner) — optional, display-only.
    author: { type: String, default: '', trim: true },

    url: { type: String, required: true, trim: true },

    // Canonical, lower-cased skill tags this resource teaches/practices —
    // matched against missing-skill queries by
    // services/learningResourceRetrievalService.js and (for exact-tag
    // filtering elsewhere) utils/courseRecommendation.js's normalizeSkill().
    skills: {
      type: [String],
      required: true,
      validate: { validator: (arr) => Array.isArray(arr) && arr.length > 0, message: 'skills must have at least one entry' },
      index: true,
    },

    // Job titles / roles this resource is particularly relevant for
    // (e.g. ['frontend developer', 'full stack developer']) — optional,
    // lets retrieval bias toward a stated target job even when the
    // resource's `skills` tags alone wouldn't disambiguate.
    targetRoles: { type: [String], default: [] },

    difficulty: { type: String, enum: DIFFICULTY_LEVELS, default: 'beginner', index: true },

    durationHours: { type: Number, default: null },
    weeklyHours: { type: Number, default: null },

    // Mirrors data/courseCatalog.js's existing pricing shape so the two
    // stay compatible if course data is ever consolidated later.
    pricing: {
      isFree: { type: Boolean, default: false },
      priceINR: { type: Number, default: 0 },
      billing: { type: String, default: '' },
      note: { type: String, default: '' },
    },

    certificationOffered: { type: Boolean, default: false },

    // Lets a resource be de-listed from retrieval (a dead link, a
    // deprecated course) without deleting its document/history.
    isActive: { type: Boolean, default: true, index: true },

    // Stable identity per provider so re-running
    // scripts/seedLearningResources.js upserts instead of duplicating —
    // see the compound unique index below.
    externalId: { type: String, required: true, trim: true },

    // The exact text that was embedded (see
    // services/learningResourceService.js#composeResourceEmbeddingText),
    // kept alongside the vector for the same reason chunk documents keep
    // their source `text` — immediately usable as LLM grounding context
    // without a second lookup, and lets a future re-embed job detect
    // drift by recomputing and diffing against what's stored.
    sourceText: { type: String, required: true },

    // Same 768-dimension text-embedding-004 vector convention as every
    // chunk collection (models/chunkSchemaFields.js) — duplicated rather
    // than imported for the same "models don't reach into services/"
    // reason chunkSchemaFields.js documents for its own copy.
    embedding: {
      type: [Number],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length === EMBEDDING_DIMENSIONS,
        message: `embedding must have exactly ${EMBEDDING_DIMENSIONS} dimensions (text-embedding-004)`,
      },
    },
    embeddingModel: { type: String, default: 'text-embedding-004' },

    // Free-form, provider-specific extras — see EXTENSIBILITY note above.
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// One document per real-world resource per provider — re-seeding updates
// it in place instead of accumulating duplicates.
learningResourceSchema.index({ provider: 1, externalId: 1 }, { unique: true });

module.exports = mongoose.model('LearningResource', learningResourceSchema, 'learning_resources');
module.exports.KNOWN_PROVIDERS = KNOWN_PROVIDERS;
module.exports.KNOWN_RESOURCE_TYPES = KNOWN_RESOURCE_TYPES;
module.exports.DIFFICULTY_LEVELS = DIFFICULTY_LEVELS;
