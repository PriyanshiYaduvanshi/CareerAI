// src/utils/currency.js
// Single source of truth for currency display across the app.
// CareerAI operates in India, so every amount is shown in Indian Rupees (₹).
// Do NOT format money ad-hoc elsewhere — import from here instead so the
// symbol/format never drifts out of sync between pages.

export const CURRENCY = 'INR';
export const CURRENCY_SYMBOL = '₹';

// Compact Indian-style abbreviation: k (thousand) / L (lakh) / Cr (crore).
// e.g. 45000 -> "45k", 1200000 -> "12L", 25000000 -> "2.5Cr"
export const formatCompactINR = (amount) => {
  const n = Number(amount) || 0;
  if (n >= 1_00_00_000) return `${CURRENCY_SYMBOL}${(n / 1_00_00_000).toFixed(n % 1_00_00_000 === 0 ? 0 : 1)}Cr`;
  if (n >= 1_00_000) return `${CURRENCY_SYMBOL}${(n / 1_00_000).toFixed(n % 1_00_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000) return `${CURRENCY_SYMBOL}${Math.round(n / 1_000)}k`;
  return `${CURRENCY_SYMBOL}${n}`;
};

// Full amount with Indian digit grouping, e.g. 1234567 -> "₹12,34,567"
export const formatFullINR = (amount) => {
  const n = Number(amount) || 0;
  return `${CURRENCY_SYMBOL}${n.toLocaleString('en-IN')}`;
};

// Formats a job's salary range (job.salaryMin / job.salaryMax) into a single
// compact string, e.g. "₹8L – ₹12L" or "Not disclosed".
export const formatSalaryRange = (job) => {
  if (!job || (!job.salaryMin && !job.salaryMax)) return 'Not disclosed';
  if (job.salaryMin && job.salaryMax) return `${formatCompactINR(job.salaryMin)} – ${formatCompactINR(job.salaryMax)}`;
  return formatCompactINR(job.salaryMin || job.salaryMax);
};
