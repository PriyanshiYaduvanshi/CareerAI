// utils/backgroundTask.js - run best-effort work after the response cycle
//
// WHY THIS FILE EXISTS
// ---------------------
// Several controllers kick off RAG embedding indexing (see
// services/chunkService.js) as a "best-effort side effect" — every call
// site already wraps it in try/catch and only logs on failure, since a
// slow/unavailable embeddings provider must never block resume upload,
// job posting, interview practice, etc. But every one of those call
// sites still `await`s the indexing call *before* sending the response,
// so the request is held open for the full embedding round trip anyway
// (typically the slowest step in the request, since it calls out to the
// Gemini embeddings API) — the "never blocks" comment describes the
// error-handling contract, not the actual response latency.
//
// `runInBackground` fixes that: it schedules `fn` with `setImmediate` so
// it always starts after the current synchronous work (including
// `res.json(...)`) has already flushed, and swallows/logs any failure
// the exact same way the call sites already did. The eventual side
// effect (chunks indexed, or a logged failure) is unchanged — only the
// timing relative to the HTTP response changes.

const logger = require('./logger');

/**
 * @param {() => Promise<*>} fn - the async work to run after this tick
 * @param {string} label - short description used in the failure log line
 */
const runInBackground = (fn, label) => {
  setImmediate(() => {
    Promise.resolve()
      .then(fn)
      .catch((err) => {
        logger.error(`background task failed [${label}]:`, err.message || String(err));
      });
  });
};

module.exports = { runInBackground };
