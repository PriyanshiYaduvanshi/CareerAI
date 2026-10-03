// services/jobMatchingService.js
//
// WHY THIS FILE EXISTS
// ---------------------
// calculateMatchScore/effectiveWorkMode/effectiveEmploymentType used to
// live only inside controllers/jobsController.js, which is HTTP-bound
// (reads req.query, writes res.json) and can't be `require()`'d for its
// logic without dragging Express request/response assumptions along with
// it. The Job Search Agent (agents/jobSearchAgent/JobSearchAgent.js) needs
// the exact same skill-match scoring and legacy-field reconciliation that
// getRecommendedJobs already uses, so this file is that logic extracted
// into a plain, framework-free module both the controller and the agent
// import — a single implementation, not two copies that could drift.
//
// This is a pure extraction: every function below has the exact same
// behavior as it did inline in jobsController.js before this file existed.
// controllers/jobsController.js was updated to import from here instead of
// defining these locally — nothing about getRecommendedJobs' request
// handling, query params, response shape, or scoring behavior changed.

/**
 * Calculate skill-match % between a user's skills and a job's required skills.
 * @param {Array<{name: string}>} userSkills
 * @param {string[]} jobSkills
 * @returns {number} 0-100
 */
const calculateMatchScore = (userSkills, jobSkills) => {
  if (!jobSkills || jobSkills.length === 0) return 0;
  const userSkillNames = (userSkills || []).map((s) => s.name.toLowerCase());
  const matches = jobSkills.filter((skill) => userSkillNames.includes(skill.toLowerCase()));
  return Math.round((matches.length / jobSkills.length) * 100);
};

// Older jobs (seeded / pre-Business-Posting-module) only have the legacy
// `type` field. Newer business postings carry `employmentType` + `workMode`.
// These helpers resolve an effective value from whichever is present so
// filtering/matching works consistently across both shapes of data.
const effectiveWorkMode = (job) => {
  if (job.workMode) return job.workMode;
  if (job.type === 'remote') return 'remote';
  if (job.type === 'hybrid') return 'hybrid';
  return 'onsite';
};

const effectiveEmploymentType = (job) => {
  if (job.employmentType) return job.employmentType;
  if (job.type && !['remote', 'hybrid'].includes(job.type)) return job.type;
  return 'full-time';
};

/**
 * Score and rank a list of jobs against a user's skill profile, highest
 * match first. Pure function — does not query the database or know about
 * saved/applied state; callers merge that in separately (as
 * getRecommendedJobs already does, and as JobSearchAgent does for its
 * 'match-jobs-to-profile' / 'rank-jobs' actions).
 *
 * @param {Array<Object>} jobs - plain job objects (e.g. via `.toObject()`)
 * @param {Array<{name: string}>} userSkills
 * @returns {Array<Object>} same job objects with a `matchScore` field added, sorted descending by matchScore
 */
const rankJobsBySkillMatch = (jobs, userSkills) => {
  return jobs
    .map((job) => ({ ...job, matchScore: calculateMatchScore(userSkills, job.requiredSkills) }))
    .sort((a, b) => b.matchScore - a.matchScore);
};

module.exports = { calculateMatchScore, effectiveWorkMode, effectiveEmploymentType, rankJobsBySkillMatch };
