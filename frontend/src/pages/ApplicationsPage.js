// src/pages/ApplicationsPage.js
import { useState, useEffect } from 'react';
import { applicationsAPI } from '../utils/api';
import {
  ClipboardList, IndianRupee, StickyNote, CalendarClock, Link2, Trash2,
} from 'lucide-react';
import { STATUS_COLORS } from '../utils/statusColors';
import './ApplicationsPage.css';

const STATUSES = ['applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn'];

export default function ApplicationsPage() {
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadApps();
  }, [filter]);

  // Always pulls the current state from the backend — this is the single
  // source of truth for each application's status, so the badge shown to
  // the user can never drift from what the business has set server-side.
  const loadApps = async () => {
    setLoading(true);
    try {
      const res = await applicationsAPI.getAll(filter ? { status: filter } : {});
      setApps(res.data.applications);
      setError('');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load applications');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this application?')) return;
    try {
      await applicationsAPI.remove(id);
      loadApps();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to remove application');
    }
  };

  const counts = STATUSES.reduce((acc, s) => {
    acc[s] = apps.filter(a => a.status === s).length;
    return acc;
  }, {});

  return (
    <div className="applications-page">
      {/* Status summary */}
      <div className="grid-4 apps-status-grid">
        {['applied', 'interview', 'offer', 'rejected'].map(s => (
          <div key={s} className="card apps-status-card" style={{ border: filter === s ? `2px solid ${STATUS_COLORS[s]}` : undefined }}
            onClick={() => setFilter(filter === s ? '' : s)}>
            <div className="apps-status-count" style={{ color: STATUS_COLORS[s] }}>{counts[s] || 0}</div>
            <div className="apps-status-label">{s}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="page-header-row">
        <div>
          <h3 className="page-title" style={{ fontSize: 20 }}>Applications {filter && <span className="badge badge-blue">{filter}</span>}</h3>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {filter && <button className="btn btn-ghost btn-sm" onClick={() => setFilter('')}>Clear filter</button>}
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

      {/* Applications list */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-blue" style={{ margin: '0 auto' }}></div></div>
      ) : apps.length === 0 ? (
        <div className="empty-state">
          <div className="icon"><ClipboardList size={40} strokeWidth={1.6} /></div>
          <h3>No applications {filter ? `with status "${filter}"` : 'yet'}</h3>
          <p>Applications you submit to jobs will show up here</p>
        </div>
      ) : (
        <div className="apps-list">
          {apps.map(app => (
            <div key={app._id} className="card app-card">
              <div className="app-card-row">
                <div>
                  <div className="app-card-title">{app.job?.title || app.jobTitle}</div>
                  <div className="app-card-company">{app.job?.company || app.company}</div>
                  {app.salary && <div className="app-card-meta salary"><IndianRupee size={13} /> {app.salary}</div>}
                  {app.notes && <div className="app-card-meta notes"><StickyNote size={13} /> {app.notes}</div>}
                  {app.interviewDate && (
                    <div className="app-card-meta interview">
                      <CalendarClock size={13} /> Interview: {new Date(app.interviewDate).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  {app.meetingLink && (
                    <div className="app-card-meta">
                      <Link2 size={13} /> <a href={app.meetingLink} target="_blank" rel="noreferrer">Join Meeting</a>
                    </div>
                  )}
                </div>
                <div className="app-card-actions">
                  <span
                    className="app-status-badge"
                    style={{ color: STATUS_COLORS[app.status], borderColor: STATUS_COLORS[app.status] }}
                  >
                    {app.status}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(app._id)} style={{ color: 'var(--danger)' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="app-card-footer">
                Applied {new Date(app.appliedAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
