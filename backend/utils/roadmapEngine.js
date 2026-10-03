// utils/roadmapEngine.js
//
// Deterministic learning-roadmap scheduling engine.
//
// WHY THIS FILE EXISTS
// ---------------------
// The previous implementation handed the LLM a single free-text
// "timeline" (e.g. "6 months") inside a prompt whose *example* JSON also
// happened to say "6 months" and "Month 1-2" — so, just like the old ATS
// scoring bug, the model anchored on the example and produced a roadmap
// that barely changed no matter what duration the user actually picked.
// Course lists and prices were pure LLM invention on top of that.
//
// This module fixes both problems by computing the roadmap *structure*
// deterministically, in code, from the user's actual selected duration
// and weekly-availability preference:
//   - number of weeks is parsed/derived directly from the user's input
//   - phase count and phase length scale with that duration
//   - courses are pulled from the real catalog via courseRecommendation.js
//     and sequenced across phases so total workload fits the timeline
//   - pricing is summed from real per-course prices (or 0 when free)
//
// The AI layer (see aiService.js) is only used afterwards, to turn this
// already-computed structure into readable phase titles/objectives and an
// overall narrative — the same "compute first, narrate second" pattern
// already used for resume ATS scoring elsewhere in this codebase.

const { recommendCoursesForSkills, flattenAndDedupeCourses } = require('./courseRecommendation');

// ── Duration parsing ────────────────────────────────────────────────────────

/**
 * Accepts either a number of weeks, or a free-text duration like
 * "3 months", "6 months", "10 weeks", "1 year" and returns a whole number
 * of weeks. Defaults to 26 weeks (6 months) if it can't parse anything.
 */
const parseDurationToWeeks = (input) => {
  if (typeof input === 'number' && input > 0) return Math.round(input);
  const str = String(input || '').toLowerCase().trim();

  const monthsMatch = str.match(/(\d+(\.\d+)?)\s*month/);
  if (monthsMatch) return Math.max(2, Math.round(parseFloat(monthsMatch[1]) * 4.345));

  const weeksMatch = str.match(/(\d+(\.\d+)?)\s*week/);
  if (weeksMatch) return Math.max(1, Math.round(parseFloat(weeksMatch[1])));

  const yearsMatch = str.match(/(\d+(\.\d+)?)\s*year/);
  if (yearsMatch) return Math.max(4, Math.round(parseFloat(yearsMatch[1]) * 52));

  const bareNumber = str.match(/^(\d+(\.\d+)?)$/);
  if (bareNumber) return Math.max(1, Math.round(parseFloat(bareNumber[1]))); // treat bare number as weeks

  return 26; // sensible default: ~6 months
};

const formatWeeksAsDuration = (weeks) => {
  if (weeks % 4.345 < 0.5 || weeks >= 8) {
    const months = Math.round(weeks / 4.345);
    if (months >= 1) return `${months} month${months > 1 ? 's' : ''} (${weeks} weeks)`;
  }
  return `${weeks} week${weeks > 1 ? 's' : ''}`;
};

// ── Phase planning ──────────────────────────────────────────────────────────

/**
 * Decide how many phases to split the roadmap into, scaled to duration.
 * Short roadmaps get fewer, tighter phases; long roadmaps get more.
 */
const decidePhaseCount = (totalWeeks, skillCount) => {
  let phases;
  if (totalWeeks <= 6) phases = 2;
  else if (totalWeeks <= 12) phases = 3;
  else if (totalWeeks <= 24) phases = 4;
  else if (totalWeeks <= 40) phases = 5;
  else phases = 6;

  // Don't create more phases than there are skills to teach.
  return Math.max(1, Math.min(phases, Math.max(skillCount, 1)));
};

/** Split totalWeeks into `count` near-equal integer chunks that sum exactly to totalWeeks. */
const splitWeeks = (totalWeeks, count) => {
  const base = Math.floor(totalWeeks / count);
  let remainder = totalWeeks - base * count;
  const chunks = [];
  for (let i = 0; i < count; i++) {
    let weeks = base;
    if (remainder > 0) { weeks += 1; remainder -= 1; }
    chunks.push(Math.max(1, weeks));
  }
  return chunks;
};

/** Distribute a list of skill-gap objects across `phaseCount` buckets, high priority first. */
const distributeSkillsAcrossPhases = (skillGaps, phaseCount) => {
  const priorityRank = { high: 0, medium: 1, low: 2 };
  const ordered = [...skillGaps].sort((a, b) => (priorityRank[a.priority] ?? 1) - (priorityRank[b.priority] ?? 1));

  const buckets = Array.from({ length: phaseCount }, () => []);
  ordered.forEach((skill, idx) => {
    buckets[idx % phaseCount].push(skill);
  });
  // Ensure every bucket has at least one skill when possible (borrow from the fullest bucket).
  buckets.forEach((bucket) => {
    if (bucket.length === 0) {
      const donorIdx = buckets.findIndex(b => b.length > 1);
      if (donorIdx !== -1) bucket.push(buckets[donorIdx].pop());
    }
  });
  return buckets;
};

// ── Cost & workload helpers ─────────────────────────────────────────────────

const formatCoursePrice = (pricing) => {
  if (!pricing) return 'Free';
  if (pricing.isFree) return 'Free';
  return `₹${pricing.priceINR.toLocaleString('en-IN')} (${pricing.billing})`;
};

/**
 * Sum realistic total cost across a deduplicated course list. Coursera
 * subscription-billed courses are counted once (not once per month) using
 * a conservative single-month estimate, since the roadmap already spans
 * multiple months and a learner would keep the same subscription active.
 */
const computeTotalCost = (dedupedCourses) => {
  let total = 0;
  const breakdown = [];
  let courseraSubscriptionCharged = false;

  for (const c of dedupedCourses) {
    if (c.pricing.isFree) {
      breakdown.push({ courseId: c.id, title: c.title, amountINR: 0, note: 'Free' });
      continue;
    }

    // A single active Coursera subscription unlocks every Coursera course
    // in the plan — charging it once per Coursera course would overstate
    // the real cost, so only the first Coursera course in the list adds
    // the subscription fee; subsequent ones are noted as already covered.
    if (c.platform === 'Coursera' && c.pricing.billing.includes('Coursera subscription')) {
      if (courseraSubscriptionCharged) {
        breakdown.push({ courseId: c.id, title: c.title, amountINR: 0, note: 'Included in Coursera subscription (already counted)' });
        continue;
      }
      courseraSubscriptionCharged = true;
    }

    total += c.pricing.priceINR;
    breakdown.push({ courseId: c.id, title: c.title, amountINR: c.pricing.priceINR, note: c.pricing.billing });
  }
  return { totalEstimatedCostINR: total, breakdown };
};

/**
 * Compute a realistic weekly workload (hours/week) from the actual courses
 * assigned to a phase and the number of weeks in that phase, rather than
 * an arbitrary constant.
 */
const computePhaseWeeklyHours = (courses, phaseWeeks) => {
  if (!courses.length) return 5; // sensible floor
  const totalCourseHours = courses.reduce((sum, c) => sum + (c.durationHours || 10), 0);
  const raw = totalCourseHours / Math.max(phaseWeeks, 1);
  return Math.max(3, Math.min(20, Math.round(raw)));
};

// ── Main builder ─────────────────────────────────────────────────────────

/**
 * Build the full deterministic roadmap structure.
 *
 * @param {Array<{skill, priority, proficiency}>} skillGaps
 * @param {string|number} duration - e.g. "6 months", "10 weeks", or a week count
 * @param {Object} preferences - { weeklyHoursAvailable, coursesPerSkill }
 */
const buildRoadmapStructure = (skillGaps, duration, preferences = {}) => {
  const totalWeeks = parseDurationToWeeks(duration);
  const skills = skillGaps.length ? skillGaps : [{ skill: 'Core role fundamentals', priority: 'high' }];
  const phaseCount = decidePhaseCount(totalWeeks, skills.length);
  const phaseWeekChunks = splitWeeks(totalWeeks, phaseCount);
  const skillBuckets = distributeSkillsAcrossPhases(skills, phaseCount);

  const coursesPerSkill = preferences.coursesPerSkill || 2;
  const perSkillRecommendations = recommendCoursesForSkills(skills, { coursesPerSkill, diversifyPlatforms: true });
  const recommendationBySkill = new Map(perSkillRecommendations.map(r => [r.skill, r]));

  let weekCursor = 0;
  let sequenceCounter = 1;
  const allAssignedCourses = [];

  const phases = skillBuckets.map((bucketSkills, i) => {
    const phaseWeeks = phaseWeekChunks[i];
    const startWeek = weekCursor + 1;
    const endWeek = weekCursor + phaseWeeks;
    weekCursor = endWeek;

    // Gather + dedupe courses for all skills in this phase.
    const phaseSkillRecs = bucketSkills.map(s => recommendationBySkill.get(s.skill)).filter(Boolean);
    const phaseCourses = flattenAndDedupeCourses(phaseSkillRecs);

    const sequencedCourses = phaseCourses.map(c => ({
      ...c,
      sequence: sequenceCounter++,
      priceDisplay: formatCoursePrice(c.pricing),
    }));
    allAssignedCourses.push(...sequencedCourses);

    const weeklyHours = preferences.weeklyHoursAvailable || computePhaseWeeklyHours(sequencedCourses, phaseWeeks);

    return {
      phase: i + 1,
      title: null, // filled in by narrative layer (aiService) or fallback below
      weekRange: `Week ${startWeek}${endWeek > startWeek ? `–${endWeek}` : ''}`,
      durationWeeks: phaseWeeks,
      skillsTargeted: bucketSkills.map(s => s.skill),
      weeklyWorkloadHours: weeklyHours,
      courses: sequencedCourses,
      objectives: bucketSkills.map(s => `Build working proficiency in ${s.skill}`),
      milestoneGoal: null, // filled in by narrative layer or fallback below
    };
  });

  const dedupedAllCourses = flattenAndDedupeCourses(perSkillRecommendations);
  const { totalEstimatedCostINR, breakdown } = computeTotalCost(dedupedAllCourses);
  const freeCourseCount = dedupedAllCourses.filter(c => c.pricing.isFree).length;

  const overallWeeklyHours = preferences.weeklyHoursAvailable ||
    Math.round(phases.reduce((sum, p) => sum + p.weeklyWorkloadHours, 0) / Math.max(phases.length, 1));

  return {
    totalDurationWeeks: totalWeeks,
    totalDuration: formatWeeksAsDuration(totalWeeks),
    weeklyCommitment: `${overallWeeklyHours} hours/week`,
    phases,
    totalEstimatedCostINR,
    costBreakdown: breakdown,
    freeCourseCount,
    paidCourseCount: dedupedAllCourses.length - freeCourseCount,
    totalCourses: dedupedAllCourses.length,
    skillMilestones: skills.map(s => s.skill),
  };
};

module.exports = {
  parseDurationToWeeks,
  formatWeeksAsDuration,
  decidePhaseCount,
  splitWeeks,
  distributeSkillsAcrossPhases,
  formatCoursePrice,
  computeTotalCost,
  computePhaseWeeklyHours,
  buildRoadmapStructure,
};
