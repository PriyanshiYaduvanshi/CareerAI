// middleware/apiCache.js - short-TTL in-memory response cache for GET routes
//
// WHY THIS FILE EXISTS
// ---------------------
// A handful of GET endpoints (candidate-facing job listing/search) run an
// identical query for every caller within the same few seconds — the
// response depends only on the query string, not on which user is
// asking, so re-running the full find/filter/sort/paginate pipeline on
// every single request is wasted work under any real traffic. This is a
// process-local (per-instance), in-memory cache keyed by the request's
// full URL (path + query string) with a short TTL — long enough to
// collapse a burst of near-simultaneous requests (e.g. a page load that
// fires several of these), short enough that a newly posted/closed job
// is never stale for more than a few seconds.
//
// Deliberately NOT the same mechanism as services/cacheService.js
// (which is Mongo-backed with hour-long TTLs for slow, rate-limited
// third-party API calls) — that cache is for expensive *external* data;
// this one is for cheap-but-frequent *internal* reads, where a Mongo
// round trip to check a cache would often cost more than just re-running
// the query. An in-memory Map is the right tool at this scale (single
// process); a multi-instance deployment would want this backed by Redis
// instead, but that's a new piece of infrastructure this app doesn't
// have today, and out of scope for changing existing behavior.
//
// Only ever applied to routes whose response doesn't vary by identity
// (see routes/jobs.js) — never to anything that reads req.user-specific
// data, so caching can never leak one user's personalized response to
// another.

const store = new Map(); // key -> { body, expiresAt }

/**
 * @param {number} ttlMs - how long a cached response stays valid
 * @returns {import('express').RequestHandler}
 */
const cacheGet = (ttlMs) => (req, res, next) => {
  if (req.method !== 'GET') return next();

  const key = req.originalUrl;
  const cached = store.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    res.set('X-Cache', 'HIT');
    return res.json(cached.body);
  }

  // Wrap res.json so a successful response gets captured for next time,
  // without altering what's actually sent to this caller.
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      store.set(key, { body, expiresAt: now + ttlMs });
    }
    res.set('X-Cache', 'MISS');
    return originalJson(body);
  };

  next();
};

/** Clears every cached entry (e.g. for tests, or a future admin action). */
const clearCache = () => store.clear();

module.exports = { cacheGet, clearCache };
