// services/learningResourceService.js - write path for the learning resource catalog
//
// WHY THIS FILE EXISTS
// ---------------------
// This is services/chunkService.js's counterpart for the
// `learning_resources` collection (models/LearningResource.js): it turns
// a catalog entry (see data/learningResourceCatalog.js) into an embedded,
// searchable document. It's a sibling to chunkService, not a mode of it,
// because a learning resource isn't a fragment carved out of a longer
// document by utils/textChunker.js — it's already a whole, atomic unit
// (one course, one project, one certification) that gets embedded as a
// single vector, so there's no chunking step here.
//
// Reused, not duplicated:
//   - services/embeddingService.js's embedTexts() — the exact same
//     text-embedding-004 batching helper every chunk collection uses.
//   - models/chunkSchemaFields.js's EMBEDDING_DIMENSIONS (via
//     models/LearningResource.js) — same vector shape/validation
//     convention as every other RAG collection in this codebase.
//
// Upserts are keyed on { provider, externalId } (see
// models/LearningResource.js's compound unique index) so re-running
// scripts/seedLearningResources.js is idempotent — safe to schedule as a
// periodic catalog refresh later without duplicating documents.

const { embedTexts } = require('./embeddingService');
const LearningResource = require('../models/LearningResource');

/**
 * Composes the exact text that gets embedded for a resource, weaving in
 * every field a semantic query is likely to be matched against (title,
 * description, provider/type, skills, target roles, difficulty) so
 * retrieval on any of those axes has a chance of surfacing this resource
 * — mirrors services/learningRoadmapIndexService.js's buildRoadmapIndexText
 * in spirit: one composition helper, reused everywhere a resource needs
 * to become text.
 *
 * @param {Object} resource - a data/learningResourceCatalog.js entry (or equivalent)
 * @returns {string}
 */
const composeResourceEmbeddingText = (resource) => {
  const parts = [
    `${resource.title} (${resource.resourceType} on ${resource.provider})`,
    resource.description || '',
    `Skills covered: ${(resource.skills || []).join(', ')}`,
    resource.targetRoles?.length ? `Relevant for roles: ${resource.targetRoles.join(', ')}` : '',
    `Difficulty: ${resource.difficulty || 'beginner'}`,
    resource.certificationOffered ? 'Offers a certificate/credential on completion.' : '',
  ];
  return parts.filter(Boolean).join('\n');
};

/**
 * Upserts a batch of catalog entries into `learning_resources`, embedding
 * each one's composed text in as few round trips as possible (embedTexts
 * batches internally — see services/embeddingService.js).
 *
 * Best-effort per item is NOT used here (unlike chunkService's indexing
 * calls from request handlers): this is a data-loading/seeding path run
 * out-of-band by scripts/seedLearningResources.js, not a side effect of
 * a live user request, so a hard failure surfacing to the caller (who
 * can log/retry) is the right behavior rather than silently degrading.
 *
 * @param {Array<Object>} resources - entries shaped like data/learningResourceCatalog.js
 * @returns {Promise<{indexed: number, updated: number, failed: Array<{externalId: string, error: string}>}>}
 */
const indexLearningResources = async (resources = []) => {
  if (!resources.length) return { indexed: 0, updated: 0, failed: [] };

  const texts = resources.map(composeResourceEmbeddingText);
  const embeddings = await embedTexts(texts);

  let indexed = 0;
  let updated = 0;
  const failed = [];

  for (let i = 0; i < resources.length; i += 1) {
    const resource = resources[i];
    try {
      const doc = {
        title: resource.title,
        description: resource.description || '',
        resourceType: resource.resourceType,
        provider: resource.provider,
        author: resource.author || '',
        url: resource.url,
        skills: (resource.skills || []).map((s) => String(s).toLowerCase().trim()),
        targetRoles: (resource.targetRoles || []).map((r) => String(r).toLowerCase().trim()),
        difficulty: resource.difficulty || 'beginner',
        durationHours: resource.durationHours ?? null,
        weeklyHours: resource.weeklyHours ?? null,
        pricing: resource.pricing || {},
        certificationOffered: !!resource.certificationOffered,
        isActive: resource.isActive !== false,
        externalId: resource.externalId,
        sourceText: texts[i],
        embedding: embeddings[i],
        metadata: resource.metadata || {},
      };

      const result = await LearningResource.findOneAndUpdate(
        { provider: resource.provider, externalId: resource.externalId },
        { $set: doc },
        { upsert: true, new: true, rawResult: true }
      );

      if (result.lastErrorObject?.updatedExisting) updated += 1;
      else indexed += 1;
    } catch (err) {
      failed.push({ externalId: resource.externalId, error: err.message });
    }
  }

  return { indexed, updated, failed };
};

/**
 * Convenience single-resource wrapper around indexLearningResources, for
 * call sites (e.g. an admin/business flow adding one resource) that
 * don't have a batch to load.
 * @param {Object} resource
 */
const upsertLearningResource = async (resource) => {
  const { indexed, updated, failed } = await indexLearningResources([resource]);
  if (failed.length) throw new Error(failed[0].error);
  return { created: indexed > 0, updated: updated > 0 };
};

/**
 * Soft-deletes a resource (isActive: false) so it stops surfacing in
 * retrieval without losing its document/history — e.g. a dead link or a
 * deprecated course. Mirrors chunkService.deleteChunksForSource's intent
 * of "make it unreachable", but resources are shared catalog data (not
 * owned by a single user's source document), so a soft flag is used
 * instead of a hard delete.
 * @param {string} provider
 * @param {string} externalId
 */
const deactivateLearningResource = (provider, externalId) =>
  LearningResource.updateOne({ provider, externalId }, { $set: { isActive: false } });

module.exports = {
  composeResourceEmbeddingText,
  indexLearningResources,
  upsertLearningResource,
  deactivateLearningResource,
};
