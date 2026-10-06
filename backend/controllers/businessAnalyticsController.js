// controllers/businessAnalyticsController.js
//
// Powers the Business Dashboard's analytics panels:
//   - Applications Over Time (line/area chart)
//   - Applications Per Job (bar chart)
//   - Hiring Funnel (Pending → Shortlisted → Screening → Interview → Offer)
//   - Shortlisted / Rejected / Pending counts
//   - Top Skills across applicants
//   - Recent Applicants
//
// Everything is computed from the two collections that already exist
// (Job, Application) plus a small lookup into User for skills — there is no
// new schema. The whole payload is produced by ONE Application.aggregate()
// call using $facet, so the dashboard costs a single round trip to Mongo
// (plus one small follow-up query for skill names) no matter how many
// widgets it renders, instead of one query per chart.
const Job = require('../models/Job');
const Application = require('../models/Application');
const User = require('../models/User');

const STATUS_LIST = ['saved', 'applied', 'shortlisted', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Builds a zero-filled list of the last `count` months (oldest → newest) so
// the "Applications Over Time" chart never has gaps for months with no
// applications, and always renders a consistent x-axis.
const buildMonthBuckets = (count) => {
  const buckets = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: MONTH_LABELS[d.getMonth()], applications: 0 });
  }
  return buckets;
};

// @desc    Aggregated analytics for the Business Dashboard: applications
//          over time, applications per job, hiring funnel, status counts,
//          top skills, and recent applicants — scoped to the logged-in
//          business's own job postings.
// @route   GET /api/business/analytics/dashboard
// @query   months (default 6, max 24) — how far back "Applications Over Time" should go
const getDashboardAnalytics = async (req, res, next) => {
  try {
    const monthsBack = Math.min(24, Math.max(1, parseInt(req.query.months, 10) || 6));
    const buckets = buildMonthBuckets(monthsBack);
    const since = new Date(buckets[0].year, buckets[0].month - 1, 1);

    // Scope everything to jobs owned by the logged-in business account.
    // .lean() avoids the overhead of hydrating full Mongoose documents for
    // what is essentially a read-only id + title lookup.
    const myJobs = await Job.find({ postedByUser: req.user._id }).select('_id title').lean();
    const myJobIds = myJobs.map((j) => j._id);
    const jobTitleById = new Map(myJobs.map((j) => [String(j._id), j.title]));

    const emptyStatusCounts = Object.fromEntries(STATUS_LIST.map((s) => [s, 0]));

    if (myJobIds.length === 0) {
      return res.json({
        success: true,
        applicationsOverTime: buckets.map(({ label, applications }) => ({ month: label, applications })),
        applicationsPerJob: [],
        hiringFunnel: [
          { stage: 'Pending', value: 0 },
          { stage: 'Shortlisted', value: 0 },
          { stage: 'Screening', value: 0 },
          { stage: 'Interview', value: 0 },
          { stage: 'Offer', value: 0 },
        ],
        statusCounts: { pending: 0, shortlisted: 0, rejected: 0 },
        topSkills: [],
        recentApplicants: [],
      });
    }

    // Single aggregation, four independent branches ($facet) computed from
    // the same initial $match — this is the key optimization: one index
    // scan on { job: 1, ... } feeds every widget instead of five separate
    // queries each re-scanning the Applications collection.
    const [facets] = await Application.aggregate([
      { $match: { job: { $in: myJobIds } } },
      {
        $facet: {
          overTime: [
            { $match: { appliedAt: { $gte: since } } },
            {
              $group: {
                _id: { y: { $year: '$appliedAt' }, m: { $month: '$appliedAt' } },
                count: { $sum: 1 },
              },
            },
          ],
          perJob: [
            { $group: { _id: '$job', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 8 },
          ],
          statusCounts: [
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ],
          applicantIds: [
            { $group: { _id: '$user' } },
          ],
          recent: [
            { $sort: { appliedAt: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'candidate' } },
            { $unwind: '$candidate' },
            {
              $project: {
                appliedAt: 1,
                status: 1,
                name: '$candidate.name',
                avatar: '$candidate.avatar',
                skills: '$candidate.skills.name',
                jobId: '$job',
              },
            },
          ],
        },
      },
    ]);

    // ── Applications Over Time ──────────────────────────────────────────
    const overTimeMap = new Map(
      facets.overTime.map((r) => [`${r._id.y}-${r._id.m}`, r.count])
    );
    const applicationsOverTime = buckets.map((b) => ({
      month: b.label,
      applications: overTimeMap.get(`${b.year}-${b.month}`) || 0,
    }));

    // ── Applications Per Job ─────────────────────────────────────────────
    const applicationsPerJob = facets.perJob.map((r) => ({
      job: jobTitleById.get(String(r._id)) || 'Untitled Job',
      applications: r.count,
    }));

    // ── Hiring Funnel + Status Counts ────────────────────────────────────
    const counts = { ...emptyStatusCounts };
    facets.statusCounts.forEach((r) => {
      if (r._id in counts) counts[r._id] = r.count;
    });

    const hiringFunnel = [
      { stage: 'Pending', value: counts.applied },
      { stage: 'Shortlisted', value: counts.shortlisted },
      { stage: 'Screening', value: counts.screening },
      { stage: 'Interview', value: counts.interview },
      { stage: 'Offer', value: counts.offer },
    ];

    const statusCounts = {
      pending: counts.applied,
      shortlisted: counts.shortlisted,
      rejected: counts.rejected,
    };

    // ── Top Skills ───────────────────────────────────────────────────────
    // Skill frequency is computed from the candidates who actually applied
    // to this business's jobs (deduplicated), not from every user in the
    // platform, so the chart reflects this company's applicant pool.
    const applicantUserIds = facets.applicantIds.map((r) => r._id).filter(Boolean);
    let topSkills = [];
    if (applicantUserIds.length > 0) {
      topSkills = await User.aggregate([
        { $match: { _id: { $in: applicantUserIds } } },
        { $unwind: '$skills' },
        { $group: { _id: '$skills.name', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
        { $project: { _id: 0, skill: '$_id', count: 1 } },
      ]);
    }

    // ── Recent Applicants ────────────────────────────────────────────────
    const recentApplicants = facets.recent.map((r) => ({
      _id: r._id,
      name: r.name,
      avatar: r.avatar || '',
      status: r.status,
      appliedAt: r.appliedAt,
      skills: r.skills || [],
      job: { _id: r.jobId, title: jobTitleById.get(String(r.jobId)) || 'Untitled Job' },
    }));

    res.json({
      success: true,
      applicationsOverTime,
      applicationsPerJob,
      hiringFunnel,
      statusCounts,
      topSkills,
      recentApplicants,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getDashboardAnalytics };
