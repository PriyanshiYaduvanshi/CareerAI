// utils/applicationConstants.js
// Single source of truth for application-status vocabulary used across
// applicationsController, businessApplicantsController, and emailController.
// Previously each controller kept its own copy of these maps, which is a
// duplication/maintenance hazard (they had already begun to drift).

const VALID_STATUSES = ['saved', 'applied', 'shortlisted', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

// Statuses a business can move an applicant to from the Applicants dashboard.
// ('saved' is a candidate-only bookmark state and is excluded here.)
const BUSINESS_ASSIGNABLE_STATUSES = ['applied', 'shortlisted', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

// Statuses that represent an applicant being selected/moved into the NEXT
// recruitment round (as opposed to being rejected/withdrawn, or simply
// sitting at the initial "applied" state). This is the single source of
// truth for when an in-app candidate notification should be generated —
// see notificationsController.notifyRoundAdvancement. Every other status
// transition (e.g. a business marking someone "applied" again, or a
// rejection/withdrawal) is intentionally silent to avoid notification spam.
const ROUND_ADVANCEMENT_STATUSES = ['shortlisted', 'screening', 'interview', 'offer'];

const STATUS_DISPLAY_LABELS = {
  applied: 'Pending',
  shortlisted: 'Shortlisted',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  saved: 'Saved',
};

// Candidate-facing in-app notification titles — ONLY for the round-
// advancement statuses in ROUND_ADVANCEMENT_STATUSES above. Rejections and
// withdrawals deliberately have no entry here: per current product policy,
// in-app notifications are limited to "you've been selected for the next
// round" events, not every application status change.
const STATUS_NOTIFICATION_TITLES = {
  shortlisted: 'Application shortlisted',
  screening: 'Moved to screening round',
  interview: 'Interview scheduled',
  offer: 'Offer extended',
};

const EXPERIENCE_LABELS = {
  entry: 'Entry Level (0-2 yrs)',
  mid: 'Mid Level (2-5 yrs)',
  senior: 'Senior (5-10 yrs)',
  expert: 'Expert (10+ yrs)',
};

// Rough month count between two dates (used to estimate years of experience
// from a candidate's work-history entries).
const monthsBetween = (start, end) => {
  if (!start) return 0;
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
  return Math.max(0, (e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
};

const computeExperienceYears = (experience = []) => {
  const totalMonths = experience.reduce(
    (sum, exp) => sum + monthsBetween(exp.startDate, exp.current ? null : exp.endDate),
    0
  );
  return Math.round((totalMonths / 12) * 10) / 10;
};

const experienceBucket = (years) => {
  if (years >= 10) return 'expert';
  if (years >= 5) return 'senior';
  if (years >= 2) return 'mid';
  return 'entry';
};

module.exports = {
  VALID_STATUSES,
  BUSINESS_ASSIGNABLE_STATUSES,
  ROUND_ADVANCEMENT_STATUSES,
  STATUS_DISPLAY_LABELS,
  STATUS_NOTIFICATION_TITLES,
  EXPERIENCE_LABELS,
  monthsBetween,
  computeExperienceYears,
  experienceBucket,
};
