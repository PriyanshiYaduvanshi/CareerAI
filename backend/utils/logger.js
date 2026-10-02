// utils/logger.js - lightweight structured logger
//
// WHY THIS FILE EXISTS
// ---------------------
// The codebase logs almost entirely via bare console.log/warn/error
// calls scattered across controllers/services, each with its own ad-hoc
// message shape. That's fine for behavior (nothing here is user-facing —
// server logs aren't part of any API response) but makes it hard to grep
// logs by severity or module in production. This wraps console.* with a
// consistent `[timestamp] [LEVEL] [module] message` shape and a
// LOG_LEVEL env var to silence debug/info noise in production, without
// changing what any request/response actually returns.
//
// Deliberately dependency-free (no winston/pino) — this app has no
// logging infrastructure today, and pulling in a new dependency for
// what is, functionally, a formatted console.log wrapper would be a lot
// of new surface area for little benefit at this scale.

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

const format = (level, scope, args) => {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]${scope ? ` [${scope}]` : ''}`;
  return [prefix, ...args];
};

/**
 * Creates a logger scoped to a module name (shown in every line it logs),
 * e.g. `const log = require('../utils/logger').scope('aiService');`
 * Falling back to the unscoped root logger (just `logger.info(...)`) is
 * also supported for one-off call sites.
 */
const makeLogger = (scope) => ({
  error: (...args) => {
    if (currentLevel >= LEVELS.error) console.error(...format('error', scope, args));
  },
  warn: (...args) => {
    if (currentLevel >= LEVELS.warn) console.warn(...format('warn', scope, args));
  },
  info: (...args) => {
    if (currentLevel >= LEVELS.info) console.log(...format('info', scope, args));
  },
  debug: (...args) => {
    if (currentLevel >= LEVELS.debug) console.log(...format('debug', scope, args));
  },
});

const root = makeLogger();
root.scope = makeLogger;

module.exports = root;
