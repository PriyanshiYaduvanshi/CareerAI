// services/retrievalService.js - the read path of the RAG layer
//
// WHY THIS FILE EXISTS
// ---------------------
// Wraps embeddingService + vectorSearchService behind a single call per
// domain: embed the caller's query text, run $vectorSearch against the
// right chunk collection, and hand back both the raw matches (for
// callers that want to shape their own response) and a ready-to-use
// "grounding block" string.
//
// That grounding block follows the exact same contract aiService.js
// already uses by hand for ATS scoring and roadmap generation: a
// labelled list of already-known facts that the prompt tells the LLM to
// ground its answer in and never contradict or invent around. Any agent
// that adopts retrieval keeps the codebase's existing "retrieve/compute
// first, narrate second" pattern instead of introducing a second,
// looser way of grounding a prompt.

const { embedText } = require('./embeddingService');
const { vectorSearch } = require('./vectorSearchService');
const { CHUNK_MODELS_BY_DOMAIN } = require('./chunkService');

const DEFAULT_LIMIT = 5;

/**
 * Retrieve the most relevant chunks for a query within one domain.
 *
 * @param {'resume'|'job'|'learning'|'interview'|'market'} domain
 * @param {string} queryText
 * @param {Object} [options]
 * @param {Object} [options.filter] - Mongo/Atlas pre-filter, e.g. { owner: userId }
 * @param {number} [options.limit] - default 5
 * @param {number} [options.minScore] - drop matches below this similarity score
 * @returns {Promise<Array<Object>>}
 */
const retrieveChunks = async (domain, queryText, options = {}) => {
  const ChunkModel = CHUNK_MODELS_BY_DOMAIN[domain];
  if (!ChunkModel) throw new Error(`Unknown RAG domain: ${domain}`);
  if (!queryText || !queryText.trim()) return [];

  const queryEmbedding = await embedText(queryText);
  return vectorSearch(ChunkModel, queryEmbedding, {
    limit: options.limit || DEFAULT_LIMIT,
    filter: options.filter,
    minScore: options.minScore,
  });
};

/**
 * Same as retrieveChunks, but also renders the matches into a single
 * grounding string ready to drop straight into an aiService prompt, e.g.:
 *
 *   [market] (relevance 0.87): Cloud and AI-adjacent skills saw the sharpest demand increase this year...
 *   [market] (relevance 0.81): Bengaluru and Hyderabad remain the top two hiring hubs for this role...
 *
 * Returns an empty context ('') when nothing relevant is found, so
 * callers can simply skip adding a grounding block to their prompt
 * rather than special-casing "no results."
 *
 * @param {'resume'|'job'|'learning'|'interview'|'market'} domain
 * @param {string} queryText
 * @param {Object} [options] - same as retrieveChunks
 * @returns {Promise<{matches: Array<Object>, context: string}>}
 */
const retrieveGroundingContext = async (domain, queryText, options = {}) => {
  const matches = await retrieveChunks(domain, queryText, options);
  if (!matches.length) return { matches: [], context: '' };

  const context = matches
    .map((m) => `[${domain}] (relevance ${m.score.toFixed(2)}): ${m.text}`)
    .join('\n');

  return { matches, context };
};

/**
 * Same read path as `retrieveGroundingContext`, but for SEVERAL domains at
 * once against the SAME query text — e.g. agents/orchestrator/ragContext.js
 * fanning one chat message out across resume/job/learning/interview/market
 * chunks. Calling `retrieveGroundingContext` once per domain would embed
 * `queryText` once per domain too, even though it's the exact same text
 * every time — for a 5-domain fan-out that's 5 Gemini embedding calls to
 * answer one question. This embeds ONCE and reuses that single vector for
 * every domain's `$vectorSearch`, so an N-domain fan-out costs exactly 1
 * embedding call no matter how large N is.
 *
 * Each domain's vector search still runs independently via
 * `Promise.allSettled` — one domain being empty/erroring (e.g. no data
 * indexed yet) never blocks the others, same resilience as calling
 * `retrieveGroundingContext` per domain would have given.
 *
 * @param {Array<'resume'|'job'|'learning'|'interview'|'market'>} domains
 * @param {string} queryText
 * @param {Object<string, {filter?: Object, limit?: number, minScore?: number}>} [optionsByDomain] - per-domain options, same shape as retrieveChunks' `options`
 * @returns {Promise<Object<string, {matches: Array<Object>, context: string}>>}
 */
const retrieveGroundingContextForDomains = async (domains, queryText, optionsByDomain = {}) => {
  if (!Array.isArray(domains) || !domains.length || !queryText || !queryText.trim()) {
    return Object.fromEntries((domains || []).map((d) => [d, { matches: [], context: '' }]));
  }

  // The one embedding call this whole batch needs — everything below reuses it.
  const queryEmbedding = await embedText(queryText);

  const settled = await Promise.allSettled(
    domains.map((domain) => {
      const ChunkModel = CHUNK_MODELS_BY_DOMAIN[domain];
      if (!ChunkModel) return Promise.reject(new Error(`Unknown RAG domain: ${domain}`));
      const options = optionsByDomain[domain] || {};
      return vectorSearch(ChunkModel, queryEmbedding, {
        limit: options.limit || DEFAULT_LIMIT,
        filter: options.filter,
        minScore: options.minScore,
      }).then((matches) => ({
        matches,
        context: matches.length
          ? matches.map((m) => `[${domain}] (relevance ${m.score.toFixed(2)}): ${m.text}`).join('\n')
          : '',
      }));
    })
  );

  const byDomain = {};
  domains.forEach((domain, i) => {
    const outcome = settled[i];
    byDomain[domain] = outcome.status === 'fulfilled' ? outcome.value : { matches: [], context: '' };
  });
  return byDomain;
};

module.exports = { retrieveChunks, retrieveGroundingContext, retrieveGroundingContextForDomains };
