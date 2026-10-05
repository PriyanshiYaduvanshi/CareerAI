// src/utils/deadline.js
// Single place to decide whether a job's application deadline has passed.
// Used by JobsPage, JobDetailPage, and ApplyJobModal so the rule can never
// drift out of sync between the list, the detail page, and the apply form.

export const isPastDeadline = (deadline) => {
  if (!deadline) return false;
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return false;
  // Compare against end of the deadline day, so the deadline date itself
  // still counts as open.
  d.setHours(23, 59, 59, 999);
  return Date.now() > d.getTime();
};

export const formatDeadline = (deadline) => {
  if (!deadline) return '—';
  const d = new Date(deadline);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
