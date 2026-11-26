// src/pages/business/BusinessDashboard.js
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase, CheckCircle2, XCircle, Users, Star, Clock,
  PlusCircle, Eye, Pencil, TrendingUp,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, FunnelChart, Funnel, LabelList, PieChart, Pie, Cell,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/business/StatCard';
import { businessJobsAPI, businessAnalyticsAPI } from '../../utils/api';
import '../../components/business/business.css';

const STATUS_BADGE = { open: 'badge-green', closed: 'badge-gray' };

const APPLICANT_BADGE = {
  applied: 'badge-blue',
  shortlisted: 'badge-teal',
  screening: 'badge-purple',
  interview: 'badge-yellow',
  offer: 'badge-green',
  rejected: 'badge-red',
  withdrawn: 'badge-gray',
};

const APPLICANT_STATUS_LABEL = {
  applied: 'Pending',
  shortlisted: 'Shortlisted',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

// Number of applicants shown in the Recent Applicants preview on this dashboard.
// (Full list lives on the dedicated Applicants page.)
const RECENT_APPLICANTS_LIMIT = 4;

// Funnel stage colors (Pending → Offer), reused for the funnel chart labels.
const FUNNEL_COLORS = ['#2563EB', '#0E7490', '#7C3AED', '#D97706', '#059669'];

// Shortlisted / Rejected / Pending donut colors.
const STATUS_PIE_COLORS = { shortlisted: '#0E7490', rejected: '#DC2626', pending: '#D97706' };

const formatDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const EMPTY_ANALYTICS = {
  applicationsOverTime: [],
  applicationsPerJob: [],
  hiringFunnel: [],
  statusCounts: { pending: 0, shortlisted: 0, rejected: 0 },
  topSkills: [],
  recentApplicants: [],
};

export default function BusinessDashboard() {
  const { user } = useAuth();
  const companyName = user?.companyName || user?.name || 'there';

  const [jobs, setJobs] = useState([]);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    businessJobsAPI.getAll()
      .then(res => { if (mounted) setJobs(res.data.jobs); })
      .catch(() => {})
      .finally(() => { if (mounted) setJobsLoading(false); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    // Single call powers every chart on this page (Applications Over Time,
    // Applications Per Job, Hiring Funnel, Shortlisted/Rejected/Pending,
    // Top Skills, Recent Applicants) instead of one request per widget.
    businessAnalyticsAPI.getDashboard({ months: 6 })
      .then((res) => { if (mounted) setAnalytics({ ...EMPTY_ANALYTICS, ...res.data }); })
      .catch(() => {})
      .finally(() => { if (mounted) setAnalyticsLoading(false); });
    return () => { mounted = false; };
  }, []);

  const {
    applicationsOverTime, applicationsPerJob, hiringFunnel, statusCounts, topSkills, recentApplicants,
  } = analytics;

  const totalJobsPosted = jobs.length;
  const activeJobs = jobs.filter(j => j.status === 'open').length;
  const closedJobs = jobs.filter(j => j.status === 'closed').length;
  const totalApplicants = jobs.reduce((sum, j) => sum + (j.applicantsCount || 0), 0);

  const recentJobPostings = [...jobs]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);

  // Only the latest four applicants are shown here; the full list lives on
  // the dedicated Applicants page.
  const latestApplicants = recentApplicants.slice(0, RECENT_APPLICANTS_LIMIT);

  const funnelData = hiringFunnel.map((step, i) => ({ ...step, fill: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }));

  const statusPieData = [
    { name: 'Shortlisted', key: 'shortlisted', value: statusCounts.shortlisted || 0 },
    { name: 'Rejected', key: 'rejected', value: statusCounts.rejected || 0 },
    { name: 'Pending', key: 'pending', value: statusCounts.pending || 0 },
  ];
  const statusPieTotal = statusPieData.reduce((s, d) => s + d.value, 0);

  const topSkillsData = [...topSkills].sort((a, b) => a.count - b.count); // ascending so horizontal bars read top-to-bottom largest-first

  return (
    <div className="dashboard-page">
      {/* Welcome banner — same structure/style as the User Dashboard's banner */}
      <div className="welcome-banner">
        <div className="welcome-banner-pattern" />
        <div className="welcome-banner-content">
          <h2>Good day, {companyName.split(' ')[0]} <span className="wave">👋</span></h2>
          <p>Here's how your hiring pipeline is performing.</p>
        </div>
        <Link to="/business/jobs/new" className="btn btn-primary welcome-banner-cta">
          <PlusCircle size={16} /> Create Job Post
        </Link>
      </div>

      {/* Stat cards — same card style/typography as the User Dashboard's stat cards */}
      <div className="biz-stats-grid">
        <StatCard icon={Briefcase}   value={totalJobsPosted}       label="Total Jobs Posted"       iconBg="#EFF6FF" iconColor="#2563EB" />
        <StatCard icon={CheckCircle2} value={activeJobs}            label="Active Jobs"             iconBg="#ECFDF5" iconColor="#059669" />
        <StatCard icon={XCircle}     value={closedJobs}            label="Closed Jobs"             iconBg="#FEF2F2" iconColor="#DC2626" />
        <StatCard icon={Users}       value={totalApplicants.toLocaleString()} label="Total Applicants" iconBg="#F5F3FF" iconColor="#7C3AED" />
        <StatCard icon={Clock}       value={statusCounts.pending || 0}     label="Pending Review"      iconBg="#FFFBEB" iconColor="#D97706" />
        <StatCard icon={Star}        value={statusCounts.shortlisted || 0} label="Shortlisted Candidates" iconBg="#ECFEFF" iconColor="#0E7490" />
        <StatCard icon={XCircle}     value={statusCounts.rejected || 0}    label="Rejected Applicants" iconBg="#FEF2F2" iconColor="#DC2626" />
      </div>

      {/* Recent job postings — now spans the full available width (Company
          Profile card removed from beside it) */}
      <div className="card">
        <div className="card-head-row">
          <h3 className="card-heading">Recent Job Postings</h3>
          <Link to="/business/jobs" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        <div className="table-wrap">
          {jobsLoading ? (
            <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner spinner-blue" style={{ margin: '0 auto' }}></div></div>
          ) : recentJobPostings.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <p>No job posts yet. <Link to="/business/jobs/new">Create one →</Link></p>
            </div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Status</th>
                  <th>Applicants</th>
                  <th>Deadline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recentJobPostings.map(job => (
                  <tr key={job._id}>
                    <td className="table-title">{job.title}</td>
                    <td><span className={`badge ${STATUS_BADGE[job.status] || 'badge-gray'}`}>{job.status === 'open' ? 'Open' : 'Closed'}</span></td>
                    <td>{job.applicantsCount ?? 0}</td>
                    <td className="table-sub">{formatDate(job.deadline)}</td>
                    <td>
                      <div className="biz-row-actions">
                        <Link to="/business/jobs" className="biz-icon-action" title="View"><Eye size={15} /></Link>
                        <Link to={`/business/jobs/${job._id}/edit`} className="biz-icon-action" title="Edit"><Pencil size={15} /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Recent applicants — latest four only */}
      <div className="card">
        <div className="card-head-row">
          <h3 className="card-heading">Recent Applicants</h3>
          <Link to="/business/applicants" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        <div className="biz-applicant-list">
          {analyticsLoading ? (
            <div style={{ textAlign: 'center', padding: 30 }}><div className="spinner spinner-blue" style={{ margin: '0 auto' }}></div></div>
          ) : latestApplicants.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px 0' }}>
              <p>No applicants yet.</p>
            </div>
          ) : latestApplicants.map(a => (
            <div key={a._id} className="biz-applicant-row">
              <div className="biz-applicant-avatar">
                {a.avatar ? <img src={a.avatar} alt={a.name} /> : a.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
              </div>
              <div className="biz-applicant-main">
                <div className="biz-applicant-name">{a.name}</div>
                <div className="biz-applicant-role">{a.job?.title} • Applied {formatDate(a.appliedAt)}</div>
              </div>
              <div className="biz-applicant-skills">
                {a.skills.slice(0, 3).map(s => <span key={s} className="badge badge-blue">{s}</span>)}
              </div>
              <span className={`badge ${APPLICANT_BADGE[a.status] || 'badge-gray'}`}>{APPLICANT_STATUS_LABEL[a.status] || a.status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hiring analytics */}
      <div>
        <h3 className="card-heading" style={{ marginBottom: 16 }}>Hiring Analytics</h3>

        <div className="biz-analytics-row-top">
          {/* Applications Over Time */}
          <div className="card biz-chart-card">
            <h3 className="card-heading" style={{ marginBottom: 4 }}>Applications Over Time</h3>
            <div className="biz-chart-sub">Applications received per month, last 6 months</div>
            {analyticsLoading ? (
              <div className="biz-chart-empty"><div className="spinner spinner-blue"></div></div>
            ) : applicationsOverTime.every(d => d.applications === 0) ? (
              <div className="biz-chart-empty">No applications yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={applicationsOverTime} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="appsOverTimeGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="var(--primary)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12.5, border: '1px solid var(--border)' }} />
                  <Area
                    type="monotone" dataKey="applications" name="Applications"
                    stroke="var(--primary)" strokeWidth={2.5}
                    fill="url(#appsOverTimeGradient)"
                    dot={{ r: 3, fill: 'var(--primary)' }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Applications Per Job */}
          <div className="card biz-chart-card">
            <h3 className="card-heading" style={{ marginBottom: 4 }}>Applications Per Job</h3>
            <div className="biz-chart-sub">Your top job posts by applicant volume</div>
            {analyticsLoading ? (
              <div className="biz-chart-empty"><div className="spinner spinner-blue"></div></div>
            ) : applicationsPerJob.length === 0 ? (
              <div className="biz-chart-empty">No job applications yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={applicationsPerJob} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category" dataKey="job" tick={{ fontSize: 11.5 }} axisLine={false} tickLine={false}
                    width={110}
                    tickFormatter={(v) => (v.length > 16 ? `${v.slice(0, 16)}…` : v)}
                  />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12.5, border: '1px solid var(--border)' }} />
                  <Bar dataKey="applications" name="Applications" fill="var(--secondary)" radius={[0, 6, 6, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="biz-analytics-row-bottom">
          {/* Hiring Funnel */}
          <div className="card biz-chart-card">
            <h3 className="card-heading" style={{ marginBottom: 4 }}>Hiring Funnel</h3>
            <div className="biz-chart-sub">Pending → Shortlisted → Screening → Interview → Offer</div>
            {analyticsLoading ? (
              <div className="biz-chart-empty"><div className="spinner spinner-blue"></div></div>
            ) : funnelData.every(d => d.value === 0) ? (
              <div className="biz-chart-empty">No applicants yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <FunnelChart>
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12.5, border: '1px solid var(--border)' }} />
                  <Funnel dataKey="value" data={funnelData} isAnimationActive nameKey="stage">
                    <LabelList position="right" dataKey="stage" fill="var(--text-primary)" stroke="none" fontSize={11.5} />
                    <LabelList position="center" dataKey="value" fill="#fff" stroke="none" fontSize={12} fontWeight={700} />
                    {funnelData.map((entry) => <Cell key={entry.stage} fill={entry.fill} />)}
                  </Funnel>
                </FunnelChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Shortlisted / Rejected / Pending */}
          <div className="card biz-chart-card">
            <h3 className="card-heading" style={{ marginBottom: 4 }}>Shortlisted · Rejected · Pending</h3>
            <div className="biz-chart-sub">Current status of all applicants</div>
            {analyticsLoading ? (
              <div className="biz-chart-empty"><div className="spinner spinner-blue"></div></div>
            ) : statusPieTotal === 0 ? (
              <div className="biz-chart-empty">No applicants yet</div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={190}>
                  <PieChart>
                    <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12.5, border: '1px solid var(--border)' }} />
                    <Pie
                      data={statusPieData} dataKey="value" nameKey="name"
                      innerRadius={55} outerRadius={80} paddingAngle={3} strokeWidth={0}
                    >
                      {statusPieData.map((d) => <Cell key={d.key} fill={STATUS_PIE_COLORS[d.key]} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="biz-legend-chips">
                  {statusPieData.map((d) => (
                    <span className="biz-legend-chip" key={d.key}>
                      <span className="biz-legend-dot" style={{ background: STATUS_PIE_COLORS[d.key] }}></span>
                      {d.name} ({d.value})
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Top Skills */}
          <div className="card biz-chart-card">
            <h3 className="card-heading" style={{ marginBottom: 4 }}><TrendingUp size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Top Skills</h3>
            <div className="biz-chart-sub">Most common skills among your applicants</div>
            {analyticsLoading ? (
              <div className="biz-chart-empty"><div className="spinner spinner-blue"></div></div>
            ) : topSkillsData.length === 0 ? (
              <div className="biz-chart-empty">No skill data yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topSkillsData} layout="vertical" margin={{ top: 5, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="skill" tick={{ fontSize: 11.5 }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12.5, border: '1px solid var(--border)' }} />
                  <Bar dataKey="count" name="Applicants" fill="#059669" radius={[0, 6, 6, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
