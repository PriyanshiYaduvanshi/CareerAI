// services/embeddingService.js - Google text-embedding-004 embedding generation
//
// WHY THIS FILE EXISTS
// ---------------------
// This is the embedding-generation counterpart to utils/aiService.js's
// callGemini/callGroq chat helpers, but for vectors instead of text: it
// turns a chunk of text (see utils/textChunker.js) into the 768-dimension
// vector that gets stored on a chunk document (see models/*Chunk.js) and
// searched via services/vectorSearchService.js.
//
// It intentionally reuses the same GEMINI_API_KEY already configured for
// aiService.js's chat calls — text-embedding-004 is served from the same
// Google Generative Language API, so no new credential or config is
// needed to turn this RAG layer on. The `@google/generative-ai` package
// is lazily required inside the functions below, mirroring the exact
// pattern aiService.callGemini already uses for the same package.
//
// There's deliberately no Groq-style fallback provider here: Groq doesn't
// serve an embeddings endpoint today, so a missing/failing Gemini call
// simply surfaces a clear error — callers (services/chunkService.js) are
// expected to treat indexing as best-effort and never let it block the
// primary request, the same way a failed AI narrative call already
// degrades to a deterministic fallback elsewhere in this codebase.

const { withRetry } = require('../utils/retry');
const logger = require('../utils/logger').scope('embeddingService');

const CANDIDATE_MODELS = [
  process.env.EMBEDDING_MODEL,
  'gemini-embedding-001',
  'text-embedding-004',
].filter(Boolean);
const EMBEDDING_DIMENSIONS = 768;

const isModelUnavailableError = (err) => {
  const status = err?.response?.status || err?.status;
  const message = String(err?.message || '');
  return status === 404 || /not found for API version|is not supported for/i.test(message);
};

// Gemini's batchEmbedContents accepts up to 100 requests per call — texts
// are grouped into batches of this size so indexing a long document (many
// chunks) costs a handful of round trips instead of one per chunk.
const BATCH_SIZE = 100;

let cachedGenAI = null;
let cachedModelName = null;
let cachedModelInstance = null;

const getGenAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables');
  if (!cachedGenAI) {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    cachedGenAI = new GoogleGenerativeAI(apiKey);
  }
  return cachedGenAI;
};

const resolveModel = async (forceRefresh = false) => {
  if (cachedModelInstance && !forceRefresh) {
    return { name: cachedModelName, model: cachedModelInstance };
  }
  const genAI = getGenAI();
  let lastErr;
  for (const name of CANDIDATE_MODELS) {
    try {
      const model = genAI.getGenerativeModel({ model: name });
      await model.embedContent({
        content: { role: 'user', parts: [{ text: 'ping' }] },
        outputDimensionality: EMBEDDING_DIMENSIONS,
      });
      cachedModelName = name;
      cachedModelInstance = model;
      logger.info(`Using embedding model: ${name}`);
      return { name, model };
    } catch (err) {
      lastErr = err;
      if (!isModelUnavailableError(err)) throw err;
      logger.warn(`Embedding model "${name}" unavailable, trying next candidate:`, err.message);
    }
  }
  throw new Error(`No usable embedding model found. Tried: ${CANDIDATE_MODELS.join(', ')}. Last error: ${lastErr?.message}`);
};

/**
 * Embed a single piece of text.
 * @param {string} text
 * @returns {Promise<number[]>} a 768-dimension vector
 */

const embedText = async (text) => {
  let { name, model } = await resolveModel();
  const doEmbed = () =>
    model.embedContent({
      content: { role: 'user', parts: [{ text }] },
      outputDimensionality: EMBEDDING_DIMENSIONS,
    });

  let result;
  try {
    result = await withRetry(doEmbed, { label: 'Gemini embedContent' });
  } catch (err) {
    if (!isModelUnavailableError(err)) throw err;
    ({ name, model } = await resolveModel(true));
    result = await withRetry(doEmbed, { label: 'Gemini embedContent (post-fallback)' });
  }

  const values = result?.embedding?.values;
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`Unexpected embedding response shape from ${name}`);
  }
  return values;
};

/**
 * Embed many pieces of text, batching into groups of BATCH_SIZE via
 * batchEmbedContents to keep round trips low. Preserves input order. If a
 * batch call fails for any reason (rate limit, SDK/version mismatch on
 * batch support, etc.) it's retried one item at a time via embedText so a
 * single bad chunk can't fail the whole indexing job.
 * @param {string[]} texts
 * @returns {Promise<number[][]>}
 */
const embedTexts = async (texts) => {
  if (!texts.length) return [];
  let { name, model } = await resolveModel();
  const results = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const response = await withRetry(
        () => model.batchEmbedContents({
          requests: batch.map((text) => ({
            model: `models/${name}`,
            content: { role: 'user', parts: [{ text }] },
            outputDimensionality: EMBEDDING_DIMENSIONS,
          })),
        }),
        { label: 'Gemini batchEmbedContents' }
      );
      const embeddings = response?.embeddings;
      if (!Array.isArray(embeddings) || embeddings.length !== batch.length) {
        throw new Error('batchEmbedContents returned an unexpected number of embeddings');
      }
      results.push(...embeddings.map((e) => e.values));
    } catch (err) {
      if (isModelUnavailableError(err)) {
        logger.warn(`Embedding model "${name}" was deprecated mid-run, switching model.`);
        ({ name, model } = await resolveModel(true));
      } else {
        logger.warn('batchEmbedContents failed, falling back to sequential embedText:', err.message);
      }
      for (const text of batch) {
        results.push(await embedText(text));
      }
    }
  }

  return results;
};

module.exports = { embedText, embedTexts, EMBEDDING_DIMENSIONS, getActiveEmbeddingModelName: () => cachedModelName };
