// controllers/jobsController.js
const Job = require('../models/Job');
const User = require('../models/User');
const Application = require('../models/Application');
const { safeContainsRegex } = require('../utils/regexHelpers');
const { retrieveChunks } = require('../services/retrievalService');
// calculateMatchScore/effectiveWorkMode/effectiveEmploymentType moved to
// services/jobMatchingService.js so the Job Search Agent
// (agents/jobSearchAgent/JobSearchAgent.js) can reuse the exact same
// matching logic without duplicating it. Behavior here is unchanged.
const { calculateMatchScore, effectiveWorkMode, effectiveEmploymentType } = require('../services/jobMatchingService');

// @desc    Get recommended jobs for user (with match scores, search & filters)
// @route   GET /api/jobs/recommended
const getRecommendedJobs = async (req, res, next) => {
  try {
    const {
      search, location, experience, skills,
      minSalary, maxSalary, workMode, employmentType,
      page = 1, limit = 8,
    } = req.query;
    const user = await User.findById(req.user._id);

    // Filters that map cleanly to indexed/stored fields go straight to Mongo.
    let query = { isActive: true };
    if (location) query.location = safeContainsRegex(location);
    if (experience) query.experience = experience;

    // .lean() skips Mongoose document hydration for this read-only,
    // never-saved-back list — a real win at this scale (up to 300 docs
    // scored/filtered/sorted per request). Already returns plain objects,
    // so no .toObject() step is needed before further mapping.
    let jobs = await Job.find(query).sort({ postedAt: -1, createdAt: -1 }).limit(300).lean();
    let jobList = jobs;

    // Filters that need to reconcile legacy vs. new schema fields are
    // applied in-memory using the effective-value helpers above.
    if (workMode) jobList = jobList.filter(j => effectiveWorkMode(j) === workMode);
    if (employmentType) jobList = jobList.filter(j => effectiveEmploymentType(j) === employmentType);

    if (skills) {
      const wanted = String(skills).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      if (wanted.length) {
        jobList = jobList.filter(j => (j.requiredSkills || []).some(s => wanted.includes(s.toLowerCase())));
      }
    }

    if (minSalary) {
      const min = Number(minSalary);
      jobList = jobList.filter(j => (j.salaryMax || j.salaryMin || 0) >= min || (!j.salaryMin && !j.salaryMax));
    }
    if (maxSalary) {
      const max = Number(maxSalary);
      jobList = jobList.filter(j => (j.salaryMin || 0) <= max || (!j.salaryMin && !j.salaryMax));
    }

    if (search) {
      const q = String(search).trim().toLowerCase();
      if (q) {
        jobList = jobList.filter(j =>
          j.title?.toLowerCase().includes(q) ||
          j.company?.toLowerCase().includes(q) ||
          j.description?.toLowerCase().includes(q) ||
          (j.requiredSkills || []).some(s => s.toLowerCase().includes(q))
        );
      }
    }

    // Applications already submitted by this user, used to mark jobs as "Applied"
    // so the Apply button reflects duplicate-prevention without an extra round trip.
    const appliedJobIds = new Set(
      (await Application.find({ user: req.user._id, job: { $ne: null } }).select('job').lean())
        .map(a => a.job?.toString())
    );

    // Score and sort jobs by skill match
    const scoredJobs = jobList.map(job => ({
      ...job,
      matchScore: calculateMatchScore(user.skills, job.requiredSkills),
      isSaved: user.savedJobs.includes(job._id.toString()),
      isApplied: appliedJobIds.has(job._id.toString()),
    })).sort((a, b) => b.matchScore - a.matchScore);

    // Paginate
    const startIdx = (page - 1) * limit;
    const paginated = scoredJobs.slice(startIdx, startIdx + Number(limit));

    res.json({
      success: true,
      count: scoredJobs.length,
      page: Number(page),
      pages: Math.max(1, Math.ceil(scoredJobs.length / limit)),
      jobs: paginated,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get all jobs
// @route   GET /api/jobs
const getJobs = async (req, res, next) => {
  try {
    const { search, location, experience, type, page = 1, limit = 10 } = req.query;
    let query = { isActive: true };

    if (search) query.$text = { $search: search };
    if (location) query.location = safeContainsRegex(location);
    if (experience) query.experience = experience;
    if (type) query.type = type;

    const total = await Job.countDocuments(query);
    const jobs = await Job.find(query)
      .sort({ postedAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    res.json({ success: true, count: total, page: Number(page), pages: Math.ceil(total / limit), jobs });
  } catch (error) {
    next(error);
  }
};

// @desc    Get single job
// @route   GET /api/jobs/:id
const getJob = async (req, res, next) => {
  try {
    const job = await Job.findById(req.params.id).lean();
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });
    res.json({ success: true, job });
  } catch (error) {
    next(error);
  }
};

// @desc    Save / unsave a job
// @route   POST /api/jobs/:id/save
const toggleSaveJob = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    const jobId = req.params.id;

    const idx = user.savedJobs.indexOf(jobId);
    if (idx > -1) {
      user.savedJobs.splice(idx, 1);
    } else {
      user.savedJobs.push(jobId);
    }
    await user.save();

    res.json({ success: true, saved: idx === -1, savedJobs: user.savedJobs });
  } catch (error) {
    next(error);
  }
};

// @desc    Seed sample jobs (development only — never wipes real,
//          business-posted jobs; only replaces the platform's own sample
//          listings). Disabled outright in production so an authenticated
//          candidate account can never trigger a destructive reseed.
// @route   POST /api/jobs/seed
const seedJobs = async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: 'Not available in production' });
    }

    const sampleJobs = [
      {
        title: 'Senior Full Stack Developer',
        company: 'TechCorp Inc.',
        location: 'San Francisco, CA',
        type: 'hybrid',
        description: 'Build scalable web applications using React and Node.js.',
        requiredSkills: ['React', 'Node.js', 'MongoDB', 'TypeScript', 'AWS'],
        niceToHave: ['GraphQL', 'Docker', 'Redis'],
        salaryMin: 1800000, salaryMax: 2800000, currency: 'INR', experience: 'senior',
        category: 'Technology', tags: ['frontend', 'backend', 'fullstack'],
      },
      {
        title: 'Machine Learning Engineer',
        company: 'AI Innovations',
        location: 'Remote',
        type: 'remote',
        description: 'Design and implement ML models for production systems.',
        requiredSkills: ['Python', 'TensorFlow', 'PyTorch', 'SQL', 'Statistics'],
        niceToHave: ['Kubernetes', 'Spark', 'MLflow'],
        salaryMin: 1600000, salaryMax: 2600000, currency: 'INR', experience: 'mid',
        category: 'Data Science', tags: ['ml', 'ai', 'python'],
      },
      {
        title: 'Frontend Developer',
        company: 'StartupXYZ',
        location: 'New York, NY',
        type: 'full-time',
        description: 'Create beautiful, responsive user interfaces.',
        requiredSkills: ['React', 'CSS', 'JavaScript', 'HTML'],
        niceToHave: ['Vue.js', 'Figma', 'Storybook'],
        salaryMin: 700000, salaryMax: 1100000, currency: 'INR', experience: 'mid',
        category: 'Technology', tags: ['frontend', 'react', 'ui'],
      },
      {
        title: 'DevOps Engineer',
        company: 'CloudScale',
        location: 'Austin, TX',
        type: 'hybrid',
        description: 'Manage cloud infrastructure and CI/CD pipelines.',
        requiredSkills: ['AWS', 'Docker', 'Kubernetes', 'Terraform', 'Linux'],
        niceToHave: ['Ansible', 'Python', 'GCP'],
        salaryMin: 1200000, salaryMax: 1800000, currency: 'INR', experience: 'mid',
        category: 'DevOps', tags: ['devops', 'cloud', 'infrastructure'],
      },
      {
        title: 'Data Analyst',
        company: 'DataFirst',
        location: 'Chicago, IL',
        type: 'full-time',
        description: 'Analyze data to generate business insights and reports.',
        requiredSkills: ['SQL', 'Python', 'Tableau', 'Excel', 'Statistics'],
        niceToHave: ['Power BI', 'R', 'Spark'],
        salaryMin: 500000, salaryMax: 800000, currency: 'INR', experience: 'entry',
        category: 'Data Science', tags: ['data', 'analytics', 'sql'],
      },
      {
        title: 'Product Manager',
        company: 'ProductHive',
        location: 'Seattle, WA',
        type: 'full-time',
        description: 'Lead product development from ideation to launch.',
        requiredSkills: ['Product Strategy', 'Agile', 'Jira', 'Analytics', 'User Research'],
        niceToHave: ['SQL', 'Figma', 'A/B Testing'],
        salaryMin: 1500000, salaryMax: 2200000, currency: 'INR', experience: 'senior',
        category: 'Product', tags: ['product', 'agile', 'strategy'],
      },
    ];

    // Only ever remove jobs that don't belong to a real business account —
    // i.e. the platform's own sample listings — so re-seeding can never
    // wipe out a company's actual job postings.
    await Job.deleteMany({ postedByUser: { $exists: false } });
    await Job.insertMany(sampleJobs);
    res.json({ success: true, message: `Seeded ${sampleJobs.length} jobs` });
  } catch (error) {
    next(error);
  }
};

// ── Semantic job retrieval (RAG read path) ──────────────────────────────────
// Candidate-facing counterpart to businessJobsController's write-path
// indexing: embeds the candidate's free-text query and runs a MongoDB
// Atlas $vectorSearch against job_chunks (via services/retrievalService.js
// -> services/vectorSearchService.js), so a query like "remote react role
// with mentorship of junior engineers" can match a posting on meaning
// rather than requiring exact keyword overlap the way getJobs'/
// getRecommendedJobs' regex/$text search do.
//
// Deliberately a new, separate endpoint rather than a change to getJobs or
// getRecommendedJobs — neither of those (or their query contracts) is
// touched, so existing keyword search/filter/pagination behavior is
// unaffected. Requires a live Atlas Search vector index (see
// scripts/setupVectorIndexes.js) and GEMINI_API_KEY; if either isn't
// configured this endpoint alone reports a 503, without impacting any
// other job-posting or job-browsing functionality.

// Pull several chunk-level matches per desired job result, since a single
// posting is usually split across multiple sections (overview/
// responsibilities/requirements/benefits) and can legitimately surface
// more than once in the raw vector-search hits.
const CHUNKS_PER_JOB = 4;
const MAX_QUERY_LEN = 300;

// @desc    Semantic (meaning-based) job search over job_chunks via Atlas Vector Search
// @route   GET /api/jobs/semantic-search?q=...&limit=10
const semanticSearchJobs = async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 25);

    if (!q) {
      return res.status(400).json({ success: false, message: 'Please provide a search query (q)' });
    }
    if (q.length > MAX_QUERY_LEN) {
      return res.status(400).json({ success: false, message: `Search query is too long (max ${MAX_QUERY_LEN} characters)` });
    }

    let matches;
    try {
      matches = await retrieveChunks('job', q, { limit: limit * CHUNKS_PER_JOB });
    } catch (err) {
      // Missing GEMINI_API_KEY, embeddings provider hiccup, or the Atlas
      // vector index not having been created yet — surface as a clean
      // "feature unavailable" response rather than a 500, and never let it
      // touch keyword search or job posting.
      console.error('Semantic job search failed:', err.message);
      return res.status(503).json({ success: false, message: 'Semantic search is temporarily unavailable. Please try keyword search instead.' });
    }

    if (!matches.length) {
      return res.json({ success: true, count: 0, jobs: [] });
    }

    // Collapse multiple chunk hits from the same posting down to one
    // result, keeping the highest-scoring chunk (and its text/section) as
    // the "why this matched" snippet, and the best score as that job's
    // relevance ranking.
    const bestBySource = new Map();
    for (const match of matches) {
      const key = String(match.sourceId);
      const existing = bestBySource.get(key);
      if (!existing || match.score > existing.score) bestBySource.set(key, match);
    }

    const ranked = [...bestBySource.values()].sort((a, b) => b.score - a.score);
    const jobIds = ranked.map((m) => m.sourceId);

    // Only ever surface jobs that are still open — mirrors the isActive
    // filter already applied by getJobs/getRecommendedJobs. A job deleted
    // or closed after being chunked (or mid-cleanup) is silently dropped
    // here rather than shown as a dead result.
    const jobs = await Job.find({ _id: { $in: jobIds }, isActive: true }).lean();
    const jobById = new Map(jobs.map((j) => [String(j._id), j]));

    const results = ranked
      .filter((m) => jobById.has(String(m.sourceId)))
      .slice(0, limit)
      .map((m) => ({
        ...jobById.get(String(m.sourceId)),
        relevanceScore: Number(m.score.toFixed(4)),
        matchedSection: m.section,
        matchedSnippet: m.text.length > 280 ? `${m.text.slice(0, 280)}…` : m.text,
      }));

    res.json({ success: true, count: results.length, jobs: results });
  } catch (error) {
    next(error);
  }
};

module.exports = { getJobs, getJob, getRecommendedJobs, toggleSaveJob, seedJobs, semanticSearchJobs };
