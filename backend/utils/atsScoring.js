// utils/atsScoring.js
//
// Deterministic, content-driven ATS scoring engine.
//
// WHY THIS FILE EXISTS
// ---------------------
// The previous implementation asked an LLM to invent every score from
// scratch ("atsScore": 0-100, "skills": 0-100, ...) with only a JSON
// example embedded in the prompt. In practice this made scores cluster
// around the same handful of numbers for almost every resume, because:
//   1. The prompt's example JSON contained literal sample numbers
//      (e.g. atsScore: 72, education: 90). Weaker/faster models
//      (especially the Groq llama-3.1-8b-instant fallback used whenever
//      Gemini's free tier is rate-limited) tend to anchor on those
//      example values instead of actually computing anything.
//   2. There was no rubric, no weights, and no ground truth extracted
//      from the resume text itself — the "score" was pure LLM guesswork,
//      so two very different resumes could get near-identical numbers.
//   3. There was no fallback: a failed/lazy AI call still produced a
//      "successful" response with generic numbers.
//
// This module replaces all *numeric* scoring with rule-based analysis of
// the actual resume text (and job posting, when available). Every score
// is a reproducible function of detectable features: skills found,
// education level, years of experience, project/certification signals,
// keyword overlap, completeness of sections, and basic formatting health.
// The AI layer (see aiService.js) is now only used to *explain* these
// already-computed numbers in natural language — it no longer invents
// the numbers themselves.

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));

const normalize = (text = '') => text.toLowerCase().replace(/\s+/g, ' ').trim();

const containsWord = (haystackLower, term) => {
  const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word-ish boundary that still matches terms containing '.', '+', '#' (C++, C#, Node.js)
  const re = new RegExp(`(?:^|[^a-z0-9+#.])${escaped}(?:$|[^a-z0-9+#.])`, 'i');
  return re.test(` ${haystackLower} `);
};

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will',
  'your', 'you', 'are', 'was', 'were', 'been', 'has', 'had', 'our', 'their',
  'them', 'they', 'about', 'into', 'over', 'under', 'more', 'than', 'also',
  'able', 'using', 'used', 'use', 'work', 'team', 'role', 'job', 'years',
  'year', 'experience', 'strong', 'good', 'including', 'such', 'etc',
]);

// ─────────────────────────────────────────────────────────────────────────
// Skill taxonomy (used both for generic skill detection and as the
// fallback keyword pool when no job posting / target role is provided)
// ─────────────────────────────────────────────────────────────────────────

const SKILL_TAXONOMY = {
  languages: ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'PHP', 'Ruby', 'Kotlin', 'Swift', 'C'],
  frontend: ['React', 'Redux', 'Next.js', 'Vue', 'Angular', 'HTML', 'CSS', 'Tailwind', 'Bootstrap', 'jQuery', 'SASS', 'Webpack'],
  backend: ['Node.js', 'Express', 'Django', 'Flask', 'Spring Boot', 'FastAPI', 'Laravel', '.NET', 'GraphQL', 'REST API'],
  database: ['MongoDB', 'MySQL', 'PostgreSQL', 'SQLite', 'Redis', 'Firebase', 'DynamoDB', 'Oracle', 'Cassandra'],
  cloud_devops: ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'CI/CD', 'Terraform', 'Nginx', 'Linux', 'Git', 'GitHub', 'GitLab'],
  data_ai: ['Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn', 'NLP', 'Computer Vision', 'Data Analysis', 'Power BI', 'Tableau'],
  mobile: ['Android', 'iOS', 'React Native', 'Flutter', 'SwiftUI', 'Jetpack Compose'],
  testing: ['Jest', 'Mocha', 'Selenium', 'Cypress', 'JUnit', 'Postman', 'Unit Testing'],
  soft_practice: ['Agile', 'Scrum', 'System Design', 'Microservices', 'API Design', 'Problem Solving', 'Communication', 'Leadership'],
};

const ALL_SKILLS = Object.values(SKILL_TAXONOMY).flat();

const ROLE_KEYWORD_MAP = {
  frontend: [...SKILL_TAXONOMY.frontend, 'JavaScript', 'TypeScript', 'UI/UX', 'Responsive Design'],
  'front end': [...SKILL_TAXONOMY.frontend, 'JavaScript', 'TypeScript'],
  backend: [...SKILL_TAXONOMY.backend, ...SKILL_TAXONOMY.database, 'Node.js'],
  'back end': [...SKILL_TAXONOMY.backend, ...SKILL_TAXONOMY.database],
  fullstack: [...SKILL_TAXONOMY.frontend, ...SKILL_TAXONOMY.backend, ...SKILL_TAXONOMY.database],
  'full stack': [...SKILL_TAXONOMY.frontend, ...SKILL_TAXONOMY.backend, ...SKILL_TAXONOMY.database],
  mern: ['MongoDB', 'Express', 'React', 'Node.js', 'JavaScript', 'REST API'],
  mean: ['MongoDB', 'Express', 'Angular', 'Node.js', 'JavaScript'],
  'data scientist': [...SKILL_TAXONOMY.data_ai, 'Python', 'SQL', 'Statistics'],
  'data analyst': ['SQL', 'Excel', 'Power BI', 'Tableau', 'Python', 'Data Analysis'],
  'machine learning': [...SKILL_TAXONOMY.data_ai, 'Python'],
  devops: [...SKILL_TAXONOMY.cloud_devops],
  cloud: [...SKILL_TAXONOMY.cloud_devops],
  android: [...SKILL_TAXONOMY.mobile, 'Java', 'Kotlin'],
  ios: [...SKILL_TAXONOMY.mobile, 'Swift'],
  mobile: [...SKILL_TAXONOMY.mobile],
  qa: [...SKILL_TAXONOMY.testing],
  tester: [...SKILL_TAXONOMY.testing],
  'product manager': ['Roadmapping', 'Agile', 'Scrum', 'Stakeholder Management', 'Analytics', 'A/B Testing'],
};

const DEFAULT_KEYWORDS = [
  'JavaScript', 'React', 'Node.js', 'MongoDB', 'Express', 'Git', 'SQL',
  'Python', 'REST API', 'Agile', 'Problem Solving', 'AWS',
];

function getRoleKeywords(targetRole = '') {
  const role = normalize(targetRole);
  if (!role) return DEFAULT_KEYWORDS;
  for (const [key, keywords] of Object.entries(ROLE_KEYWORD_MAP)) {
    if (role.includes(key)) return keywords;
  }
  return DEFAULT_KEYWORDS;
}

// ─────────────────────────────────────────────────────────────────────────
// Section / structure detection
// ─────────────────────────────────────────────────────────────────────────

const SECTION_PATTERNS = {
  summary: /\b(summary|objective|profile|about me)\b/i,
  skills: /\b(technical skills|skills|core competencies|technologies)\b/i,
  experience: /\b(work experience|professional experience|employment history|experience)\b/i,
  education: /\beducation\b/i,
  projects: /\b(projects?|academic projects?|personal projects?)\b/i,
  certifications: /\b(certifications?|licenses?|courses?)\b/i,
};

function detectSections(resumeText) {
  const found = {};
  for (const [key, pattern] of Object.entries(SECTION_PATTERNS)) {
    found[key] = pattern.test(resumeText);
  }
  return found;
}

function detectContactInfo(resumeText) {
  const hasEmail = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(resumeText);
  const hasPhone = /(\+?\d{1,3}[-.\s]?)?\d{10}\b|\(\d{3}\)\s?\d{3}[-.\s]?\d{4}/.test(resumeText);
  const hasLinkedIn = /linkedin\.com\//i.test(resumeText);
  const hasGithub = /github\.com\//i.test(resumeText);
  return { hasEmail, hasPhone, hasLinkedIn, hasGithub };
}

// ─────────────────────────────────────────────────────────────────────────
// Feature extraction
// ─────────────────────────────────────────────────────────────────────────

function detectSkills(resumeText) {
  const lower = normalize(resumeText);
  return ALL_SKILLS.filter((skill) => containsWord(lower, skill));
}

const DEGREE_LEVELS = [
  { level: 4, patterns: ['phd', 'ph.d', 'doctorate'] },
  { level: 3, patterns: ['master of', 'm.tech', 'mtech', 'm.e ', 'msc', 'm.sc', 'mba', 'mca', "master's"] },
  { level: 2, patterns: ['bachelor of', 'b.tech', 'btech', 'b.e ', 'be ', 'bsc', 'b.sc', 'bca', "bachelor's"] },
  { level: 1, patterns: ['diploma', 'associate degree'] },
];

function detectEducation(resumeText) {
  const lower = normalize(resumeText);
  let highestLevel = 0;
  for (const { level, patterns } of DEGREE_LEVELS) {
    if (patterns.some((p) => lower.includes(p))) {
      highestLevel = Math.max(highestLevel, level);
    }
  }
  const hasGraduationYear = /\b(19|20)\d{2}\b/.test(resumeText) && SECTION_PATTERNS.education.test(resumeText);
  const hasInstitution = /\b(university|college|institute|school)\b/i.test(resumeText);

  let score;
  if (highestLevel === 4) score = 95;
  else if (highestLevel === 3) score = 88;
  else if (highestLevel === 2) score = 80;
  else if (highestLevel === 1) score = 62;
  else score = 35; // no recognizable degree keyword found

  if (hasInstitution) score += 5;
  if (hasGraduationYear) score += 5;

  return { score: clamp(score), highestLevel, hasInstitution, hasGraduationYear };
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const DATE_RANGE_RE = new RegExp(
  `(?:(?:${MONTHS})[a-z]*\\.?\\s*)?((?:19|20)\\d{2})\\s*(?:-|–|—|to)\\s*(?:(?:${MONTHS})[a-z]*\\.?\\s*)?((?:19|20)\\d{2}|present|current|now)`,
  'gi'
);

function estimateExperienceYears(resumeText) {
  const currentYear = new Date().getFullYear();
  let totalMonthsSpans = [];
  let match;
  const re = new RegExp(DATE_RANGE_RE);
  while ((match = re.exec(resumeText)) !== null) {
    const start = parseInt(match[1], 10);
    const endRaw = match[2].toLowerCase();
    const end = ['present', 'current', 'now'].includes(endRaw) ? currentYear : parseInt(endRaw, 10);
    if (end >= start && end - start <= 45) {
      // Same-year ranges (e.g. "Jan 2024 - Jun 2024") still represent real
      // months of work — treat them as a half-year rather than rounding to 0.
      totalMonthsSpans.push({ start, end: end === start ? end + 0.5 : end });
    }
  }

  let years = 0;
  if (totalMonthsSpans.length) {
    // Merge overlapping ranges so concurrent roles aren't double-counted.
    totalMonthsSpans.sort((a, b) => a.start - b.start);
    const merged = [totalMonthsSpans[0]];
    for (const span of totalMonthsSpans.slice(1)) {
      const last = merged[merged.length - 1];
      if (span.start <= last.end) last.end = Math.max(last.end, span.end);
      else merged.push({ ...span });
    }
    years = merged.reduce((sum, s) => sum + (s.end - s.start), 0);
  }

  // Explicit "X years of experience" claims act as a secondary signal —
  // take whichever is larger (date ranges under-count for short current
  // roles that started this year, so an explicit stated figure helps).
  const explicitMatch = resumeText.match(/(\d{1,2})\+?\s*years?\s*(?:of)?\s*(?:experience|exp)\b/i);
  if (explicitMatch) {
    years = Math.max(years, parseInt(explicitMatch[1], 10));
  }

  return { years: clamp(years, 0, 40) };
}

function detectMetricBullets(resumeText) {
  const lines = resumeText.split('\n');
  const bulletLines = lines.filter((l) => /^\s*[•\-*▪●]/.test(l) || /^\s*\d+[.)]\s/.test(l));
  const metricBullets = bulletLines.filter((l) => /\d/.test(l)).length;
  return { bulletCount: bulletLines.length, metricBullets };
}

const CERT_KEYWORDS = [
  'certified', 'certification', 'certificate', 'coursera', 'udemy', 'nptel',
  'aws certified', 'google certified', 'microsoft certified', 'oracle certified',
  'pmp', 'ccna', 'comptia', 'hackerrank', 'freecodecamp',
];

function detectCertifications(resumeText) {
  const lower = normalize(resumeText);
  const found = CERT_KEYWORDS.filter((kw) => lower.includes(kw));
  // Rough count of distinct certification-like lines within/near a
  // certifications section, used only as a secondary signal.
  const certSectionMatch = resumeText.match(/certifications?[\s\S]{0,600}/i);
  const linesInSection = certSectionMatch
    ? certSectionMatch[0].split('\n').filter((l) => l.trim().length > 3).length - 1
    : 0;
  return { keywordsFound: [...new Set(found)], estimatedCount: Math.max(found.length, linesInSection, 0) };
}

function detectProjects(resumeText, sections) {
  if (!sections.projects) return { count: 0, text: '' };
  const match = resumeText.match(/projects?[\s\S]{0,2500}?(?=\n[A-Z][A-Za-z ]{2,25}\n|$)/i);
  const text = match ? match[0] : '';
  // Count project entries heuristically: bold-ish title lines or bullet
  // clusters. We approximate by counting bullet lines and dividing by a
  // typical bullets-per-project average, with a floor of 1 if the section exists.
  const { bulletCount } = detectMetricBullets(text);
  const count = bulletCount > 0 ? Math.max(1, Math.round(bulletCount / 3)) : 1;
  return { count, text: text || resumeText };
}

// ─────────────────────────────────────────────────────────────────────────
// Keyword / overlap scoring
// ─────────────────────────────────────────────────────────────────────────

function scoreKeywords(resumeText, keywordList) {
  if (!keywordList || !keywordList.length) return { score: 50, matched: [], missing: [] };
  const lower = normalize(resumeText);
  const matched = keywordList.filter((kw) => containsWord(lower, kw));
  const missing = keywordList.filter((kw) => !matched.includes(kw));
  const score = clamp((matched.length / keywordList.length) * 100);
  return { score, matched, missing };
}

function extractKeywordsFromText(text, limit = 20) {
  const words = normalize(text)
    .replace(/[^a-z0-9+.# ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  const freq = {};
  for (const w of words) freq[w] = (freq[w] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([w]) => w);
}

// ─────────────────────────────────────────────────────────────────────────
// Formatting & completeness scoring
// ─────────────────────────────────────────────────────────────────────────

function scoreFormatting(resumeText, sections, contact) {
  const issues = [];
  let score = 100;

  const wordCount = resumeText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 150) {
    score -= 30;
    issues.push('Resume content is very short for reliable ATS parsing.');
  } else if (wordCount > 1400) {
    score -= 15;
    issues.push('Resume is unusually long — consider tightening it to 1-2 pages.');
  }

  const { bulletCount } = detectMetricBullets(resumeText);
  if (bulletCount < 3) {
    score -= 20;
    issues.push('Very few bullet points detected — use bullets to list achievements clearly.');
  }

  if (!contact.hasEmail) {
    score -= 15;
    issues.push('No email address detected.');
  }
  if (!contact.hasPhone) {
    score -= 10;
    issues.push('No phone number detected.');
  }

  const nonAsciiRatio = (resumeText.match(/[^\x00-\x7F]/g) || []).length / Math.max(resumeText.length, 1);
  if (nonAsciiRatio > 0.03) {
    score -= 15;
    issues.push('Unusual characters detected — the file may use graphics, tables, or fonts that confuse ATS parsers.');
  }

  const sectionCount = Object.values(sections).filter(Boolean).length;
  if (sectionCount < 3) {
    score -= 15;
    issues.push('Few standard section headings detected (e.g. Experience, Education, Skills).');
  }

  return { score: clamp(score), issues };
}

function scoreCompleteness(sections, contact) {
  const checks = [
    sections.summary,
    sections.skills,
    sections.experience,
    sections.education,
    contact.hasEmail,
    contact.hasPhone,
  ];
  const bonusChecks = [sections.projects, sections.certifications, contact.hasLinkedIn || contact.hasGithub];

  const missingSections = [];
  if (!sections.summary) missingSections.push('Summary/Objective');
  if (!sections.skills) missingSections.push('Skills');
  if (!sections.experience) missingSections.push('Experience');
  if (!sections.education) missingSections.push('Education');
  if (!sections.projects) missingSections.push('Projects');
  if (!sections.certifications) missingSections.push('Certifications');
  if (!contact.hasEmail || !contact.hasPhone) missingSections.push('Contact details');

  const coreScore = (checks.filter(Boolean).length / checks.length) * 85;
  const bonusScore = (bonusChecks.filter(Boolean).length / bonusChecks.length) * 15;

  return { score: clamp(coreScore + bonusScore), missingSections };
}

// ─────────────────────────────────────────────────────────────────────────
// Experience-level matching (business/applicant flow)
// ─────────────────────────────────────────────────────────────────────────

const EXPERIENCE_LEVEL_MIN_YEARS = { entry: 0, mid: 2, senior: 5, lead: 8, executive: 12 };

function matchExperienceLevel(years, level) {
  const minYears = EXPERIENCE_LEVEL_MIN_YEARS[level];
  if (minYears === undefined) return clamp(Math.min(years, 5) / 5 * 100);
  if (minYears === 0) return 100;
  if (years >= minYears) {
    // Slight penalty for being drastically over-qualified relative to entry/mid roles
    const overBy = years - minYears;
    return clamp(100 - Math.max(0, overBy - 6) * 3);
  }
  return clamp((years / minYears) * 100);
}

// ─────────────────────────────────────────────────────────────────────────
// Public: candidate-facing resume analysis (no specific job posting)
// ─────────────────────────────────────────────────────────────────────────

function scoreResume(resumeText, { targetRole = '' } = {}) {
  const sections = detectSections(resumeText);
  const contact = detectContactInfo(resumeText);
  const detectedSkills = detectSkills(resumeText);
  const roleKeywords = getRoleKeywords(targetRole);
  const kw = scoreKeywords(resumeText, roleKeywords);
  const edu = detectEducation(resumeText);
  const exp = estimateExperienceYears(resumeText);
  const { metricBullets } = detectMetricBullets(resumeText);
  const certs = detectCertifications(resumeText);
  const projects = detectProjects(resumeText, sections);
  const formatting = scoreFormatting(resumeText, sections, contact);
  const completeness = scoreCompleteness(sections, contact);

  const skillsCoverageScore = clamp((Math.min(detectedSkills.length, 14) / 14) * 100);
  const skillsScore = clamp(skillsCoverageScore * 0.55 + kw.score * 0.45);

  const experienceScore = clamp(
    Math.min(exp.years / 5, 1) * 60 + (Math.min(metricBullets, 8) / 8) * 40
  );

  const formattingFinal = clamp(formatting.score * 0.6 + completeness.score * 0.4);

  const atsScore = clamp(
    skillsScore * 0.25 +
    kw.score * 0.20 +
    experienceScore * 0.20 +
    edu.score * 0.15 +
    formattingFinal * 0.20
  );

  return {
    atsScore,
    scoreBreakdown: {
      keywords: clamp(kw.score),
      formatting: formattingFinal,
      experience: experienceScore,
      education: edu.score,
      skills: skillsScore,
    },
    matchedKeywords: kw.matched,
    missingKeywords: kw.missing,
    detectedSkills,
    experienceYears: exp.years,
    certifications: certs,
    projectsCount: projects.count,
    formattingIssues: formatting.issues,
    completenessIssues: completeness.missingSections,
    sectionsFound: Object.entries(sections).filter(([, v]) => v).map(([k]) => k),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public: business/applicant-facing resume-vs-job analysis
// ─────────────────────────────────────────────────────────────────────────

function scoreApplicantResume(resumeText, job = {}) {
  const sections = detectSections(resumeText);
  const contact = detectContactInfo(resumeText);

  const requiredSkills = (job.requiredSkills || []).map((s) => String(s).trim()).filter(Boolean);
  const niceToHave = (job.niceToHave || []).map((s) => String(s).trim()).filter(Boolean);
  const detectedSkills = detectSkills(resumeText);

  const lower = normalize(resumeText);
  const requiredSkillsFound = requiredSkills.filter((skill) => containsWord(lower, skill));
  const missingSkills = requiredSkills.filter((skill) => !requiredSkillsFound.includes(skill));

  const skillMatch = requiredSkills.length
    ? clamp((requiredSkillsFound.length / requiredSkills.length) * 100)
    : clamp((Math.min(detectedSkills.length, 10) / 10) * 100);

  const jdText = [job.title, job.description, (job.qualifications || []).join(' '), (job.responsibilities || []).join(' ')]
    .filter(Boolean).join(' ');
  const jdKeywords = extractKeywordsFromText(jdText);
  const jdMatch = scoreKeywords(resumeText, jdKeywords);

  const edu = detectEducation(resumeText);
  const exp = estimateExperienceYears(resumeText);
  const experienceMatch = matchExperienceLevel(exp.years, job.experience);

  const projects = detectProjects(resumeText, sections);
  const relevantPool = [...requiredSkills, ...niceToHave];
  const projectRelevance = projects.count === 0
    ? 0
    : relevantPool.length
      ? clamp((relevantPool.filter((s) => containsWord(normalize(projects.text), s)).length / relevantPool.length) * 100, 15, 100)
      : clamp(Math.min(projects.count, 3) / 3 * 70 + 20);

  const formatting = scoreFormatting(resumeText, sections, contact);
  const completeness = scoreCompleteness(sections, contact);
  const { metricBullets } = detectMetricBullets(resumeText);

  const resumeScore = clamp(
    formatting.score * 0.45 + completeness.score * 0.30 + (Math.min(metricBullets, 6) / 6) * 25
  );

  const jobMatchPercentage = clamp(
    skillMatch * 0.35 +
    jdMatch.score * 0.20 +
    experienceMatch * 0.20 +
    edu.score * 0.10 +
    projectRelevance * 0.15
  );

  const atsScore = clamp(jdMatch.score * 0.35 + formatting.score * 0.35 + completeness.score * 0.30);

  let overallRecommendation;
  if (jobMatchPercentage >= 80) overallRecommendation = 'Highly Recommended';
  else if (jobMatchPercentage >= 60) overallRecommendation = 'Recommended';
  else if (jobMatchPercentage >= 40) overallRecommendation = 'Average';
  else overallRecommendation = 'Not Suitable';

  return {
    atsScore,
    resumeScore,
    skillMatch,
    jobMatchPercentage,
    requiredSkillsFound,
    missingSkills,
    experienceMatch,
    educationMatch: edu.score,
    projectRelevance,
    resumeRelevance: jobMatchPercentage,
    overallRecommendation,
    // Extra context passed downstream to ground the AI-generated narrative
    // and to power deterministic fallback text if the AI call fails.
    detectedSkills,
    experienceYears: exp.years,
    projectsCount: projects.count,
    certifications: detectCertifications(resumeText),
    formattingIssues: formatting.issues,
    completenessIssues: completeness.missingSections,
    educationLevel: edu.highestLevel,
  };
}

module.exports = {
  scoreResume,
  scoreApplicantResume,
  // exported for testing / reuse
  detectSections,
  detectContactInfo,
  detectSkills,
  detectEducation,
  estimateExperienceYears,
  detectCertifications,
  detectProjects,
  getRoleKeywords,
  extractKeywordsFromText,
  // Exported so other modules (e.g. services/externalApis/* for the
  // Market Trend Agent's live-data collection) can detect/extract
  // technology mentions from free text using the same canonical skill
  // vocabulary resumes/job postings are already scored against, instead
  // of maintaining a second, drifting keyword list.
  SKILL_TAXONOMY,
  ALL_SKILLS,
};
