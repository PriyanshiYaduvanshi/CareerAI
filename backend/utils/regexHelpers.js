// utils/regexHelpers.js
// Escapes user-supplied text before it's used inside a `new RegExp(...)`
// call. Without this, search input containing regex metacharacters
// (e.g. `(a+)+$`) can be used to build catastrophic-backtracking patterns
// (ReDoS) or throw on malformed input — both are real attack surfaces any
// time a raw query/search string reaches RegExp() unescaped.
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Builds a case-insensitive "contains" RegExp from untrusted input safely.
const safeContainsRegex = (value) => new RegExp(escapeRegex(String(value ?? '')), 'i');

module.exports = { escapeRegex, safeContainsRegex };
