// src/pages/JobDetailPage.js — Job Description page (opened from a job card)
import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MapPin, IndianRupee, GraduationCap, Briefcase, Building2,
  Calendar, Check, Star, ListChecks, Gift, AlertCircle,
} from 'lucide-react';
import { jobsAPI } from '../utils/api';
import ApplyJobModal from '../components/common/ApplyJobModal';
import { formatSalaryRange } from '../utils/currency';
import { isPastDeadline, formatDeadline } from '../utils/deadline';
import './JobDetailPage.css';

const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);
  const [toast, setToast] = useState('');

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  const loadJob = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await jobsAPI.getOne(id);
      setJob(res.data.job);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load this job. It may have been removed.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadJob(); }, [loadJob]);

  const handleSave = async () => {
    try {
      const res = await jobsAPI.toggleSave(job._id);
      setJob(j => ({ ...j, isSaved: res.data.saved }));
      showToast(res.data.saved ? '⭐ Job saved' : 'Job unsaved');
    } catch { showToast('❌ Failed to update saved jobs'); }
  };

  const handleApplied = () => {
    setJob(j => ({ ...j, isApplied: true }));
    showToast('✅ Application submitted successfully!');
  };

  if (loading) {
    return (
      <div className="job-detail-page">
        <div className="job-detail-skeleton card">
          <div className="skeleton skeleton-line" style={{ width: '50%', height: 20 }} />
          <div className="skeleton skeleton-line" style={{ width: '30%', height: 14, marginTop: 10 }} />
          <div className="skeleton skeleton-line" style={{ width: '90%', marginTop: 20 }} />
          <div className="skeleton skeleton-line" style={{ width: '95%', marginTop: 8 }} />
          <div className="skeleton skeleton-line" style={{ width: '60%', marginTop: 8 }} />
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="job-detail-page">
        <div className="empty-state card">
          <div className="icon">⚠️</div>
          <h3>Job not found</h3>
          <p>{error || 'This job posting is no longer available.'}</p>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('/jobs')} style={{ marginTop: 12 }}>
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  const expired = isPastDeadline(job.deadline);
  const logo = job.companyLogo || job.logoUrl;
  const skills = job.requiredSkills || [];

  return (
    <div className="job-detail-page">
      {toast && <div className="toast">{toast}</div>}

      <button className="btn btn-ghost btn-sm" onClick={() => navigate('/jobs')} style={{ marginBottom: 16 }}>
        <ArrowLeft size={15} /> Back to Jobs
      </button>

      <div className="card job-detail-header">
        <div className="job-detail-logo" style={{ background: logo ? 'transparent' : '#2563EB' }}>
          {logo ? <img src={logo} alt={job.company} /> : initials(job.company)}
        </div>
        <div className="job-detail-headline">
          <h2>{job.title}</h2>
          <div className="job-detail-company"><Building2 size={14} /> {job.company}</div>
          <div className="job-detail-meta">
            <span><MapPin size={13} /> {job.location}</span>
            <span><IndianRupee size={13} /> {formatSalaryRange(job)}</span>
            <span><GraduationCap size={13} /> {job.experience}</span>
          </div>
          <div className="job-detail-badges">
            <span className="badge badge-purple">{job.employmentType || job.type}</span>
            <span className="badge badge-gray">{job.workMode || (job.type === 'remote' || job.type === 'hybrid' ? job.type : 'onsite')}</span>
            {typeof job.matchScore === 'number' && (
              <span
                className="badge"
                style={{
                  background: job.matchScore >= 70 ? '#ECFDF5' : job.matchScore >= 40 ? '#FFFBEB' : '#FEF2F2',
                  color: job.matchScore >= 70 ? 'var(--success)' : job.matchScore >= 40 ? 'var(--warning)' : 'var(--danger)',
                }}
              >
                {job.matchScore}% match
              </span>
            )}
          </div>
        </div>
        <div className="job-detail-actions">
          <button
            className={`job-save-btn ${job.isSaved ? 'saved' : ''}`}
            title={job.isSaved ? 'Saved' : 'Save job'}
            onClick={handleSave}
          >
            <Star size={18} fill={job.isSaved ? 'currentColor' : 'none'} />
          </button>
          {job.isApplied ? (
            <button className="btn" disabled style={{ background: '#ECFDF5', color: 'var(--success)', cursor: 'default' }}>
              <Check size={15} /> Applied
            </button>
          ) : expired ? (
            <button className="btn" disabled style={{ background: '#FEF2F2', color: 'var(--danger)', cursor: 'not-allowed' }}>
              Expired
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setApplyOpen(true)}>
              <Briefcase size={15} /> Apply Now
            </button>
          )}
        </div>
      </div>

      {expired && !job.isApplied && (
        <div className="apply-form-banner" style={{ marginBottom: 20 }}>
          <AlertCircle size={15} /> The application deadline for this job has passed — applications are closed.
        </div>
      )}

      <div className="job-detail-grid">
        <div className="job-detail-main">
          <div className="card job-detail-section">
            <h3>Job Description</h3>
            <p>{job.description}</p>
          </div>

          {job.responsibilities?.length > 0 && (
            <div className="card job-detail-section">
              <h3><ListChecks size={16} /> Responsibilities</h3>
              <ul>{job.responsibilities.map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
          )}

          {job.qualifications?.length > 0 && (
            <div className="card job-detail-section">
              <h3>Qualifications</h3>
              <ul>{job.qualifications.map((q, i) => <li key={i}>{q}</li>)}</ul>
            </div>
          )}

          {job.benefits?.length > 0 && (
            <div className="card job-detail-section">
              <h3><Gift size={16} /> Benefits</h3>
              <ul>{job.benefits.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}
        </div>

        <div className="job-detail-side">
          <div className="card job-detail-section">
            <h3>Skills</h3>
            {skills.length > 0 ? (
              <div className="job-tags">
                {skills.map(s => <span key={s} className="badge badge-blue">{s}</span>)}
              </div>
            ) : <p className="text-muted">Not specified</p>}
          </div>

          <div className="card job-detail-section">
            <h3><Calendar size={16} /> Application Deadline</h3>
            <p className={expired ? 'job-deadline-expired' : ''}>
              {formatDeadline(job.deadline)}
              {expired && <span className="badge badge-red" style={{ marginLeft: 8 }}>Expired</span>}
            </p>
          </div>
        </div>
      </div>

      {applyOpen && (
        <ApplyJobModal
          job={job}
          onClose={() => setApplyOpen(false)}
          onApplied={() => handleApplied()}
        />
      )}
    </div>
  );
}
