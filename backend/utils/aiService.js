// utils/aiService.js - Google Gemini AI integration with Groq fallback
const axios = require('axios');
const atsScoring = require('./atsScoring');
const { buildRoadmapStructure } = require('./roadmapEngine');
const { withRetry } = require('./retry');
const logger = require('./logger').scope('aiService');

// ─── Gemini Helper ────────────────────────────────────────────────────────────
const callGemini = async (prompt) => {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
  // A transient hiccup (momentary rate limit, brief upstream 5xx) gets a
  // couple of quick retries before this bubbles up to callAI's
  // Groq-fallback logic — so a one-off blip no longer costs a full
  // provider switch when trying again a moment later would have worked.
  const result = await withRetry(() => model.generateContent(prompt), { label: 'Gemini generateContent' });
  return result.response.text();
};

// ─── Gemini Streaming Helper (additive — not wired into any existing call site) ──
// Purely additive export for future SSE/WebSocket streaming (e.g. a future
// `/api/chat/message/stream` route, mirroring the NDJSON pattern
// controllers/careerController.js's streamCareerReport already established
// for the career-report workflow). Nothing today calls this — every
// existing caller of `callAI` keeps getting one buffered string back
// exactly as before, so today's chatbot behavior is completely unchanged.
// It exists so that turning the chat reply into a token-by-token stream
// later is a matter of wiring this in, not inventing a new Gemini
// integration from scratch under time pressure.
const streamGemini = async (prompt, onChunk) => {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables');
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash-lite' });
  const result = await model.generateContentStream(prompt);
  let full = '';
  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      full += text;
      if (typeof onChunk === 'function') onChunk(text);
    }
  }
  return full;
};

/**
 * Streaming counterpart to `callAI`: same Gemini-primary behavior, but
 * invokes `onChunk(textDelta)` as each piece of the response arrives
 * instead of only resolving once at the end. Falls back to a single
 * `onChunk` call with the whole buffered text (via the existing
 * Groq/no-stream path) if Gemini streaming itself fails, so a caller that
 * adopts this never has to special-case "streaming failed" — it just
 * gets fewer, larger chunks.
 *
 * @param {string} prompt
 * @param {(textDelta: string) => void} [onChunk]
 * @returns {Promise<string>} the full, assembled response text (same contract as callAI)
 */
const callAIStream = async (prompt, onChunk) => {
  try {
    return await streamGemini(prompt, onChunk);
  } catch (err) {
    logger.warn('Gemini streaming failed, falling back to buffered callAI:', err.message || String(err));
    const text = await callAI(prompt);
    if (typeof onChunk === 'function') onChunk(text);
    return text;
  }
};

// ─── Groq Fallback ────────────────────────────────────────────────────────────
const callGroq = async (prompt) => {
  try {
    const response = await withRetry(
      () => axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama-3.1-8b-instant', // llama3-8b-8192 was decommissioned by Groq (May 2025)
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        },
        { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
      ),
      { label: 'Groq chat completion' }
    );
    return response.data.choices[0].message.content;
  } catch (err) {
    // Surface the real Groq error instead of axios's generic "status code 400"
    const groqMessage = err.response?.data?.error?.message || err.message;
    logger.error('Groq API error:', groqMessage);
    throw new Error(groqMessage);
  }
};

// ─── Main AI caller with fallback ────────────────────────────────────────────
const callAI = async (prompt) => {
  try {
    return await callGemini(prompt);
  } catch (err) {
    // Surface the real Gemini error too, in case you're debugging that side
    const geminiMessage = err.message || String(err);
    logger.warn('Gemini failed, trying Groq fallback:', geminiMessage);
    if (process.env.GROQ_API_KEY) {
      return await callGroq(prompt);
    }
    throw new Error('All AI providers failed. Gemini: ' + geminiMessage);
  }
};

// ─── Parse JSON from AI response ─────────────────────────────────────────────
const parseJSON = (text) => {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    // Try to extract JSON object/array
    const match = text.match(/[\[{][\s\S]*[\]}]/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Could not parse AI response as JSON');
  }
};

// ─── AI Agents ────────────────────────────────────────────────────────────────

/**
 * Skill Gap Agent
 * Analyzes user skills vs target job and returns gap analysis
 *
 * @param {Array<{name: string, proficiency: string}>} userSkills - explicit structured skill list;
 *   pass an empty array when the caller wants the analysis driven entirely by `groundingContext`.
 * @param {string} targetJob
 * @param {string} [groundingContext] - optional retrieved-context block from
 *   services/retrievalService.js — semantically retrieved (MongoDB Atlas
 *   Vector Search) excerpts from the candidate's resume_chunks and/or the
 *   target job's job_chunks, NOT a keyword-matched list. Empty by default,
 *   in which case the prompt is unchanged from before this parameter
 *   existed, so every pre-existing call site (agents/skillGapAgent's
 *   profile-based path, controllers/aiController.js's skillGapAnalysis and
 *   learningRoadmap) is byte-for-byte unaffected. When provided, this is
 *   the semantic-retrieval evidence the analysis should be grounded in
 *   instead of (or in addition to) a hand-typed skill list — see
 *   agents/skillGapAgent/SkillGapAgent.js's 'semantic-skill-gap-analysis'.
 */
const analyzeSkillGap = async (userSkills, targetJob, groundingContext = '') => {
  const skillList = (userSkills || []).map(s => `${s.name} (${s.proficiency})`).join(', ');
  const skillListBlock = skillList ? `\nUser's current skills: ${skillList}\n` : '';
  const groundingBlock = groundingContext
    ? `\nSemantically retrieved evidence (MongoDB Atlas Vector Search over the candidate's resume and the target job posting — ground your comparison in what this evidence actually says, don't rely on exact keyword overlap, and don't invent skills that aren't supported by it):\n${groundingContext}\n`
    : '';
  const prompt = `
You are a career advisor AI. Analyze the skill gap for a user targeting a "${targetJob}" role.
${skillListBlock}${groundingBlock}
Return a JSON object with this exact structure:
{
  "missingSkills": [
    {
      "skill": "skill name",
      "priority": "high|medium|low",
      "reason": "why this skill matters",
      "timeToLearn": "estimated weeks/months"
    }
  ],
  "strongSkills": ["skill1", "skill2"],
  "overallMatch": 65,
  "summary": "Brief summary of the gap analysis",
  "topRecommendations": ["recommendation 1", "recommendation 2", "recommendation 3"]
}

Return ONLY the JSON, no other text.`;
  const response = await callAI(prompt);
  return parseJSON(response);
};

/**
 * Job Market Agent
 * Returns market trends, salaries, and in-demand skills for a role
 *
 * @param {string} role
 * @param {string} location
 * @param {string} [groundingContext] - optional retrieved-context block from
 *   services/retrievalService.js (prior market_chunks for this/related
 *   roles). Empty by default, in which case the prompt is unchanged from
 *   before this parameter existed — this agent was previously 100%
 *   ungrounded free generation, so passing real retrieved context here is
 *   additive grounding, not a replacement for anything that existed.
 */
const getMarketTrends = async (role, location = 'Global', groundingContext = '') => {
  const groundingBlock = groundingContext
    ? `\nRelevant context retrieved from prior market analyses for this or related roles (use to inform your answer and stay consistent with it, but don't just repeat it verbatim):\n${groundingContext}\n`
    : '';

  const prompt = `
You are a job market analyst AI. Provide current market analysis for "${role}" roles in ${location}.
${groundingBlock}
Return a JSON object with this exact structure:
{
  "demandLevel": "high|medium|low",
  "demandScore": 78,
  "averageSalary": {
    "entry": 600000,
    "mid": 1200000,
    "senior": 2500000,
    "currency": "INR"
  },
  "topCompanies": ["Company A", "Company B", "Company C", "Company D", "Company E"],
  "trendingSkills": [
    { "skill": "skill name", "demandIncrease": 45 }
  ],
  "jobGrowth": "15% projected over 5 years",
  "topLocations": ["City A", "City B", "City C"],
  "insights": ["insight 1", "insight 2", "insight 3"]
}

Return ONLY the JSON, no other text.`;
  const response = await callAI(prompt);
  return parseJSON(response);
};

/**
 * Resume Analyzer Agent
 * ─────────────────────
 * ATS scoring itself is now computed deterministically by atsScoring.js
 * directly from the resume text — it no longer depends on the AI to
 * invent numbers (see the comment block at the top of atsScoring.js for
 * why that was the root cause of near-identical scores across resumes).
 *
 * The AI is only asked to *explain* the already-computed score: it is
 * given the real numbers, matched/missing keywords, and detected
 * strengths/gaps, and asked to turn those into readable feedback. If the
 * AI is unavailable, a fully deterministic fallback narrative (built from
 * the same detected features) is used instead — so the endpoint never
 * silently falls back to generic/mock text.
 */
const analyzeResume = async (resumeText, targetRole = '') => {
  const computed = atsScoring.scoreResume(resumeText, { targetRole });

  const grounding = `
Computed ATS analysis (already calculated — do NOT invent or change any numbers):
- Overall ATS score: ${computed.atsScore}/100
- Sub-scores: keywords ${computed.scoreBreakdown.keywords}, formatting ${computed.scoreBreakdown.formatting}, experience ${computed.scoreBreakdown.experience}, education ${computed.scoreBreakdown.education}, skills ${computed.scoreBreakdown.skills}
- Skills detected in resume: ${computed.detectedSkills.join(', ') || 'none clearly detected'}
- Keywords matched for "${targetRole || 'general roles'}": ${computed.matchedKeywords.join(', ') || 'none'}
- Keywords missing: ${computed.missingKeywords.join(', ') || 'none'}
- Estimated years of experience: ${computed.experienceYears}
- Projects detected: ${computed.projectsCount}
- Certifications detected: ${computed.certifications.keywordsFound.join(', ') || 'none'}
- Formatting issues detected: ${computed.formattingIssues.join(' | ') || 'none'}
- Missing resume sections: ${computed.completenessIssues.join(', ') || 'none'}`;

  const prompt = `
You are an ATS (Applicant Tracking System) expert AI. You have been given a resume AND a set of already-computed metrics about it. Your job is ONLY to explain and give qualitative feedback based on those metrics — do not invent different scores.

${grounding}

Resume text (for context/quoting only):
"""
${resumeText.substring(0, 3000)}
"""

Return a JSON object with this exact structure (all text fields, no scores):
{
  "strengths": ["specific strength 1 grounded in the resume", "specific strength 2"],
  "improvements": [
    { "section": "Summary", "issue": "specific issue found", "suggestion": "specific, actionable suggestion" }
  ],
  "betterBulletPoints": [
    { "original": "an actual bullet point from the resume", "improved": "the same bullet rewritten with stronger impact/metrics" }
  ],
  "overallFeedback": "2-3 sentence summary referencing the specific score and the concrete reasons behind it"
}

Return ONLY the JSON, no other text.`;

  let narrative;
  try {
    const response = await callAI(prompt);
    narrative = parseJSON(response);
  } catch (err) {
    narrative = buildFallbackResumeNarrative(computed);
  }

  return {
    atsScore: computed.atsScore,
    scoreBreakdown: computed.scoreBreakdown,
    missingKeywords: computed.missingKeywords,
    strengths: narrative.strengths?.length ? narrative.strengths : buildFallbackResumeNarrative(computed).strengths,
    improvements: narrative.improvements?.length ? narrative.improvements : buildFallbackResumeNarrative(computed).improvements,
    betterBulletPoints: narrative.betterBulletPoints || [],
    overallFeedback: narrative.overallFeedback || buildFallbackResumeNarrative(computed).overallFeedback,
  };
};

/**
 * Deterministic fallback narrative for the candidate-facing resume
 * analysis, built entirely from atsScoring.js output. Used when both AI
 * providers are unavailable, so the user never sees mock/placeholder text.
 */
function buildFallbackResumeNarrative(computed) {
  const strengths = [];
  if (computed.detectedSkills.length >= 6) strengths.push(`Resume demonstrates a broad skill set (${computed.detectedSkills.slice(0, 6).join(', ')}).`);
  if (computed.experienceYears >= 1) strengths.push(`Shows approximately ${computed.experienceYears} year(s) of relevant experience.`);
  if (computed.projectsCount > 0) strengths.push(`Includes ${computed.projectsCount} project(s) demonstrating applied skills.`);
  if (computed.certifications.estimatedCount > 0) strengths.push('Includes relevant certifications.');
  if (!strengths.length) strengths.push('Resume was successfully parsed and contains identifiable sections.');

  const improvements = [];
  if (computed.missingKeywords.length) {
    improvements.push({
      section: 'Skills',
      issue: 'Several role-relevant keywords are missing',
      suggestion: `Consider adding (if applicable): ${computed.missingKeywords.slice(0, 5).join(', ')}.`,
    });
  }
  for (const issue of computed.formattingIssues.slice(0, 2)) {
    improvements.push({ section: 'Formatting', issue, suggestion: 'Adjust the resume formatting to address this before submitting to ATS systems.' });
  }
  if (computed.completenessIssues.length) {
    improvements.push({
      section: 'Structure',
      issue: `Missing section(s): ${computed.completenessIssues.join(', ')}`,
      suggestion: 'Add these sections with clear headings so ATS parsers and recruiters can find them.',
    });
  }
  if (!improvements.length) {
    improvements.push({ section: 'General', issue: 'No major issues detected', suggestion: 'Keep the resume updated with new achievements and metrics.' });
  }

  const overallFeedback = `This resume scored ${computed.atsScore}/100. It performed strongest on ` +
    `${Object.entries(computed.scoreBreakdown).sort((a, b) => b[1] - a[1])[0][0]} and weakest on ` +
    `${Object.entries(computed.scoreBreakdown).sort((a, b) => a[1] - b[1])[0][0]}. ` +
    `Addressing the missing keywords and structural gaps above should improve ATS compatibility.`;

  return { strengths, improvements, overallFeedback };
}

/**
 * Resume Summarizer
 * ──────────────────
 * New for the Resume Agent's "Resume Summarization" responsibility.
 * Follows the same "compute first, narrate second" principle as
 * analyzeResume above: atsScoring.scoreResume already deterministically
 * extracts skills/experience/projects/certifications, so the AI's only
 * job here is to turn those already-known facts into a short, readable
 * headline + summary — it is explicitly told not to invent facts beyond
 * what was extracted. If both AI providers are unavailable, a fully
 * deterministic fallback summary (built from the same extracted facts)
 * is returned instead, so this never silently produces empty/mock text.
 *
 * @param {string} resumeText
 * @param {Object} [computed] - pre-computed atsScoring.scoreResume(...) output; computed internally if omitted
 * @param {string} [targetRole]
 */
const summarizeResume = async (resumeText, computed = null, targetRole = '') => {
  const analysis = computed || atsScoring.scoreResume(resumeText, { targetRole });

  const grounding = `
Already-extracted facts about this resume (do NOT invent anything beyond these):
- Detected skills: ${analysis.detectedSkills.join(', ') || 'none clearly detected'}
- Estimated years of experience: ${analysis.experienceYears}
- Projects detected: ${analysis.projectsCount}
- Certifications detected: ${analysis.certifications.keywordsFound.join(', ') || 'none'}
- Resume sections found: ${analysis.sectionsFound.join(', ') || 'none clearly detected'}`;

  const prompt = `
You are a resume summarization assistant. You have been given already-extracted facts about a candidate's resume. Write a short, professional summary a recruiter could skim in seconds — do not invent skills, roles, or achievements beyond what's given.

${grounding}

Resume text (for tone/context only):
"""
${resumeText.substring(0, 3000)}
"""

Return a JSON object with this exact structure:
{
  "headline": "one-line professional headline, e.g. 'Mid-level Full Stack Developer with 3 years of React/Node experience'",
  "summary": "3-4 sentence narrative summary of the candidate's background and strengths",
  "topHighlights": ["short highlight 1", "short highlight 2", "short highlight 3"]
}

Return ONLY the JSON, no other text.`;

  try {
    const response = await callAI(prompt);
    return parseJSON(response);
  } catch (err) {
    return buildFallbackResumeSummary(analysis, targetRole);
  }
};

/**
 * Deterministic fallback for summarizeResume, built entirely from
 * atsScoring.js output — used when both AI providers are unavailable.
 */
function buildFallbackResumeSummary(analysis, targetRole) {
  const topSkills = analysis.detectedSkills.slice(0, 5);
  const headline = targetRole
    ? `Candidate with ${analysis.experienceYears} year(s) of experience targeting ${targetRole} roles`
    : `Candidate with ${analysis.experienceYears} year(s) of experience across ${topSkills.slice(0, 3).join(', ') || 'multiple areas'}`;

  const summary = `This resume shows approximately ${analysis.experienceYears} year(s) of experience` +
    `${topSkills.length ? `, with demonstrated skills in ${topSkills.join(', ')}` : ''}` +
    `${analysis.projectsCount ? `, and includes ${analysis.projectsCount} project(s)` : ''}` +
    `${analysis.certifications.keywordsFound.length ? `, alongside certifications including ${analysis.certifications.keywordsFound.slice(0, 3).join(', ')}` : ''}. ` +
    `Sections detected: ${analysis.sectionsFound.join(', ') || 'limited section structure detected'}.`;

  const topHighlights = [
    topSkills.length ? `Skilled in ${topSkills.join(', ')}` : 'Skills detected from resume content',
    analysis.experienceYears >= 1 ? `${analysis.experienceYears} year(s) of relevant experience` : 'Entry-level profile',
    analysis.projectsCount > 0 ? `${analysis.projectsCount} project(s) on record` : 'No projects explicitly detected',
  ];

  return { headline, summary, topHighlights };
}

/**
 * Applicant Resume Analyzer (Business Dashboard — Applicant Management)
 * ──────────────────────────────────────────────────────────────────────
 * Same principle as analyzeResume above: all numeric scores come from
 * atsScoring.scoreApplicantResume (deterministic, based on the resume
 * text and the actual job posting), and the AI is only used to produce
 * the recruiter-facing narrative fields, grounded in those numbers.
 */
const analyzeApplicantResume = async (resumeText, job = {}) => {
  const computed = atsScoring.scoreApplicantResume(resumeText, job);

  const jobContext = `
Job Title: ${job.title || 'Not specified'}
Required Skills: ${(job.requiredSkills || []).join(', ') || 'Not specified'}
Experience Level Required: ${job.experience || 'Not specified'}
Job Description: ${(job.description || '').substring(0, 1000)}`;

  const grounding = `
Computed analysis (already calculated — do NOT invent or change any numbers):
- atsScore: ${computed.atsScore}, resumeScore: ${computed.resumeScore}, skillMatch: ${computed.skillMatch}
- jobMatchPercentage: ${computed.jobMatchPercentage}, experienceMatch: ${computed.experienceMatch}, educationMatch: ${computed.educationMatch}
- projectRelevance: ${computed.projectRelevance}, overallRecommendation: ${computed.overallRecommendation}
- Required skills found: ${computed.requiredSkillsFound.join(', ') || 'none'}
- Missing skills: ${computed.missingSkills.join(', ') || 'none'}
- Estimated years of experience: ${computed.experienceYears}
- Projects detected: ${computed.projectsCount}
- Certifications detected: ${computed.certifications.keywordsFound.join(', ') || 'none'}`;

  const prompt = `
You are an expert technical recruiter AI. You have been given a candidate's resume, a job posting, AND already-computed match metrics. Your job is ONLY to write the qualitative/text fields explaining those metrics — do not invent different numbers or a different recommendation.

${jobContext}

${grounding}

Resume text (for context/quoting only):
"""
${resumeText.substring(0, 6000)}
"""

Return a JSON object with this exact structure (text fields only):
{
  "strengths": ["strength 1 grounded in the resume/job match", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "experienceSummary": "2-3 sentence summary of the candidate's work experience",
  "educationSummary": "1-2 sentence summary of the candidate's education",
  "projectsSummary": "1-2 sentence summary of notable projects, or 'No projects listed' if none",
  "suggestions": ["suggestion 1", "suggestion 2", "suggestion 3"],
  "recruiterSummary": "2-3 sentence recruiter-facing explanation of why this recommendation was given, referencing the actual score and match numbers"
}

Return ONLY the JSON, no other text.`;

  let narrative;
  try {
    const response = await callAI(prompt);
    narrative = parseJSON(response);
  } catch (err) {
    narrative = buildFallbackApplicantNarrative(computed);
  }

  const fallback = buildFallbackApplicantNarrative(computed);

  return {
    atsScore: computed.atsScore,
    resumeScore: computed.resumeScore,
    skillMatch: computed.skillMatch,
    jobMatchPercentage: computed.jobMatchPercentage,
    requiredSkillsFound: computed.requiredSkillsFound,
    missingSkills: computed.missingSkills,
    experienceMatch: computed.experienceMatch,
    educationMatch: computed.educationMatch,
    projectRelevance: computed.projectRelevance,
    resumeRelevance: computed.resumeRelevance,
    overallRecommendation: computed.overallRecommendation,
    strengths: narrative.strengths?.length ? narrative.strengths : fallback.strengths,
    weaknesses: narrative.weaknesses?.length ? narrative.weaknesses : fallback.weaknesses,
    experienceSummary: narrative.experienceSummary || fallback.experienceSummary,
    educationSummary: narrative.educationSummary || fallback.educationSummary,
    projectsSummary: narrative.projectsSummary || fallback.projectsSummary,
    suggestions: narrative.suggestions?.length ? narrative.suggestions : fallback.suggestions,
    recruiterSummary: narrative.recruiterSummary || fallback.recruiterSummary,
  };
};

/**
 * Deterministic fallback narrative for the recruiter-facing applicant
 * analysis, built entirely from atsScoring.js output.
 */
function buildFallbackApplicantNarrative(computed) {
  const strengths = [];
  if (computed.requiredSkillsFound.length) strengths.push(`Demonstrates ${computed.requiredSkillsFound.length} of the job's required skills: ${computed.requiredSkillsFound.join(', ')}.`);
  if (computed.experienceYears >= 1) strengths.push(`Approximately ${computed.experienceYears} year(s) of relevant experience.`);
  if (computed.projectsCount > 0) strengths.push(`${computed.projectsCount} relevant project(s) listed.`);
  if (!strengths.length) strengths.push('Resume was parsed successfully for review.');

  const weaknesses = [];
  if (computed.missingSkills.length) weaknesses.push(`Missing required skill(s): ${computed.missingSkills.join(', ')}.`);
  if (computed.experienceMatch < 60) weaknesses.push('Experience level appears below what the role typically requires.');
  if (computed.projectRelevance < 40) weaknesses.push('Listed projects show limited overlap with this role\'s requirements.');
  if (!weaknesses.length) weaknesses.push('No major gaps detected against the job requirements.');

  const experienceSummary = `Candidate shows an estimated ${computed.experienceYears} year(s) of experience based on resume content.`;
  const educationSummary = computed.educationLevel > 0
    ? 'Candidate lists a recognizable degree relevant to the field.'
    : 'No clearly recognizable degree was detected in the resume text.';
  const projectsSummary = computed.projectsCount > 0
    ? `${computed.projectsCount} project(s) detected in the resume.`
    : 'No projects listed.';

  const suggestions = [];
  if (computed.missingSkills.length) suggestions.push(`Ask about experience with: ${computed.missingSkills.slice(0, 3).join(', ')}.`);
  if (computed.formattingIssues.length) suggestions.push('Verify resume details directly, as some formatting issues were detected during parsing.');
  if (!suggestions.length) suggestions.push('Proceed with standard interview screening.');

  const recruiterSummary = `Candidate scored ${computed.jobMatchPercentage}% overall job match (skill match ${computed.skillMatch}%, ` +
    `experience match ${computed.experienceMatch}%, education match ${computed.educationMatch}%), leading to a "${computed.overallRecommendation}" recommendation.`;

  return { strengths, weaknesses, experienceSummary, educationSummary, projectsSummary, suggestions, recruiterSummary };
}

/**
 * Interview Question Generator
 *
 * `options` is an additive 4th parameter (default `{}`) introduced for the
 * Interview Preparation Agent's more targeted actions — every existing call
 * site (controllers/aiController.js's startInterview, unchanged) calls this
 * with exactly 3 positional args, so `options = {}` reproduces the exact
 * prompt/behavior that existed before these fields were added.
 *
 * The `type` enum requested from the model is deliberately left unchanged
 * ("technical|behavioral|situational|cultural") because that's what
 * models/Interview.js's questionSchema enum accepts when a session is
 * persisted — `focusType: 'coding'` steers the model to ask code/
 * algorithm-flavored *technical* questions rather than introducing a new
 * persisted type value that would require a schema migration.
 *
 * `focusType: 'project'` and the `missingSkills` / `jobDescription` options
 * were added for the Interview Preparation Agent's `prepare-interview`
 * action (the "generate a full prep pack from resume + JD + missing
 * skills" responsibility) — again purely additive, `options = {}` still
 * reproduces the exact original prompt for any caller that omits them.
 *
 * @param {string} role
 * @param {string} [difficulty]
 * @param {number} [count]
 * @param {Object} [options]
 * @param {'technical'|'hr'|'coding'|'project'|'general'} [options.focusType] - steers question emphasis; 'general' (default) matches the original unsteered prompt
 * @param {string} [options.company] - when provided, asks for company-specific flavor/context in the questions
 * @param {string} [options.groundingContext] - optional retrieved-context block (e.g. from the candidate's own resume via services/retrievalService.js) so questions can reference their actual background
 * @param {string} [options.jobDescription] - optional job-posting text/grounding block so questions target what THIS role actually asks for, not just the job title
 * @param {string[]|Array<{skill: string, priority?: string}>} [options.missingSkills] - skill gaps (e.g. from SkillGapAgent) the question set should specifically probe, so weak areas get practiced rather than skipped
 */
const generateInterviewQuestions = async (role, difficulty = 'medium', count = 5, options = {}) => {
  const { focusType = 'general', company = '', groundingContext = '', jobDescription = '', missingSkills = [] } = options;

  const focusInstructions = {
    technical: 'Focus specifically on technical/domain knowledge questions (concepts, tools, architecture, best practices) — avoid HR/behavioral questions.',
    hr: 'Focus specifically on HR, behavioral, and cultural-fit questions (teamwork, conflict resolution, motivation, career goals) — avoid deep technical/coding questions.',
    coding: 'Focus specifically on coding and algorithmic problem-solving questions (data structures, algorithms, complexity, live-coding-style prompts). Still use "technical" as the JSON "type" value for these.',
    project: 'Focus specifically on project-based questions: ask the candidate to walk through specific projects from their own background (design decisions, trade-offs, their individual contribution, challenges hit and how they were resolved, what they would do differently). Still use "technical" as the JSON "type" value for these. If no project background is supplied below, ask generic but role-realistic "tell me about a project where..." questions instead.',
    general: '', // unchanged from the original prompt — a balanced mix across all types
  };
  const focusBlock = focusInstructions[focusType] ? `\n${focusInstructions[focusType]}\n` : '';
  const companyBlock = company ? `\nTailor questions to what a candidate could realistically be asked at "${company}" specifically, where relevant (their known focus areas, tech stack, or interview style) — but keep every question answerable without insider information.\n` : '';
  const groundingBlock = groundingContext
    ? `\nThe candidate's own background (from their resume — reference it naturally where it makes a question more specific, but don't quote it verbatim):\n${groundingContext}\n`
    : '';
  const jobDescriptionBlock = jobDescription
    ? `\nThe actual job description this candidate is preparing for (ground questions in what it specifically asks for, not just the job title):\n${jobDescription.substring(0, 1500)}\n`
    : '';
  const missingSkillNames = (missingSkills || []).map((s) => (typeof s === 'string' ? s : s?.skill)).filter(Boolean);
  const missingSkillsBlock = missingSkillNames.length
    ? `\nThe candidate has been identified as having gaps in these specific skills — include at least one question per category that probes each one, so the candidate can practice their weak areas rather than only their strengths: ${missingSkillNames.join(', ')}.\n`
    : '';

  const prompt = `
Generate ${count} interview questions for a "${role}" position at ${difficulty} difficulty.
${focusBlock}${companyBlock}${groundingBlock}${jobDescriptionBlock}${missingSkillsBlock}
Return a JSON array with this exact structure:
[
  {
    "question": "Interview question here?",
    "type": "technical|behavioral|situational|cultural",
    "difficulty": "${difficulty}",
    "idealAnswer": "What a strong answer would include",
    "tips": "Tips for answering this question"
  }
]

Return ONLY the JSON array, no other text.`;
  const response = await callAI(prompt);
  return parseJSON(response);
};

/**
 * Answer Evaluator
 */
const evaluateAnswer = async (question, userAnswer, role) => {
  const prompt = `
You are an interview coach. Evaluate this interview answer for a "${role}" position.

Question: ${question}
Candidate's answer: ${userAnswer}

Return a JSON object with this exact structure:
{
  "score": 7,
  "feedback": "Detailed feedback on the answer",
  "strengths": ["what was good"],
  "improvements": ["what to improve"],
  "idealAnswer": "A model answer for this question",
  "followUpQuestions": ["potential follow-up 1"]
}

Return ONLY the JSON, no other text.`;
  const response = await callAI(prompt);
  return parseJSON(response);
};

/**
 * Learning Roadmap Generator
 * ──────────────────────────
 * Mirrors the same "compute first, narrate second" pattern used for ATS
 * scoring (atsScoring.js) and applicant resume analysis above.
 *
 * The old version handed the LLM a single free-text `timeline` string
 * inside a prompt whose *example* JSON also happened to say "6 months"
 * and "Month 1-2" — models (especially the Groq fallback) anchored on
 * that example and produced a roadmap that barely changed regardless of
 * what duration the user actually picked. Course names, platforms and
 * costs were pure LLM invention on top of that.
 *
 * Now every number — week count, phase lengths, weekly workload, which
 * real Coursera/IBM SkillsBuild/Udemy courses are recommended, and their
 * real prices — is computed deterministically by roadmapEngine.js /
 * courseRecommendation.js from the user's actual selected duration and
 * skill gaps. The AI is only asked to turn that already-computed
 * structure into readable titles, milestone descriptions and outcomes,
 * and is explicitly told not to invent or change any of the numbers. If
 * the AI is unavailable, a fully deterministic fallback narrative (built
 * from the same computed structure) is used instead, so the roadmap is
 * always usable even without an AI provider configured.
 *
 * @param {Array<{skill: string, priority?: string, proficiency?: string}>} skillGaps
 * @param {string} targetJob
 * @param {string|number} duration - e.g. "6 months", "10 weeks", or a week count
 * @param {Object} preferences - { weeklyHoursAvailable, coursesPerSkill }
 */
const generateLearningRoadmap = async (skillGaps, targetJob, duration = '6 months', preferences = {}) => {
  const structure = buildRoadmapStructure(skillGaps, duration, preferences);
  const fallback = buildFallbackRoadmapNarrative(structure, targetJob);

  const grounding = `
Computed roadmap plan (already calculated — do NOT invent or change any durations, weeks, course names, platforms, or costs):
- Target role: ${targetJob}
- Total duration: ${structure.totalDuration} (${structure.totalDurationWeeks} weeks)
- Weekly commitment: ${structure.weeklyCommitment}
- Total courses: ${structure.totalCourses} (${structure.freeCourseCount} free, ${structure.paidCourseCount} paid)
- Total estimated cost: ₹${structure.totalEstimatedCostINR.toLocaleString('en-IN')}
- Skill milestones: ${structure.skillMilestones.join(', ')}
- Phases:
${structure.phases.map(p => `  Phase ${p.phase} (${p.weekRange}, ${p.durationWeeks} wks, ~${p.weeklyWorkloadHours} hrs/wk): skills [${p.skillsTargeted.join(', ')}]; courses [${p.courses.map(c => c.title).join('; ') || 'no catalog match yet'}]`).join('\n')}`;

  const prompt = `
You are a career-learning advisor AI. You have been given an already-computed roadmap plan — every duration, phase, course, and cost is FIXED. Your job is ONLY to write the narrative text around it: an overall title & summary, a short title and milestone goal per phase, refined learning objectives, and the outcomes of completing the whole roadmap.

${grounding}

Return a JSON object with this exact structure:
{
  "roadmapTitle": "short catchy title for this roadmap towards ${targetJob}",
  "summary": "2-3 sentence overview of the plan and how it is paced",
  "phases": [
    { "phase": 1, "title": "short phase title", "milestoneGoal": "what the learner will be able to do after this phase", "learningObjectives": ["objective 1", "objective 2"] }
  ],
  "expectedOutcomes": ["concrete outcome 1 after completing the whole roadmap", "outcome 2", "outcome 3"]
}

Include exactly ${structure.phases.length} entries in "phases", numbered 1 to ${structure.phases.length}, matching the phases above in order. Return ONLY the JSON, no other text.`;

  let narrative;
  try {
    const response = await callAI(prompt);
    narrative = parseJSON(response);
  } catch (err) {
    narrative = fallback;
  }

  const narrativePhaseByNum = new Map((narrative.phases || []).map(p => [p.phase, p]));

  const phases = structure.phases.map(p => {
    const n = narrativePhaseByNum.get(p.phase) || {};
    const fb = fallback.phases.find(f => f.phase === p.phase) || {};
    return {
      phase: p.phase,
      duration: p.weekRange,
      durationWeeks: p.durationWeeks,
      title: n.title || fb.title,
      weeklyWorkload: `${p.weeklyWorkloadHours} hrs/week`,
      milestoneGoal: n.milestoneGoal || fb.milestoneGoal,
      learningObjectives: n.learningObjectives?.length ? n.learningObjectives : p.objectives,
      skillsTargeted: p.skillsTargeted,
      courses: p.courses.map(c => ({
        sequence: c.sequence,
        title: c.title,
        provider: c.provider,
        platform: c.platform,
        durationHours: c.durationHours,
        level: c.level,
        cost: c.pricing.isFree ? 'free' : 'paid',
        priceDisplay: c.priceDisplay,
        url: c.url,
        matchScore: c.matchScore,
        skillsCovered: c.coversSkills,
      })),
    };
  });

  return {
    roadmapTitle: narrative.roadmapTitle || fallback.roadmapTitle,
    summary: narrative.summary || fallback.summary,
    totalDuration: structure.totalDuration,
    totalDurationWeeks: structure.totalDurationWeeks,
    weeklyCommitment: structure.weeklyCommitment,
    totalEstimatedCost: structure.totalEstimatedCostINR,
    costBreakdown: structure.costBreakdown,
    freeCourseCount: structure.freeCourseCount,
    paidCourseCount: structure.paidCourseCount,
    totalCourses: structure.totalCourses,
    skillMilestones: structure.skillMilestones,
    phases,
    expectedOutcomes: narrative.expectedOutcomes?.length ? narrative.expectedOutcomes : fallback.expectedOutcomes,
  };
};

/**
 * Deterministic fallback narrative for the learning roadmap, built
 * entirely from roadmapEngine.js output. Used when both AI providers are
 * unavailable, so the roadmap is still fully usable without mock text.
 */
function buildFallbackRoadmapNarrative(structure, targetJob) {
  const phases = structure.phases.map(p => ({
    phase: p.phase,
    title: `Phase ${p.phase}: ${p.skillsTargeted.slice(0, 2).join(' & ')}`,
    milestoneGoal: `Be able to apply ${p.skillsTargeted.join(', ')} in real, role-relevant tasks.`,
    learningObjectives: p.objectives,
  }));

  return {
    roadmapTitle: `${structure.totalDuration} Roadmap to ${targetJob || 'Your Target Role'}`,
    summary: `A ${structure.totalDuration} plan covering ${structure.skillMilestones.join(', ')} across ${structure.phases.length} phase(s), using ${structure.totalCourses} curated course(s) (${structure.freeCourseCount} free) at roughly ${structure.weeklyCommitment}.`,
    phases,
    expectedOutcomes: [
      `Demonstrated working proficiency in: ${structure.skillMilestones.join(', ')}.`,
      `Practical, portfolio-ready understanding suitable for ${targetJob || 'the target'} roles.`,
      `Completion of ${structure.totalCourses} curated course(s) from Coursera, IBM SkillsBuild, and Udemy.`,
    ],
  };
}

/**
 * Project Recommender
 * ─────────────────────
 * New for the Learning Roadmap Agent's "Project Recommendation"
 * responsibility. Deliberately kept separate from generateLearningRoadmap
 * above rather than folded into it: a roadmap's phases already carry
 * *course* recommendations (deterministic, from roadmapEngine.js /
 * courseRecommendation.js), and hands-on project ideas are a distinct
 * artifact a learner may want on their own (e.g. "just give me 3 project
 * ideas for these skills" without regenerating a whole phased roadmap).
 *
 * Grounded the same way as everything else in this file: the skill list
 * and target role are fixed inputs the model must build around, not
 * invent independently of.
 *
 * @param {string[]} skills - skill names to build project ideas around (e.g. skillMilestones from a roadmap, or raw skill gap names)
 * @param {string} [targetJob]
 * @param {number} [count]
 */
const recommendProjects = async (skills, targetJob = '', count = 3) => {
  const skillList = (skills || []).filter(Boolean).join(', ');

  const prompt = `
You are a career-learning advisor AI. Recommend ${count} hands-on portfolio projects that would help a learner practice and demonstrate these specific skills: ${skillList || 'general software development'}.
${targetJob ? `The learner is targeting "${targetJob}" roles — make the projects relevant to that kind of work.` : ''}

Return a JSON array with this exact structure:
[
  {
    "title": "short project title",
    "description": "2-3 sentence description of what to build",
    "skillsPracticed": ["skill1", "skill2"],
    "difficulty": "beginner|intermediate|advanced",
    "estimatedHours": 20
  }
]

Return ONLY the JSON array, no other text.`;

  try {
    const response = await callAI(prompt);
    return parseJSON(response);
  } catch (err) {
    return buildFallbackProjectRecommendations(skills, targetJob, count);
  }
};

/**
 * Deterministic fallback for recommendProjects — one generic but
 * skill-anchored project idea per requested slot, used only when both AI
 * providers are unavailable so the caller never gets an empty array.
 */
function buildFallbackProjectRecommendations(skills, targetJob, count) {
  const skillList = (skills || []).filter(Boolean);
  if (!skillList.length) return [];
  const chunkSize = Math.max(1, Math.ceil(skillList.length / count));
  const projects = [];
  for (let i = 0; i < count && i * chunkSize < skillList.length; i++) {
    const group = skillList.slice(i * chunkSize, (i + 1) * chunkSize);
    projects.push({
      title: `${group[0]}-focused portfolio project`,
      description: `Build a small, real project that applies ${group.join(', ')} end to end${targetJob ? ` in a way relevant to ${targetJob} roles` : ''}. Document it with a README and deploy a working demo if possible.`,
      skillsPracticed: group,
      difficulty: 'beginner',
      estimatedHours: 15,
    });
  }
  return projects;
}

module.exports = {
  callAI,
  callAIStream,
  parseJSON,
  analyzeSkillGap,
  getMarketTrends,
  analyzeResume,
  analyzeApplicantResume,
  summarizeResume,
  generateInterviewQuestions,
  evaluateAnswer,
  generateLearningRoadmap,
  recommendProjects,
};
