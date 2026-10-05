// controllers/aiController.js
const aiService = require('../utils/aiService');
const User = require('../models/User');
const Interview = require('../models/Interview');
const chunkService = require('../services/chunkService');
const { runInBackground } = require('../utils/backgroundTask');
const marketTrendService = require('../services/marketTrendService');
const marketIntelligenceService = require('../services/marketIntelligenceService');
const learningRoadmapIndexService = require('../services/learningRoadmapIndexService');
const learningResourceRetrievalService = require('../services/learningResourceRetrievalService');

// @desc    Analyze skill gap
// @route   POST /api/ai/skill-gap
const skillGapAnalysis = async (req, res, next) => {
  try {
    const { targetJob } = req.body;
    const user = await User.findById(req.user._id);

    if (!user.skills || user.skills.length === 0) {
      return res.status(400).json({ success: false, message: 'Please add skills to your profile first' });
    }
    if (!targetJob && !user.targetJob) {
      return res.status(400).json({ success: false, message: 'Please provide a target job' });
    }

    const result = await aiService.analyzeSkillGap(user.skills, targetJob || user.targetJob);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// @desc    Get market trends
// @route   POST /api/ai/market-trends
//
// This is the one AI agent that was previously 100% ungrounded free
// generation — no computed numbers, no retrieved data, just an LLM
// inventing salaries/companies/trends from its own training data. It's
// now the primary example of the retrieval-augmented loop in this
// codebase: retrieve related market_chunks from prior calls for this (or
// a related) role before generating, ground the prompt in whatever was
// found, then index the freshly generated report so future calls for the
// same/related role have real prior context to retrieve instead of none.
const marketTrends = async (req, res, next) => {
  try {
    const { role, location } = req.body;
    const user = await User.findById(req.user._id);
    const targetRole = role || user.targetJob || 'Software Engineer';
    const targetLocation = location || user.location || 'Global';

    const result = await marketTrendService.getGroundedMarketTrends(targetRole, targetLocation, {
      ownerId: req.user._id,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// @desc    Get live market data only (GitHub trending languages/frameworks,
//          Remotive-derived most-demanded skills and hiring trends) — no
//          LLM narrative generation, so this is fast/cheap enough to power
//          a "Trending Now" widget that shouldn't wait on a full report.
//          Cached (see services/cacheService.js) and also persisted +
//          indexed for RAG the same way marketTrends() does (see
//          services/marketIntelligenceService.js).
// @route   GET /api/ai/market-trends/live?role=...&location=...
const getLiveMarketData = async (req, res, next) => {
  try {
    const { role, location } = req.query;
    const user = await User.findById(req.user._id);
    const targetRole = role || user.targetJob || 'Software Engineer';
    const targetLocation = location || user.location || 'Global';

    const liveMarketData = await marketIntelligenceService.collectLiveMarketData(targetRole, targetLocation, {
      ownerId: req.user._id,
    });

    res.json({ success: true, data: liveMarketData });
  } catch (error) {
    next(error);
  }
};

// @desc    Generate learning roadmap
// @route   POST /api/ai/learning-roadmap
//
// NOTE: the frontend sends the selected duration as `duration` (see
// LearningPage in OtherPages.js) — the previous version of this
// controller only ever read `req.body.timeline`, which the client never
// sends, so the roadmap silently always fell back to the hard-coded
// '6 months' default no matter what the user picked. That's fixed here,
// alongside wiring up auto-detected skill gaps and the weekly-hours
// preference that the roadmap engine uses to size phases/workload.
const learningRoadmap = async (req, res, next) => {
  try {
    const { skills, targetJob, duration, timeline, weeklyHoursAvailable, autoDetectSkillGaps } = req.body;
    const user = await User.findById(req.user._id);
    const targetRole = targetJob || user.targetJob;

    if (!targetRole) {
      return res.status(400).json({ success: false, message: 'Please provide a target job' });
    }

    // Skills explicitly typed in by the user always take priority (high).
    const explicitSkills = Array.isArray(skills) ? skills.map(s => String(s).trim()).filter(Boolean) : [];
    let skillGaps = explicitSkills.map(skill => ({ skill, priority: 'high', proficiency: 'beginner' }));

    // Auto-detect additional gaps from the user's profile vs. the target
    // role whenever requested, or whenever no skills were typed in at all.
    const wantsAutoDetect = autoDetectSkillGaps || explicitSkills.length === 0;
    if (wantsAutoDetect && user.skills && user.skills.length > 0) {
      const gapAnalysis = await aiService.analyzeSkillGap(user.skills, targetRole);
      const already = new Set(skillGaps.map(s => s.skill.toLowerCase()));
      const detected = (gapAnalysis.missingSkills || [])
        .filter(g => g.skill && !already.has(g.skill.toLowerCase()))
        .map(g => ({ skill: g.skill, priority: g.priority || 'medium', proficiency: 'beginner' }));
      skillGaps = [...skillGaps, ...detected];
    }

    if (skillGaps.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Enter skills to learn, or add skills to your profile so gaps can be auto-detected',
      });
    }

    const preferences = {
      weeklyHoursAvailable: weeklyHoursAvailable ? Number(weeklyHoursAvailable) : undefined,
    };

    const result = await aiService.generateLearningRoadmap(
      skillGaps,
      targetRole,
      duration || timeline || '6 months',
      preferences
    );

    // Best-effort RAG indexing — never blocks the response. Roadmaps are
    // computed on demand and never persisted as their own document, so
    // sourceId is a synthetic id rather than a real ObjectId.
    await learningRoadmapIndexService.indexRoadmapResult(result, targetRole, req.user._id);

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

// @desc    Semantic search over the learning resource catalog (Coursera,
//          IBM SkillsBuild, Infosys Springboard, Udemy, GitHub)
// @route   POST /api/ai/learning-resources/search
//
// Pure RAG retrieval, no LLM call and no roadmap assembly — this is the
// thin HTTP entry point over
// services/learningResourceRetrievalService.js (the same reusable
// service agents/learningRoadmapAgent/LearningRoadmapAgent.js's
// 'retrieve-relevant-resources' action calls), added so the new
// learning_resources RAG infrastructure is exercisable end-to-end
// without waiting on a future roadmap-generation phase.
const searchLearningResources = async (req, res, next) => {
  try {
    const { skillGaps, missingSkills, targetJob, careerGoal, queryText, resourceType, provider, difficulty, limit } = req.body;
    const user = await User.findById(req.user._id);
    const effectiveTargetJob = targetJob || user.targetJob;

    const options = { targetJob: effectiveTargetJob, careerGoal, resourceType, provider, difficulty, limit };

    if (Array.isArray(skillGaps) && skillGaps.length > 0) {
      const perSkill = await learningResourceRetrievalService.retrieveLearningResourcesPerSkill(skillGaps, options);
      return res.json({ success: true, data: { perSkill } });
    }

    if (!missingSkills?.length && !effectiveTargetJob && !careerGoal && !queryText) {
      return res.status(400).json({
        success: false,
        message: 'Provide at least one of skillGaps, missingSkills, targetJob, careerGoal, or queryText',
      });
    }

    const resources = await learningResourceRetrievalService.retrieveLearningResources({
      ...options,
      missingSkills: missingSkills || [],
      queryText,
    });
    res.json({ success: true, data: { resources } });
  } catch (error) {
    next(error);
  }
};

// @desc    Start interview session
// @route   POST /api/interview/start
const startInterview = async (req, res, next) => {
  try {
    const { role, difficulty, count } = req.body;

    if (!role) return res.status(400).json({ success: false, message: 'Role is required' });

    const questions = await aiService.generateInterviewQuestions(role, difficulty || 'medium', count || 5);

    const interview = await Interview.create({
      user: req.user._id,
      role,
      difficulty: difficulty || 'medium',
      questions: questions.map(q => ({
        question: q.question,
        type: q.type,
        difficulty: q.difficulty,
        idealAnswer: q.idealAnswer,
      })),
    });

    // Best-effort RAG indexing — runs in the background so it never adds
    // latency to the response.
    {
      const questionText = interview.questions
        .map((q, i) => `Question ${i + 1} (${q.type}, ${q.difficulty})\n${q.question}`)
        .join('\n\n');
      runInBackground(() => chunkService.indexInterviewText(questionText, {
        sourceId: `${interview._id}:questions`,
        sourceType: 'interview_question',
        owner: req.user._id,
        metadata: { role: interview.role, difficulty: interview.difficulty },
      }), 'interview questions RAG indexing');
    }

    res.json({ success: true, interview });
  } catch (error) {
    next(error);
  }
};

// @desc    Submit answer for evaluation
// @route   POST /api/interview/:id/answer
const submitAnswer = async (req, res, next) => {
  try {
    const { questionIndex, answer } = req.body;
    const interview = await Interview.findById(req.params.id);

    if (!interview) return res.status(404).json({ success: false, message: 'Interview not found' });
    if (interview.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const question = interview.questions[questionIndex];
    if (!question) return res.status(400).json({ success: false, message: 'Question not found' });

    const evaluation = await aiService.evaluateAnswer(question.question, answer, interview.role);

    question.userAnswer = answer;
    question.score = evaluation.score;
    question.feedback = evaluation.feedback;
    question.idealAnswer = evaluation.idealAnswer;
    question.answered = true;

    // Check if all answered and calculate overall
    const answered = interview.questions.filter(q => q.answered);
    if (answered.length === interview.questions.length) {
      interview.status = 'completed';
      interview.completedAt = new Date();
      interview.overallScore = Math.round(answered.reduce((sum, q) => sum + q.score, 0) / answered.length);
      interview.overallFeedback = `You completed the interview with an average score of ${interview.overallScore}/10.`;
    }

    await interview.save();

    // Best-effort RAG indexing — runs in the background so it never adds
    // latency to the response.
    {
      const answerText = `Question\n${question.question}\n\nAnswer\n${answer}\n\nFeedback\n${evaluation.feedback}`;
      runInBackground(() => chunkService.indexInterviewText(answerText, {
        sourceId: `${interview._id}:answer:${questionIndex}`,
        sourceType: 'interview_answer',
        owner: req.user._id,
        metadata: { role: interview.role, questionIndex: Number(questionIndex), score: evaluation.score },
      }), 'interview answer RAG indexing');
    }

    res.json({ success: true, evaluation, interview });
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's interviews
// @route   GET /api/interview
const getInterviews = async (req, res, next) => {
  try {
    const interviews = await Interview.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, interviews });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  skillGapAnalysis,
  marketTrends,
  getLiveMarketData,
  learningRoadmap,
  searchLearningResources,
  startInterview,
  submitAnswer,
  getInterviews,
};
