// utils/courseRecommendation.js
//
// Deterministic course recommendation engine.
//
// WHY THIS FILE EXISTS
// ---------------------
// The old roadmap generator let the LLM invent course names, platforms and
// URLs on the fly ("random courses"). This module replaces that with a
// real, data-driven match against the curated catalog in
// data/courseCatalog.js — every course returned is a real course on
// Coursera, IBM SkillsBuild, or Udemy, with a real (or realistically
// modeled) price.
//
// Matching is a simple, transparent scoring function (skill-tag overlap +
// level fit + platform diversity), which keeps it easy to extend: adding a
// new platform is just adding entries to the catalog, and improving match
// quality later (e.g. swapping in a real embeddings-based matcher) only
// requires changing this one file.

const { COURSE_CATALOG } = require('../data/courseCatalog');

// Basic synonym map so loosely-worded skill gaps ("Front end", "ReactJS",
// "js") still resolve to the canonical tags used in the catalog.
const SKILL_SYNONYMS = {
  'js': 'javascript',
  'reactjs': 'react',
  'react.js': 'react',
  'nodejs': 'node.js',
  'node': 'node.js',
  'frontend': 'frontend development',
  'front-end': 'frontend development',
  'front end development': 'frontend development',
  'backend': 'backend development',
  'back-end': 'backend development',
  'back end development': 'backend development',
  'ml': 'machine learning',
  'ai': 'ai fundamentals',
  'artificial intelligence': 'ai fundamentals',
  'k8s': 'kubernetes',
  'ux': 'ui/ux design',
  'ui': 'ui/ux design',
  'ux design': 'ui/ux design',
  'ux/ui design': 'ui/ux design',
  'aws cloud': 'aws',
  'amazon web services': 'aws',
  'cloud': 'cloud computing',
  'data analytics': 'data analysis',
  'pm': 'project management',
  'product management': 'project management',
  'git/github': 'git',
  'github': 'git',
  'communication skills': 'communication',
  'soft skills': 'communication',
  'devops practices': 'devops',
  'ci': 'ci/cd',
  'cd': 'ci/cd',
};

const normalizeSkill = (raw = '') => {
  const s = String(raw).toLowerCase().trim();
  return SKILL_SYNONYMS[s] || s;
};

// Word-level overlap between a normalized skill string and a course's tag,
// so "react native" still partially matches a "react" tag, etc.
const skillSimilarity = (skillNorm, tagNorm) => {
  if (!skillNorm || !tagNorm) return 0;
  if (skillNorm === tagNorm) return 1;
  if (tagNorm.includes(skillNorm) || skillNorm.includes(tagNorm)) return 0.75;
  const skillWords = new Set(skillNorm.split(/\s+/));
  const tagWords = tagNorm.split(/\s+/);
  const overlap = tagWords.filter(w => skillWords.has(w)).length;
  if (overlap > 0) return 0.4 * (overlap / Math.max(skillWords.size, tagWords.length));
  return 0;
};

const LEVEL_RANK = { beginner: 1, intermediate: 2, advanced: 3 };

/**
 * Score how well a single catalog course matches a single requested skill.
 * Returns 0 if there's no meaningful match.
 */
const scoreCourseForSkill = (course, skillNorm, proficiency) => {
  let best = 0;
  for (const tag of course.skills) {
    const sim = skillSimilarity(skillNorm, normalizeSkill(tag));
    if (sim > best) best = sim;
  }
  if (best === 0) return 0;

  // Prefer courses whose level roughly matches the learner's current
  // proficiency in that skill (none/beginner -> beginner course first).
  const targetLevel = proficiency === 'advanced' ? 'advanced' : proficiency === 'intermediate' ? 'intermediate' : 'beginner';
  const levelDelta = Math.abs((LEVEL_RANK[course.level] || 1) - (LEVEL_RANK[targetLevel] || 1));
  const levelFit = 1 - levelDelta * 0.2; // small penalty per level of mismatch

  return best * Math.max(levelFit, 0.4);
};

/**
 * Recommend courses for a list of skill gaps.
 *
 * @param {Array<{skill: string, priority?: string, proficiency?: string}>} skillGaps
 * @param {Object} options
 * @param {number} options.coursesPerSkill - max courses to return per skill (default 2)
 * @param {boolean} options.diversifyPlatforms - prefer covering multiple platforms per skill
 * @returns {Array<{skill, priority, courses: Array}>}
 */
const recommendCoursesForSkills = (skillGaps, options = {}) => {
  const { coursesPerSkill = 2, diversifyPlatforms = true } = options;

  return skillGaps.map(gap => {
    const skillNorm = normalizeSkill(gap.skill);
    const scored = COURSE_CATALOG
      .map(course => ({ course, score: scoreCourseForSkill(course, skillNorm, gap.proficiency) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score);

    let picked = [];
    if (diversifyPlatforms) {
      const seenPlatforms = new Set();
      for (const x of scored) {
        if (picked.length >= coursesPerSkill) break;
        if (seenPlatforms.has(x.course.platform) && picked.length < scored.length) {
          continue; // try to get one per platform first
        }
        seenPlatforms.add(x.course.platform);
        picked.push(x);
      }
      // fill remaining slots if platform-diversity left room unused
      if (picked.length < coursesPerSkill) {
        for (const x of scored) {
          if (picked.length >= coursesPerSkill) break;
          if (!picked.includes(x)) picked.push(x);
        }
      }
    } else {
      picked = scored.slice(0, coursesPerSkill);
    }

    return {
      skill: gap.skill,
      priority: gap.priority || 'medium',
      courses: picked.map(x => ({
        ...x.course,
        matchScore: Math.round(x.score * 100),
      })),
    };
  }).filter(entry => entry.courses.length > 0 || true); // keep entries even with no catalog match, handled upstream
};

/**
 * Flatten per-skill recommendations into a single deduplicated course list
 * (a course can cover multiple requested skills — e.g. IBM's SQL course
 * covers both "sql" and "data science" — so we merge and keep the union of
 * matched skills per course instead of listing it twice).
 */
const flattenAndDedupeCourses = (perSkillRecommendations) => {
  const byId = new Map();
  for (const entry of perSkillRecommendations) {
    for (const course of entry.courses) {
      if (!byId.has(course.id)) {
        byId.set(course.id, { ...course, coversSkills: [entry.skill], priority: entry.priority });
      } else {
        const existing = byId.get(course.id);
        if (!existing.coversSkills.includes(entry.skill)) existing.coversSkills.push(entry.skill);
        // bump priority to the highest of the skills it covers
        const rank = { high: 3, medium: 2, low: 1 };
        if ((rank[entry.priority] || 2) > (rank[existing.priority] || 2)) existing.priority = entry.priority;
      }
    }
  }
  return Array.from(byId.values());
};

module.exports = {
  normalizeSkill,
  scoreCourseForSkill,
  recommendCoursesForSkills,
  flattenAndDedupeCourses,
};
