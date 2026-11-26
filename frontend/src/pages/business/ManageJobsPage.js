// src/pages/business/ManageJobsPage.js
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, PlusCircle, Eye, Pencil, Trash2, PauseCircle, PlayCircle, X } from 'lucide-react';
import { businessJobsAPI } from '../../utils/api';
import { formatSalaryRange } from '../../utils/currency';
import '../../components/business/business.css';

const STATUS_BADGE = { open: 'badge-green', closed: 'badge-gray' };

const formatDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

export default function ManageJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [viewJob, setViewJob] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const loadJobs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await businessJobsAPI.getAll();
      setJobs(res.data.jobs);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load your job postings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleToggleStatus = async (job) => {
    setBusyId(job._id);
    try {
      const action = job.status === 'open' ? businessJobsAPI.close : businessJobsAPI.reopen;
      const res = await action(job._id);
      setJobs(prev => prev.map(j => j._id === job._id ? res.data.job : j));
      showToast(job.status === 'open' ? '✅ Job closed' : '✅ Job reopened');
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.message || 'Action failed'));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (job) => {
    setBusyId(job._id);
    try {
      await businessJobsAPI.remove(job._id);
      setJobs(prev => prev.filter(j => j._id !== job._id));
      showToast('🗑️ Job deleted');
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.message || 'Delete failed'));
    } finally {
      setBusyId(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}

      <div className="biz-page-header">
        <div>
          <h2>Manage Jobs</h2>
          <p>Create, edit, close, and reopen your job postings.</p>
        </div>
        <Link to="/business/jobs/new" className="btn btn-primary">
          <PlusCircle size={16} /> Create Job Post
        </Link>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-blue" style={{ margin: '0 auto' }}></div></div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : jobs.length === 0 ? (
          <div className="biz-placeholder">
            <div className="icon-wrap"><Briefcase size={28} /></div>
            <h3>No job posts yet</h3>
            <p>Create your first job post to start receiving applicants.</p>
            <Link to="/business/jobs/new" className="btn btn-primary" style={{ marginTop: 16 }}>
              <PlusCircle size={16} /> Create Job Post
            </Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Job Title</th>
                  <th>Status</th>
                  <th>Vacancies</th>
                  <th>Applicants</th>
                  <th>Deadline</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <tr key={job._id}>
                    <td>
                      <div className="table-title">{job.title}</div>
                      <div className="table-sub">{job.location} • {job.workMode}</div>
                    </td>
                    <td><span className={`badge ${STATUS_BADGE[job.status] || 'badge-gray'}`}>{job.status === 'open' ? 'Open' : 'Closed'}</span></td>
                    <td>{job.vacancies}</td>
                    <td>{job.applicantsCount ?? 0}</td>
                    <td className="table-sub">{formatDate(job.deadline)}</td>
                    <td>
                      <div className="biz-row-actions">
                        <button className="biz-icon-action" title="View" onClick={() => setViewJob(job)}>
                          <Eye size={15} />
                        </button>
                        <Link to={`/business/jobs/${job._id}/edit`} className="biz-icon-action" title="Edit">
                          <Pencil size={15} />
                        </Link>
                        <button
                          className="biz-icon-action"
                          title={job.status === 'open' ? 'Close job' : 'Reopen job'}
                          onClick={() => handleToggleStatus(job)}
                          disabled={busyId === job._id}
                        >
                          {job.status === 'open' ? <PauseCircle size={15} /> : <PlayCircle size={15} />}
                        </button>
                        <button
                          className="biz-icon-action danger"
                          title="Delete"
                          onClick={() => setConfirmDelete(job)}
                          disabled={busyId === job._id}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View job modal */}
      {viewJob && (
        <div className="modal-overlay" onClick={() => setViewJob(null)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }}>
            <div className="biz-section-head">
              <h3>{viewJob.title}</h3>
              <button className="biz-icon-action" onClick={() => setViewJob(null)}><X size={16} /></button>
            </div>
            <p className="table-sub" style={{ marginBottom: 16 }}>{viewJob.company} • {viewJob.location} • {viewJob.workMode}</p>

            <div className="biz-company-facts" style={{ marginBottom: 16 }}>
              <span className="biz-company-fact"><b>{viewJob.employmentType}</b></span>
              <span className="biz-company-fact"><b>{viewJob.experience}</b> level</span>
              <span className="biz-company-fact">{formatSalaryRange(viewJob)}</span>
              <span className="biz-company-fact">{viewJob.vacancies} vacancy(ies)</span>
            </div>

            <p style={{ fontSize: 13.5, marginBottom: 16 }}>{viewJob.description}</p>

            {viewJob.requiredSkills?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Skills Required</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {viewJob.requiredSkills.map(s => <span key={s} className="badge badge-blue">{s}</span>)}
                </div>
              </div>
            )}

            {viewJob.responsibilities?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Responsibilities</h4>
                <ul style={{ paddingLeft: 18, fontSize: 13.5 }}>
                  {viewJob.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            {viewJob.qualifications?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Qualifications</h4>
                <ul style={{ paddingLeft: 18, fontSize: 13.5 }}>
                  {viewJob.qualifications.map((q, i) => <li key={i}>{q}</li>)}
                </ul>
              </div>
            )}

            {viewJob.benefits?.length > 0 && (
              <div>
                <h4 style={{ fontSize: 13, marginBottom: 8 }}>Benefits</h4>
                <ul style={{ paddingLeft: 18, fontSize: 13.5 }}>
                  {viewJob.benefits.map((b, i) => <li key={i}>{b}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content card" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <h3 style={{ marginBottom: 8 }}>Delete this job post?</h3>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', marginBottom: 20 }}>
              "{confirmDelete.title}" will be permanently deleted. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)} disabled={busyId === confirmDelete._id}>
                {busyId === confirmDelete._id ? 'Deleting...' : 'Delete Job'}
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
