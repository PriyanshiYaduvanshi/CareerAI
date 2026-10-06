// src/pages/Dashboard.js
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usersAPI, jobsAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Briefcase, CheckCircle2, Target, Sun, ArrowRight,
  UserRound, Sparkles, MapPin, IndianRupee,
} from 'lucide-react';
import './Dashboard.css';
import { STATUS_COLORS } from '../utils/statusColors';
import { formatCompactINR } from '../utils/currency';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recJobs, setRecJobs] = useState([]);
  const [recJobsLoading, setRecJobsLoading] = useState(true);

  useEffect(() => {
    usersAPI.getDashboard()
      .then(res => setData(res.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));

    jobsAPI.getRecommended({ page: 1, limit: 3 })
      .then(res => setRecJobs(res.data.jobs || []))
      .catch(console.error)
      .finally(() => setRecJobsLoading(false));
  }, []);

  if (loading) return <div className="loading-screen"><div className="spinner spinner-blue"></div><p>Loading dashboard...</p></div>;

  const stats = data?.appStats || {};

  const chartData = [
    { name: 'Applied', value: stats.applied || 0 },
    { name: 'Screening', value: stats.screening || 0 },
    { name: 'Interview', value: stats.interviews || 0 },
    { name: 'Offer', value: stats.offers || 0 },
  ];

  return (
    <div className="dashboard-page">
      {/* Welcome banner */}
      <div className="welcome-banner">
        <div className="welcome-banner-pattern" />
        <div className="welcome-banner-content">
          <h2>Good day, {user?.name?.split(' ')[0]} <span className="wave">👋</span></h2>
          <p>Here's your career journey at a glance.</p>
        </div>
        {!user?.profileComplete && (
          <Link to="/profile" className="btn btn-primary welcome-banner-cta">Complete Profile <ArrowRight size={15} /></Link>
        )}
      </div>

      {/* Stats grid */}
      <div className="grid-4 stats-grid">
        {[
          { icon: Briefcase, label: 'Total Applications', value: stats.total || 0, iconBg: '#FDE2E4', iconColor: '#DC2626' },
          { icon: CheckCircle2, label: 'Applied', value: stats.applied || 0, iconBg: '#D6F5DF', iconColor: '#059669' },
          { icon: Target, label: 'Interviews', value: stats.interviews || 0, iconBg: '#EAE0FB', iconColor: '#7C3AED' },
          { icon: Sun, label: 'Offers', value: stats.offers || 0, iconBg: '#FDF0CB', iconColor: '#D97706' },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="card stat-card">
              <div className="stat-icon" style={{ background: s.iconBg, color: s.iconColor }}>
                <Icon size={21} strokeWidth={2.2} />
              </div>
              <div className="stat-info">
                <div className="value">{s.value}</div>
                <div className="label">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid-2 mid-grid">
        {/* Application pipeline chart */}
        <div className="card">
          <h3 className="card-heading">Application Pipeline</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 6, right: 10, left: -14, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid var(--border-light)', fontSize: 13 }} />
              <Line type="monotone" dataKey="value" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 4, fill: 'var(--primary)' }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Skills summary */}
        <div className="card">
          <h3 className="card-heading">Your Skills</h3>
          {user?.skills?.length > 0 ? (
            <div className="skills-cloud">
              {user.skills.slice(0, 10).map((s, i) => (
                <span key={i} className={`badge badge-${['blue','purple','green','yellow'][i % 4]}`}>{s.name}</span>
              ))}
            </div>
          ) : (
            <div className="empty-state empty-state-compact">
              <p>No skills added yet.</p>
              <Link to="/profile" className="btn btn-outline btn-sm">Add Skills</Link>
            </div>
          )}
          <div className="target-role">
            <div className="target-role-label">Target Role</div>
            <div className={`target-role-value ${!user?.targetJob ? 'muted' : ''}`}>
              {user?.targetJob || 'Not set — add in profile'}
            </div>
          </div>
        </div>
      </div>

      {/* Job Recommendations preview */}
      <div className="card">
        <div className="card-head-row">
          <h3 className="card-heading">Job Recommendations</h3>
          <Link to="/jobs" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        {recJobsLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><div className="spinner spinner-blue" style={{ margin: '0 auto' }}></div></div>
        ) : recJobs.length > 0 ? (
          <div className="rec-jobs-row">
            {recJobs.map(job => (
              <Link to={`/jobs/${job._id}`} key={job._id} className="rec-job-card">
                <div className="rec-job-logo">
                  {job.companyLogo || job.logoUrl
                    ? <img src={job.companyLogo || job.logoUrl} alt={job.company} />
                    : (job.company || '?').charAt(0).toUpperCase()}
                </div>
                <div className="rec-job-info">
                  <div className="rec-job-title">{job.title}</div>
                  <div className="rec-job-company">{job.company}</div>
                  <div className="rec-job-meta">
                    <span><MapPin size={11} /> {job.location}</span>
                    {(job.salaryMin || job.salaryMax) > 0 && (
                      <span><IndianRupee size={11} /> {formatCompactINR(job.salaryMax || job.salaryMin).replace('₹', '')}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state empty-state-compact">
            <p>No job recommendations yet.</p>
            <Link to="/jobs" className="btn btn-outline btn-sm">Browse Jobs</Link>
          </div>
        )}
      </div>

      {/* Recent applications */}
      <div className="card">
        <div className="card-head-row">
          <h3 className="card-heading">Recent Applications</h3>
          <Link to="/applications" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        {data?.applications?.length > 0 ? (
          <div className="app-list">
            {data.applications.map(app => (
              <div key={app._id} className="app-item">
                <div>
                  <div className="app-item-title">{app.job?.title || app.jobTitle || 'Job'}</div>
                  <div className="app-item-company">{app.job?.company || app.company}</div>
                </div>
                <span className="badge" style={{ background: STATUS_COLORS[app.status] + '20', color: STATUS_COLORS[app.status] }}>
                  {app.status}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>No applications yet.</p>
            <div className="empty-state-actions">
              <span className="empty-state-icon"><UserRound size={18} /></span>
              <Link to="/jobs" className="btn btn-primary btn-sm">Browse Jobs</Link>
              <span className="empty-state-icon"><Sparkles size={18} /></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
