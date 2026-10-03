// utils/validators.js
// ============================================
// Single source of truth for field-level validation rules that are shared
// across multiple routes/controllers/models (phone, LinkedIn URL, etc).
// Mirrors frontend/src/utils/validators.js so both layers reject exactly
// the same input — server-side is the enforced layer, client-side is only
// there to give the user immediate feedback before a round trip.
// ============================================

// ── Indian phone numbers ────────────────────────────────────────────────
// Rule: exactly 10 digits, first digit 6/7/8/9. We tolerate common ways
// people type a number (spaces, dashes, parens, a leading +91/91/0) by
// stripping those *before* checking the core rule — the rule itself never
// loosens.
const INDIAN_PHONE_CORE_RE = /^[6-9]\d{9}$/;

// Strips formatting characters and, if present, a leading country code
// (+91 / 91) or trunk prefix (0), leaving just the digits to validate.
const normalizeIndianPhone = (raw) => {
  if (raw === null || raw === undefined) return '';
  let digits = String(raw).trim().replace(/[\s\-().]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return digits;
};

const isValidIndianPhone = (raw) => INDIAN_PHONE_CORE_RE.test(normalizeIndianPhone(raw));

const PHONE_ERROR_MESSAGE =
  'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9';

// ── LinkedIn profile URLs ───────────────────────────────────────────────
// Rule: only individual profile URLs (…/in/<handle>), not company pages,
// job posts, feed links, or arbitrary linkedin.com URLs. Optional
// http/https, optional www or a 2-3 letter locale subdomain (e.g. in.,
// uk.), optional trailing slash and query string.
const LINKEDIN_PROFILE_RE =
  /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%.]{3,100}\/?(\?[^\s]*)?(#[^\s]*)?$/i;

const isValidLinkedInUrl = (raw) => {
  if (raw === null || raw === undefined) return false;
  const value = String(raw).trim();
  if (!value) return false;
  return LINKEDIN_PROFILE_RE.test(value);
};

const LINKEDIN_ERROR_MESSAGE =
  'Enter a valid LinkedIn profile URL (e.g. https://www.linkedin.com/in/yourname)';

module.exports = {
  INDIAN_PHONE_CORE_RE,
  normalizeIndianPhone,
  isValidIndianPhone,
  PHONE_ERROR_MESSAGE,
  LINKEDIN_PROFILE_RE,
  isValidLinkedInUrl,
  LINKEDIN_ERROR_MESSAGE,
};
