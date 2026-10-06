// src/utils/validators.js
// ============================================
// Single source of truth for field-level validation used by every form in
// the app (ApplyJobModal, ProfilePage, ...). Mirrors
// backend/utils/validators.js rule-for-rule — the backend is the layer
// that's actually enforced; this one just gives the user instant feedback
// before a request ever goes out.
// ============================================

// ── Indian phone numbers ────────────────────────────────────────────────
// Rule: exactly 10 digits, first digit 6/7/8/9. We tolerate common ways
// people type a number (spaces, dashes, parens, a leading +91/91/0) by
// stripping those *before* checking the core rule — the rule itself never
// loosens.
export const INDIAN_PHONE_CORE_RE = /^[6-9]\d{9}$/;

export const normalizeIndianPhone = (raw) => {
  if (raw === null || raw === undefined) return '';
  let digits = String(raw).trim().replace(/[\s\-().]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  else if (digits.startsWith('0') && digits.length === 11) digits = digits.slice(1);
  return digits;
};

export const isValidIndianPhone = (raw) => INDIAN_PHONE_CORE_RE.test(normalizeIndianPhone(raw));

export const PHONE_ERROR_MESSAGE =
  'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8, or 9';

// ── LinkedIn profile URLs ───────────────────────────────────────────────
// Rule: only individual profile URLs (…/in/<handle>), not company pages,
// job posts, feed links, or arbitrary linkedin.com URLs.
export const LINKEDIN_PROFILE_RE =
  /^https?:\/\/([a-z]{2,3}\.)?linkedin\.com\/in\/[a-zA-Z0-9\-_%.]{3,100}\/?(\?[^\s]*)?(#[^\s]*)?$/i;

export const isValidLinkedInUrl = (raw) => {
  if (raw === null || raw === undefined) return false;
  const value = String(raw).trim();
  if (!value) return false;
  return LINKEDIN_PROFILE_RE.test(value);
};

export const LINKEDIN_ERROR_MESSAGE =
  'Enter a valid LinkedIn profile URL (e.g. https://www.linkedin.com/in/yourname)';
