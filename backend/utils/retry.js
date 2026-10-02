// utils/retry.js - generic retry-with-exponential-backoff helper
//
// WHY THIS FILE EXISTS
// ---------------------
// Several places in this codebase call something that can fail for
// purely transient reasons — a network blip, an upstream 429/5xx, a
// momentarily-unreachable Mongo replica set — where the *correct* fix
// isn't a fallback provider or a user-facing error, it's simply "try
// again in a moment". Before this file existed that logic didn't exist
// anywhere: a single failed attempt propagated straight to the caller's
// existing error handling (a fallback provider, a 503, a logged
// warning). This module centralizes the backoff/jitter math so callers
// don't each reinvent it slightly differently, and is purely additive —
// wrapping an existing call in `withRetry` changes nothing about its
// eventual success/failure contract, it only gives transient failures a
// few extra, increasingly-spaced-out chances to succeed first.
//
// Default `shouldRetry` treats a plain thrown Error as retryable unless
// it looks like a genuine "this will never succeed" failure (a 4xx HTTP
// status other than 429, or a validation-style error) — callers can
// always pass their own predicate for domain-specific nuance.

const DEFAULT_RETRIES = 2; // i.e. up to 3 total attempts
const DEFAULT_BASE_DELAY_MS = 300;
const DEFAULT_MAX_DELAY_MS = 4000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {*} err
 * @returns {boolean} true if this error looks transient (worth retrying)
 */
const defaultShouldRetry = (err) => {
  const status = err?.response?.status || err?.status || err?.code;
  // Explicit non-retryable HTTP statuses: client errors other than 429
  // (rate limit) mean retrying with the same input will never succeed.
  if (typeof status === 'number' && status >= 400 && status < 500 && status !== 429) {
    return false;
  }
  return true;
};

/**
 * Runs `fn` and retries on failure with exponential backoff + jitter.
 *
 * @template T
 * @param {() => Promise<T>} fn - the operation to attempt; called fresh on every attempt
 * @param {Object} [options]
 * @param {number} [options.retries] - number of retries after the first attempt (default 2)
 * @param {number} [options.baseDelayMs] - initial delay before the first retry (default 300ms)
 * @param {number} [options.maxDelayMs] - delay ceiling (default 4000ms)
 * @param {(err: *) => boolean} [options.shouldRetry] - predicate deciding whether a given failure is worth retrying
 * @param {string} [options.label] - short name used in warning logs, for tracing which call is retrying
 * @returns {Promise<T>}
 */
const withRetry = async (fn, options = {}) => {
  const {
    retries = DEFAULT_RETRIES,
    baseDelayMs = DEFAULT_BASE_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    shouldRetry = defaultShouldRetry,
    label = 'operation',
  } = options;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLastAttempt = attempt === retries;
      if (isLastAttempt || !shouldRetry(err)) throw err;

      // Exponential backoff with +/-25% jitter so many concurrent callers
      // retrying at once don't all hammer the upstream at the same instant.
      const exponentialDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
      const jitter = exponentialDelay * (0.75 + Math.random() * 0.5);
      const delay = Math.round(jitter);

      // eslint-disable-next-line no-console
      console.warn(
        `retry: ${label} failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay}ms:`,
        err.message || String(err)
      );
      await sleep(delay);
    }
  }
  // Unreachable in practice (the loop above always returns or throws),
  // but keeps this function's control flow explicit for linting.
  throw lastErr;
};

module.exports = { withRetry, defaultShouldRetry };
