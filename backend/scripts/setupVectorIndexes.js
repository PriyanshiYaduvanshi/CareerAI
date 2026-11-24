// scripts/setupVectorIndexes.js
//
// One-off setup script: creates the Atlas Vector Search index required by
// services/vectorSearchService.js on each of the five chunk collections
// (resume_chunks, job_chunks, learning_chunks, interview_chunks,
// market_chunks) AND on the learning_resources catalog collection
// (models/LearningResource.js). Index creation is an Atlas Search Admin
// operation, not something a Mongoose schema/index() call can declare,
// so it lives here as a script rather than in the model files.
//
// Run once per environment after MONGO_URI is configured:
//
//   node scripts/setupVectorIndexes.js
//
// Safe to re-run — an index that already exists is skipped, not
// recreated or failed on. Requires a MongoDB Atlas cluster with Atlas
// Search enabled (M10+, Dedicated/Serverless, or Flex); this will not
// work against a local `mongod` or an M0 shared-tier cluster without
// Search support.

require('dotenv').config();
const mongoose = require('mongoose');
const { EMBEDDING_DIMENSIONS } = require('../services/embeddingService');
const { VECTOR_INDEX_NAME } = require('../services/vectorSearchService');

const CHUNK_COLLECTIONS = ['resume_chunks', 'job_chunks', 'learning_chunks', 'interview_chunks', 'market_chunks'];

// learning_resources isn't a chunk collection (see
// models/LearningResource.js's header comment for why it's separate),
// so it gets its own filter-field set below instead of being folded into
// CHUNK_COLLECTIONS: there's no `owner`/`sourceType`/`section` on a
// catalog resource, but there IS `provider`/`resourceType`/`difficulty`,
// which services/learningResourceRetrievalService.js's `filter` option
// needs pushed down into the vector search the same way retrievalService
// does for the chunk collections.
const RESOURCE_COLLECTIONS = ['learning_resources'];

// Filter fields differ per collection family (chunk vs. catalog resource)
// — the vector field itself (`embedding`, 768-dim cosine) is identical
// everywhere, matching text-embedding-004's output.
const CHUNK_FILTER_FIELDS = ['owner', 'sourceType', 'section'];
const RESOURCE_FILTER_FIELDS = ['provider', 'resourceType', 'difficulty', 'isActive'];

const buildIndexDefinition = (filterFields = CHUNK_FILTER_FIELDS) => ({
  name: VECTOR_INDEX_NAME,
  type: 'vectorSearch',
  definition: {
    fields: [
      { type: 'vector', path: 'embedding', numDimensions: EMBEDDING_DIMENSIONS, similarity: 'cosine' },
      ...filterFields.map((path) => ({ type: 'filter', path })),
    ],
  },
});

const createIndexOn = async (db, collectionName, filterFields) => {
  try {
    await db.command({
      createSearchIndexes: collectionName,
      indexes: [buildIndexDefinition(filterFields)],
    });
    console.log(`✅ Vector index "${VECTOR_INDEX_NAME}" requested on ${collectionName}`);
  } catch (err) {
    if (/already exists/i.test(err.message)) {
      console.log(`↷ Vector index "${VECTOR_INDEX_NAME}" already exists on ${collectionName}, skipping`);
    } else {
      console.error(`❌ Failed to create vector index on ${collectionName}:`, err.message);
    }
  }
};

const setupVectorIndexes = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  for (const collectionName of CHUNK_COLLECTIONS) {
    await createIndexOn(db, collectionName, CHUNK_FILTER_FIELDS);
  }
  for (const collectionName of RESOURCE_COLLECTIONS) {
    await createIndexOn(db, collectionName, RESOURCE_FILTER_FIELDS);
  }

  await mongoose.disconnect();
};

if (require.main === module) {
  setupVectorIndexes()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Vector index setup failed:', err);
      process.exit(1);
    });
}

module.exports = {
  setupVectorIndexes,
  buildIndexDefinition,
  CHUNK_COLLECTIONS,
  RESOURCE_COLLECTIONS,
  CHUNK_FILTER_FIELDS,
  RESOURCE_FILTER_FIELDS,
};
