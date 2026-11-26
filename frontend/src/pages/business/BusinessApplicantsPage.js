// src/pages/business/BusinessApplicantsPage.js
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Search, Eye, FileText, Download, X, ChevronLeft, ChevronRight,
  Mail, Phone, MapPin, Linkedin, Link as LinkIcon, GraduationCap, Briefcase,
  Sparkles, RefreshCw, ThumbsUp, ThumbsDown, AlertTriangle,
  CheckCircle2, XCircle, Clock, History, Send, Calendar, Video, Inbox,
} from 'lucide-react';
import { businessApplicantsAPI, businessJobsAPI } from '../../utils/api';
import '../../components/business/business.css';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'applied', label: 'Pending' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

const EXPERIENCE_OPTIONS = [
  { value: 'all', label: 'All Experience Levels' },
  { value: 'entry', label: 'Entry Level (0-2 yrs)' },
  { value: 'mid', label: 'Mid Level (2-5 yrs)' },
  { value: 'senior', label: 'Senior (5-10 yrs)' },
  { value: 'expert', label: 'Expert (10+ yrs)' },
];

const SORT_OPTIONS = [
  { value: 'appliedAt:desc', label: 'Applied Date (Newest)' },
  { value: 'appliedAt:asc', label: 'Applied Date (Oldest)' },
  { value: 'name:asc', label: 'Name (A-Z)' },
  { value: 'name:desc', label: 'Name (Z-A)' },
  { value: 'experienceYears:desc', label: 'Experience (Most)' },
  { value: 'experienceYears:asc', label: 'Experience (Least)' },
  { value: 'status:asc', label: 'Status' },
];

const STATUS_BADGE = {
  applied: 'badge-blue',
  shortlisted: 'badge-teal',
  screening: 'badge-purple',
  interview: 'badge-yellow',
  offer: 'badge-green',
  rejected: 'badge-red',
  withdrawn: 'badge-gray',
  saved: 'badge-gray',
};

const STATUS_LABEL = {
  applied: 'Pending',
  shortlisted: 'Shortlisted',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
  saved: 'Saved',
};

const RECOMMENDATION_BADGE = {
  'Highly Recommended': 'badge-green',
  'Recommended': 'badge-blue',
  'Average': 'badge-yellow',
  'Not Suitable': 'badge-red',
};

const scoreColor = (n) => {
  if (n === null || n === undefined) return 'var(--text-muted)';
  if (n >= 75) return 'var(--success)';
  if (n >= 50) return 'var(--warning)';
  return 'var(--danger)';
};

const EMAIL_TYPE_OPTIONS = [
  { value: 'shortlisted', label: 'Shortlisted Email', description: "Let the candidate know they've been shortlisted for the next stage.", accent: '#0d9488' },
  { value: 'interview', label: 'Interview Invitation', description: 'Invite the candidate to an interview, with an optional date and meeting link.', accent: '#2563eb' },
  { value: 'rejected', label: 'Rejected Email', description: 'Politely let the candidate know they were not selected.', accent: '#6b7280' },
  { value: 'custom', label: 'Custom Email', description: 'Write your own subject and message.', accent: '#7c3aed' },
];

const EMAIL_TYPE_LABEL = Object.fromEntries(EMAIL_TYPE_OPTIONS.map((o) => [o.value, o.label]));

const formatDateTime = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// Local <input type="datetime-local"> needs "YYYY-MM-DDTHH:mm" in local time.
const toDatetimeLocalValue = (d) => {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const LIMIT = 10;

const formatDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const initials = (name = '') => name.split(' ').filter(Boolean).map((n) => n[0]).slice(0, 2).join('').toUpperCase();

const formatExperience = (years) => {
  if (!years || years <= 0) return 'Less than 1 yr';
  return `${years} yr${years === 1 ? '' : 's'}`;
};

// Resumes need the Authorization header attached, so they're fetched as a
// blob and opened/downloaded client-side rather than via a plain <a href>.
const openOrDownloadResume = async (applicantId, download, onError) => {
  try {
    const res = await businessApplicantsAPI.getResumeBlob(applicantId, download);
    const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    if (download) {
      const cd = res.headers['content-disposition'] || '';
      const match = /filename="?([^"]+)"?/i.exec(cd);
      const a = document.createElement('a');
      a.href = url;
      a.download = match ? match[1] : 'resume.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    setTimeout(() => window.URL.revokeObjectURL(url), 60000);
  } catch (err) {
    onError?.(err.response?.data?.message || 'Could not load resume file.');
  }
};

export default function BusinessApplicantsPage() {
  const [jobs, setJobs] = useState([]);
  const [applicants, setApplicants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [jobId, setJobId] = useState('all');
  const [status, setStatus] = useState('all');
  const [experience, setExperience] = useState('all');
  const [sort, setSort] = useState('appliedAt:desc');
  const [page, setPage] = useState(1);

  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [resumeBusyId, setResumeBusyId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState(null);

  // ── Email module ──────────────────────────────────────────────────────
  const [emailTarget, setEmailTarget] = useState(null); // applicant row/detail this compose modal is for
  const [emailType, setEmailType] = useState('shortlisted');
  const [emailInterviewDate, setEmailInterviewDate] = useState('');
  const [emailMeetingLink, setEmailMeetingLink] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [emailUpdateStatus, setEmailUpdateStatus] = useState(true);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState('');

  const [emailHistory, setEmailHistory] = useState([]);
  const [emailHistoryLoading, setEmailHistoryLoading] = useState(false);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  // Debounce the free-text search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    businessJobsAPI.getAll().then((res) => setJobs(res.data.jobs || [])).catch(() => {});
  }, []);

  const [sortBy, sortOrder] = sort.split(':');

  const loadApplicants = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { page, limit: LIMIT, sortBy, sortOrder };
      if (jobId !== 'all') params.jobId = jobId;
      if (status !== 'all') params.status = status;
      if (experience !== 'all') params.experience = experience;
      if (search) params.search = search;

      const res = await businessApplicantsAPI.getAll(params);
      setApplicants(res.data.applicants || []);
      setPagination({ total: res.data.total || 0, pages: res.data.pages || 1 });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load applicants.');
      setApplicants([]);
    } finally {
      setLoading(false);
    }
  }, [page, jobId, status, experience, search, sortBy, sortOrder]);

  useEffect(() => { loadApplicants(); }, [loadApplicants]);

  const resetToFirstPage = (setter) => (value) => { setter(value); setPage(1); };

  const openDetails = async (applicant) => {
    setSelected(applicant);
    setDetail(null);
    setDetailLoading(true);
    setEmailHistory([]);
    try {
      const res = await businessApplicantsAPI.getOne(applicant._id);
      setDetail(res.data.applicant);
      loadEmailHistory(applicant._id);
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.message || 'Failed to load applicant details.'));
      setSelected(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const loadEmailHistory = async (applicantId) => {
    setEmailHistoryLoading(true);
    try {
      const res = await businessApplicantsAPI.getEmailHistory(applicantId);
      setEmailHistory(res.data.emails || []);
    } catch (err) {
      // Non-fatal — the rest of the applicant detail modal still works.
    } finally {
      setEmailHistoryLoading(false);
    }
  };

  const handleResume = async (id, download) => {
    setResumeBusyId(id);
    await openOrDownloadResume(id, download, (msg) => showToast('❌ ' + msg));
    setResumeBusyId(null);
  };

  // Shortlist / Reject / Keep Pending / Update Status all funnel through
  // here — every change is written to the database and appended to the
  // applicant's status history (timeline) on the backend.
  const handleStatusChange = async (applicantId, newStatus, note) => {
    setStatusBusyId(applicantId);
    try {
      await businessApplicantsAPI.updateStatus(applicantId, newStatus, note);

      // Update the row in the list in place.
      setApplicants((prev) => prev.map((a) => (a._id === applicantId ? { ...a, status: newStatus } : a)));

      // If the detail modal is open for this applicant, refresh it so the
      // status badge and status history both reflect the change.
      if (selected?._id === applicantId) {
        setSelected((prev) => ({ ...prev, status: newStatus }));
        const res = await businessApplicantsAPI.getOne(applicantId);
        setDetail(res.data.applicant);
      }

      showToast(`✅ Status updated to "${STATUS_LABEL[newStatus] || newStatus}"`);
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.message || 'Failed to update status.'));
    } finally {
      setStatusBusyId(null);
    }
  };

  const handleReanalyze = async () => {
    if (!selected) return;
    setAnalyzing(true);
    try {
      await businessApplicantsAPI.analyzeResume(selected._id);
      const res = await businessApplicantsAPI.getOne(selected._id);
      setDetail(res.data.applicant);
      showToast('✅ Resume analysis updated');
    } catch (err) {
      showToast('❌ ' + (err.response?.data?.message || 'Resume analysis failed'));
    } finally {
      setAnalyzing(false);
    }
  };

  const openEmailModal = (applicant, prefillType) => {
    setEmailTarget(applicant);
    setEmailType(prefillType || 'shortlisted');
    setEmailInterviewDate(toDatetimeLocalValue(applicant.interviewDate));
    setEmailMeetingLink(applicant.meetingLink || '');
    setEmailSubject('');
    setEmailMessage('');
    setEmailUpdateStatus(true);
    setEmailError('');
  };

  const closeEmailModal = () => {
    if (emailSending) return;
    setEmailTarget(null);
  };

  const handleSendEmail = async () => {
    if (!emailTarget) return;
    if (emailType === 'custom' && !emailMessage.trim()) {
      setEmailError('Please write a message before sending.');
      return;
    }
    setEmailSending(true);
    setEmailError('');
    try {
      const payload = { type: emailType, updateStatus: emailUpdateStatus };
      if (emailType === 'interview') {
        if (emailInterviewDate) payload.interviewDate = new Date(emailInterviewDate).toISOString();
        if (emailMeetingLink.trim()) payload.meetingLink = emailMeetingLink.trim();
      }
      if (emailType === 'custom') {
        if (emailSubject.trim()) payload.subject = emailSubject.trim();
        payload.message = emailMessage.trim();
      }

      const res = await businessApplicantsAPI.sendEmail(emailTarget._id, payload);
      const newStatus = res.data.application?.status;

      // Reflect the resulting status in the list + open detail modal, and
      // refresh email history so the newly-sent email shows up immediately.
      if (newStatus) {
        setApplicants((prev) => prev.map((a) => (a._id === emailTarget._id ? { ...a, status: newStatus } : a)));
      }
      if (selected?._id === emailTarget._id) {
        if (newStatus) setSelected((prev) => ({ ...prev, status: newStatus }));
        const detailRes = await businessApplicantsAPI.getOne(emailTarget._id);
        setDetail(detailRes.data.applicant);
        loadEmailHistory(emailTarget._id);
      }

      showToast(`✅ ${EMAIL_TYPE_LABEL[emailType]} sent to ${emailTarget.name || emailTarget.candidate?.name || 'candidate'}`);
      setEmailTarget(null);
    } catch (err) {
      setEmailError(err.response?.data?.message || 'Failed to send email.');
    } finally {
      setEmailSending(false);
    }
  };

  const rangeLabel = useMemo(() => {
    if (pagination.total === 0) return '0 of 0';
    const start = (page - 1) * LIMIT + 1;
    const end = Math.min(page * LIMIT, pagination.total);
    return `${start}-${end} of ${pagination.total}`;
  }, [page, pagination.total]);

  const activeFilterCount = [jobId !== 'all', status !== 'all', experience !== 'all', !!search].filter(Boolean).length;

  const clearFilters = () => {
    setSearchInput(''); setSearch('');
    setJobId('all'); setStatus('all'); setExperience('all');
    setPage(1);
  };

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}

      <div className="biz-page-header">
        <div>
          <h2>Applicants</h2>
          <p>Review candidates who applied to your job postings.</p>
        </div>
      </div>

      {/* Filters / search / sort */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="biz-filters-bar">
          <div className="biz-search-input">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by name, email, skill, or job..."
              value={searchInput}
              onChange={(e) => { setSearchInput(e.target.value); }}
            />
          </div>

          <select value={jobId} onChange={(e) => resetToFirstPage(setJobId)(e.target.value)}>
            <option value="all">All Jobs</option>
            {jobs.map((j) => <option key={j._id} value={j._id}>{j.title}</option>)}
          </select>

          <select value={status} onChange={(e) => resetToFirstPage(setStatus)(e.target.value)}>
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select value={experience} onChange={(e) => resetToFirstPage(setExperience)(e.target.value)}>
            {EXPERIENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>

          {activeFilterCount > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
              <X size={14} /> Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Applicant list */}
      <div className="card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-blue" style={{ margin: '0 auto' }}></div></div>
        ) : error ? (
          <div className="alert alert-error">{error}</div>
        ) : applicants.length === 0 ? (
          <div className="empty-state">
            <p>No applicants match your search or filters.</p>
          </div>
        ) : (
          <>
            <div className="biz-applicant-list">
              {applicants.map((a) => (
                <div key={a._id} className="biz-applicant-row">
                  <div className="biz-applicant-avatar">
                    {a.avatar ? <img src={a.avatar} alt={a.name} /> : initials(a.name)}
                  </div>
                  <div className="biz-applicant-main">
                    <div className="biz-applicant-name">{a.name}</div>
                    <div className="biz-applicant-role">
                      {a.job.title} • Applied {formatDate(a.appliedAt)} • {formatExperience(a.experienceYears)} exp.
                    </div>
                  </div>
                  <div className="biz-applicant-skills">
                    {a.skills.slice(0, 3).map((s) => <span key={s} className="badge badge-blue">{s}</span>)}
                    {a.skills.length > 3 && <span className="badge badge-gray">+{a.skills.length - 3}</span>}
                    {a.skills.length === 0 && <span className="table-sub">No skills listed</span>}
                  </div>
                  <span className={`badge ${STATUS_BADGE[a.status] || 'badge-gray'}`}>{STATUS_LABEL[a.status] || a.status}</span>
                  {a.atsScore !== null && (
                    <span
                      className={`badge ${RECOMMENDATION_BADGE[a.overallRecommendation] || 'badge-gray'}`}
                      title={a.overallRecommendation || 'AI Analysis'}
                    >
                      <Sparkles size={11} style={{ marginRight: 3 }} /> {a.atsScore}
                    </span>
                  )}
                  <div className="biz-applicant-actions">
                    <button className="btn btn-outline btn-sm" onClick={() => openDetails(a)}>
                      <Eye size={14} /> View
                    </button>
                    <button className="btn btn-outline btn-sm" onClick={() => openEmailModal(a)}>
                      <Mail size={14} /> Email
                    </button>
                    
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="biz-pagination">
              <span className="table-sub">{rangeLabel}</span>
              <div className="biz-pagination-controls">
                <button
                  className="biz-icon-action"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="biz-pagination-page">Page {page} of {pagination.pages}</span>
                <button
                  className="biz-icon-action"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Applicant details modal */}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal-content card biz-applicant-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1000, maxHeight: '92vh', overflowY: 'auto' }}>
            <div className="biz-section-head">
              <h3>Applicant Details</h3>
              <button className="biz-icon-action" onClick={() => setSelected(null)}><X size={16} /></button>
            </div>

            {detailLoading || !detail ? (
              <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner spinner-blue" style={{ margin: '0 auto' }}></div></div>
            ) : (
              <div className="biz-applicant-detail">
                <div className="biz-applicant-detail-head">
                  <div className="biz-applicant-avatar" style={{ width: 46, height: 46, fontSize: 16 }}>
                    {detail.candidate?.avatar ? <img src={detail.candidate.avatar} alt={detail.candidate?.name} /> : initials(detail.candidate?.name)}
                  </div>
                  <div>
                    <h3 style={{ fontSize: 18 }}>{detail.candidate?.name}</h3>
                    <p className="table-sub">{detail.candidate?.title || 'No title provided'}</p>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`badge ${STATUS_BADGE[detail.status] || 'badge-gray'}`}>
                      {STATUS_LABEL[detail.status] || detail.status}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={detail.status === 'shortlisted' || statusBusyId === detail._id}
                    onClick={() => handleStatusChange(detail._id, 'shortlisted')}
                  >
                    <CheckCircle2 size={14} color="var(--success)" /> Shortlist
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={detail.status === 'rejected' || statusBusyId === detail._id}
                    onClick={() => handleStatusChange(detail._id, 'rejected')}
                  >
                    <XCircle size={14} color="var(--danger)" /> Reject
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={detail.status === 'applied' || statusBusyId === detail._id}
                    onClick={() => handleStatusChange(detail._id, 'applied')}
                  >
                    <Clock size={14} /> Keep Pending
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => openEmailModal({
                      _id: detail._id,
                      name: detail.candidate?.name,
                      interviewDate: detail.interviewDate,
                      meetingLink: detail.meetingLink,
                    })}
                  >
                    <Mail size={16} /> Send Email
                  </button>
                </div>

                {(detail.interviewDate || detail.meetingLink) && (
                  <div className="biz-company-facts" style={{ margin: '0 0 16px' }}>
                    {detail.interviewDate && <span className="biz-company-fact"><Calendar size={13} /> Interview: {formatDateTime(detail.interviewDate)}</span>}
                    {detail.meetingLink && <span className="biz-company-fact"><a href={detail.meetingLink} target="_blank" rel="noreferrer"><Video size={13} /> Join Meeting</a></span>}
                  </div>
                )}

                <div className="biz-company-facts" style={{ margin: '16px 0' }}>
                  <span className="biz-company-fact"><Mail size={13} /> {detail.candidate?.email}</span>
                  {detail.phone && <span className="biz-company-fact"><Phone size={13} /> {detail.phone}</span>}
                  {detail.candidate?.location && <span className="biz-company-fact"><MapPin size={13} /> {detail.candidate.location}</span>}
                  {detail.linkedin && <span className="biz-company-fact"><a href={detail.linkedin} target="_blank" rel="noreferrer"><Linkedin size={13} /> LinkedIn</a></span>}
                  {detail.portfolio && <span className="biz-company-fact"><a href={detail.portfolio} target="_blank" rel="noreferrer"><LinkIcon size={13} /> Portfolio</a></span>}
                </div>

                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 16 }}>
                  <div>
                    <h4 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Applied For</h4>
                    <p style={{ fontSize: 13.5, fontWeight: 600 }}>{detail.job?.title}</p>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Applied Date</h4>
                    <p style={{ fontSize: 13.5 }}>{formatDate(detail.appliedAt)}</p>
                  </div>
                  <div>
                    <h4 style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Experience</h4>
                    <p style={{ fontSize: 13.5 }}>{formatExperience(detail.experienceYears)} ({detail.experienceLevelLabel})</p>
                  </div>
                </div>

                {/* Status History */}
                {detail.timeline?.length > 0 && (
                  <div style={{ marginBottom: 20 }}>
                    <h4 style={{ fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <History size={14} /> Status History
                    </h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {[...detail.timeline].reverse().map((t, i) => (
                        <li
                          key={t._id || i}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '8px 0', borderBottom: i === detail.timeline.length - 1 ? 'none' : '1px solid var(--border-light)',
                          }}
                        >
                          <span className={`badge ${STATUS_BADGE[t.status] || 'badge-gray'}`} style={{ flexShrink: 0 }}>
                            {STATUS_LABEL[t.status] || t.status}
                          </span>
                          <div style={{ minWidth: 0 }}>
                            {t.note && <p style={{ fontSize: 12.5, margin: 0 }}>{t.note}</p>}
                            <p className="table-sub" style={{ margin: 0 }}>
                              {formatDate(t.date)}
                              {t.changedBy ? ` • ${t.changedBy === 'business' ? 'You' : t.changedBy === 'candidate' ? 'Candidate' : 'System'}` : ''}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Email History */}
                <div style={{ marginBottom: 20 }}>
                  <h4 style={{ fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Inbox size={14} /> Email History
                  </h4>
                  {emailHistoryLoading ? (
                    <p className="table-sub">Loading email history…</p>
                  ) : emailHistory.length === 0 ? (
                    <p className="table-sub">No emails sent to this candidate yet.</p>
                  ) : (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {emailHistory.map((e, i) => (
                        <li
                          key={e._id || i}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: 10,
                            padding: '10px 0', borderBottom: i === emailHistory.length - 1 ? 'none' : '1px solid var(--border-light)',
                          }}
                        >
                          {e.status === 'sent'
                            ? <CheckCircle2 size={15} color="var(--success)" style={{ marginTop: 2, flexShrink: 0 }} />
                            : <AlertTriangle size={15} color="var(--danger)" style={{ marginTop: 2, flexShrink: 0 }} />}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 600 }}>{EMAIL_TYPE_LABEL[e.type] || e.type}</span>
                              <span className="table-sub" style={{ margin: 0 }}>{formatDateTime(e.sentAt || e.createdAt)}</span>
                            </div>
                            <p style={{ fontSize: 12.5, margin: '2px 0 0', color: 'var(--text-secondary)' }}>{e.subject}</p>
                            {e.status === 'failed' && (
                              <p style={{ fontSize: 12, margin: '2px 0 0', color: 'var(--danger)' }}>Failed to send: {e.errorMessage}</p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* AI Resume Analysis */}
                <div className="biz-ai-analysis" style={{ marginBottom: 20 }}>
                  <div className="biz-section-head" style={{ marginBottom: 12 }}>
                    <h4 style={{ fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={14} color="var(--secondary)" /> AI Resume Analysis
                    </h4>
                    <button className="btn btn-ghost btn-sm" onClick={handleReanalyze} disabled={analyzing || !detail.hasResume}>
                      <RefreshCw size={13} className={analyzing ? 'spin' : ''} /> {analyzing ? 'Analyzing...' : 'Re-analyze'}
                    </button>
                  </div>

                  {!detail.hasResume ? (
                    <p className="table-sub">No resume on file to analyze.</p>
                  ) : !detail.resumeAnalysis || (!detail.resumeAnalysis.analyzedAt) ? (
                    <p className="table-sub">
                      No analysis yet. <button className="btn btn-ghost btn-sm" onClick={handleReanalyze} disabled={analyzing}>Run analysis</button>
                    </p>
                  ) : detail.resumeAnalysis.error ? (
                    <div className="alert alert-error" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={15} /> {detail.resumeAnalysis.error}
                    </div>
                  ) : (
                    <div className="biz-ai-analysis-body">
                      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                        <div className="biz-score-block">
                          <div className="biz-score-value" style={{ color: scoreColor(detail.resumeAnalysis.atsScore) }}>
                            {detail.resumeAnalysis.atsScore ?? '—'}
                          </div>
                          <div className="biz-score-label">ATS Score</div>
                        </div>
                        <div className="biz-score-block">
                          <div className="biz-score-value" style={{ color: scoreColor(detail.resumeAnalysis.resumeScore) }}>
                            {detail.resumeAnalysis.resumeScore ?? '—'}
                          </div>
                          <div className="biz-score-label">Resume Score</div>
                        </div>
                        <div className="biz-score-block">
                          <div className="biz-score-value" style={{ color: scoreColor(detail.resumeAnalysis.skillMatch) }}>
                            {detail.resumeAnalysis.skillMatch ?? '—'}%
                          </div>
                          <div className="biz-score-label">Skill Match</div>
                        </div>
                        {detail.resumeAnalysis.jobMatchPercentage != null && (
                          <div className="biz-score-block">
                            <div className="biz-score-value" style={{ color: scoreColor(detail.resumeAnalysis.jobMatchPercentage) }}>
                              {detail.resumeAnalysis.jobMatchPercentage}%
                            </div>
                            <div className="biz-score-label">Job Match</div>
                          </div>
                        )}
                        {detail.resumeAnalysis.overallRecommendation && (
                          <div className="biz-score-block">
                            <span className={`badge ${RECOMMENDATION_BADGE[detail.resumeAnalysis.overallRecommendation] || 'badge-gray'}`} style={{ fontSize: 13 }}>
                              {detail.resumeAnalysis.overallRecommendation}
                            </span>
                            <div className="biz-score-label">Recommendation</div>
                          </div>
                        )}
                      </div>

                      {detail.resumeAnalysis.requiredSkillsFound?.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <h5 style={{ fontSize: 12.5, marginBottom: 6 }}>Required Skills Found</h5>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {detail.resumeAnalysis.requiredSkillsFound.map((s, i) => <span key={i} className="badge badge-green">{s}</span>)}
                          </div>
                        </div>
                      )}
                      {detail.resumeAnalysis.missingSkills?.length > 0 && (
                        <div style={{ marginBottom: 14 }}>
                          <h5 style={{ fontSize: 12.5, marginBottom: 6 }}>Missing Required Skills</h5>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {detail.resumeAnalysis.missingSkills.map((s, i) => <span key={i} className="badge badge-red">{s}</span>)}
                          </div>
                        </div>
                      )}

                      {(detail.resumeAnalysis.experienceMatch != null || detail.resumeAnalysis.educationMatch != null || detail.resumeAnalysis.projectRelevance != null || detail.resumeAnalysis.resumeRelevance != null) && (
                        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
                          {detail.resumeAnalysis.experienceMatch != null && (
                            <div className="biz-score-block">
                              <div className="biz-score-value" style={{ color: scoreColor(detail.resumeAnalysis.experienceMatch), fontSize: 16 }}>
                                {detail.resumeAnalysis.experienceMatch}%
                              </div>
                              <div className="biz-score-label">Experience Match</div>
                            </div>
                          )}
                          {detail.resumeAnalysis.educationMatch != null && (
                            <div className="biz-score-block">
                              <div className="biz-score-value" style={{ color: scoreColor(detail.resumeAnalysis.educationMatch), fontSize: 16 }}>
                                {detail.resumeAnalysis.educationMatch}%
                              </div>
                              <div className="biz-score-label">Education Match</div>
                            </div>
                          )}
                          {detail.resumeAnalysis.projectRelevance != null && (
                            <div className="biz-score-block">
                              <div className="biz-score-value" style={{ color: scoreColor(detail.resumeAnalysis.projectRelevance), fontSize: 16 }}>
                                {detail.resumeAnalysis.projectRelevance}%
                              </div>
                              <div className="biz-score-label">Project Relevance</div>
                            </div>
                          )}
                          {detail.resumeAnalysis.resumeRelevance != null && (
                            <div className="biz-score-block">
                              <div className="biz-score-value" style={{ color: scoreColor(detail.resumeAnalysis.resumeRelevance), fontSize: 16 }}>
                                {detail.resumeAnalysis.resumeRelevance}%
                              </div>
                              <div className="biz-score-label">Resume Relevance</div>
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
                        {detail.resumeAnalysis.strengths?.length > 0 && (
                          <div>
                            <h5 style={{ fontSize: 12.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <ThumbsUp size={12} color="var(--success)" /> Strengths
                            </h5>
                            <ul style={{ paddingLeft: 16, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                              {detail.resumeAnalysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                          </div>
                        )}
                        {detail.resumeAnalysis.weaknesses?.length > 0 && (
                          <div>
                            <h5 style={{ fontSize: 12.5, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                              <ThumbsDown size={12} color="var(--danger)" /> Weaknesses
                            </h5>
                            <ul style={{ paddingLeft: 16, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                              {detail.resumeAnalysis.weaknesses.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>

                      {detail.resumeAnalysis.experienceSummary && (
                        <div style={{ marginBottom: 10 }}>
                          <h5 style={{ fontSize: 12.5, marginBottom: 4 }}>Experience Summary</h5>
                          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{detail.resumeAnalysis.experienceSummary}</p>
                        </div>
                      )}
                      {detail.resumeAnalysis.educationSummary && (
                        <div style={{ marginBottom: 10 }}>
                          <h5 style={{ fontSize: 12.5, marginBottom: 4 }}>Education Summary</h5>
                          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{detail.resumeAnalysis.educationSummary}</p>
                        </div>
                      )}
                      {detail.resumeAnalysis.projectsSummary && (
                        <div style={{ marginBottom: 10 }}>
                          <h5 style={{ fontSize: 12.5, marginBottom: 4 }}>Projects Summary</h5>
                          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>{detail.resumeAnalysis.projectsSummary}</p>
                        </div>
                      )}
                      {detail.resumeAnalysis.suggestions?.length > 0 && (
                        <div style={{ marginBottom: detail.resumeAnalysis.recruiterSummary ? 14 : 0 }}>
                          <h5 style={{ fontSize: 12.5, marginBottom: 6 }}>Suggestions</h5>
                          <ul style={{ paddingLeft: 16, fontSize: 12.5, color: 'var(--text-secondary)' }}>
                            {detail.resumeAnalysis.suggestions.map((s, i) => <li key={i}>{s}</li>)}
                          </ul>
                        </div>
                      )}
                      {detail.resumeAnalysis.recruiterSummary && (
                        <div className="biz-recruiter-summary" style={{ padding: 10, borderRadius: 8, background: 'var(--bg-secondary)' }}>
                          <h5 style={{ fontSize: 12.5, marginBottom: 4 }}>Recruiter Summary</h5>
                          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: 0 }}>{detail.resumeAnalysis.recruiterSummary}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {detail.candidate?.bio && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, marginBottom: 6 }}>About</h4>
                    <p style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{detail.candidate.bio}</p>
                  </div>
                )}

                {detail.candidate?.skills?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, marginBottom: 8 }}>Skills</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {detail.candidate.skills.map((s, i) => (
                        <span key={i} className="badge badge-blue" title={`${s.proficiency}${s.yearsExp ? ` • ${s.yearsExp} yrs` : ''}`}>
                          {s.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {detail.candidate?.experience?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, marginBottom: 8 }}><Briefcase size={13} style={{ verticalAlign: -2 }} /> Work Experience</h4>
                    <ul style={{ paddingLeft: 18, fontSize: 13.5 }}>
                      {detail.candidate.experience.map((e, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                          <b>{e.role}</b> at {e.company}
                          <span className="table-sub" style={{ display: 'block' }}>
                            {formatDate(e.startDate)} – {e.current ? 'Present' : formatDate(e.endDate)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail.candidate?.education?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, marginBottom: 8 }}><GraduationCap size={13} style={{ verticalAlign: -2 }} /> Education</h4>
                    <ul style={{ paddingLeft: 18, fontSize: 13.5 }}>
                      {detail.candidate.education.map((ed, i) => (
                        <li key={i}>{ed.degree} in {ed.field} — {ed.institution} ({ed.graduationYear})</li>
                      ))}
                    </ul>
                  </div>
                )}

                {detail.coverLetter && (
                  <div style={{ marginBottom: 16 }}>
                    <h4 style={{ fontSize: 13, marginBottom: 6 }}>Cover Letter</h4>
                    <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{detail.coverLetter}</p>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                  <button
                    className="btn btn-outline"
                    disabled={!detail.hasResume || resumeBusyId === detail._id}
                    onClick={() => handleResume(detail._id, false)}
                  >
                    <FileText size={15} /> Open Resume
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={!detail.hasResume || resumeBusyId === detail._id}
                    onClick={() => handleResume(detail._id, true)}
                  >
                    <Download size={15} /> Download Resume
                  </button>
                  {!detail.hasResume && <span className="table-sub" style={{ alignSelf: 'center' }}>No resume on file</span>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Send Email modal */}
      {emailTarget && (
        <div className="modal-overlay" onClick={closeEmailModal}>
          <div className="modal-content card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 860, maxHeight: '95vh', overflowY: 'auto' }}>
            <div className="biz-section-head">
              <h3>Send Email{emailTarget.name ? ` — ${emailTarget.name}` : ''}</h3>
              <button className="biz-icon-action" onClick={closeEmailModal} disabled={emailSending}><X size={16} /></button>
            </div>

            {emailError && <div className="alert alert-error" style={{ marginBottom: 14 }}>{emailError}</div>}

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 8 }}>Email Type</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {EMAIL_TYPE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setEmailType(opt.value)}
                    disabled={emailSending}
                    style={{
                      textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                      border: emailType === opt.value ? `2px solid ${opt.accent}` : '1px solid var(--border-light)',
                      background: emailType === opt.value ? `${opt.accent}14` : 'transparent',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: emailType === opt.value ? opt.accent : 'var(--text-primary)' }}>{opt.label}</div>
                    <div className="table-sub" style={{ marginTop: 2 }}>{opt.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <p className="table-sub" style={{ marginBottom: 16 }}>
              Candidate Name, Company Name, and Job Title are filled in automatically from this application.
            </p>

            {emailType === 'interview' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Calendar size={13} /> Interview Date &amp; Time <span className="table-sub">(optional)</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={emailInterviewDate}
                    onChange={(e) => setEmailInterviewDate(e.target.value)}
                    disabled={emailSending}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <Video size={13} /> Meeting Link <span className="table-sub">(optional)</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://meet.google.com/xxx-xxxx-xxx"
                    value={emailMeetingLink}
                    onChange={(e) => setEmailMeetingLink(e.target.value)}
                    disabled={emailSending}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            )}

            {emailType === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>Subject <span className="table-sub">(optional — a default will be used)</span></label>
                  <input
                    type="text"
                    placeholder="e.g. Regarding your application"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    disabled={emailSending}
                    style={{ width: '100%' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 6 }}>Message</label>
                  <textarea
                    rows={6}
                    placeholder="Write your message to the candidate..."
                    value={emailMessage}
                    onChange={(e) => setEmailMessage(e.target.value)}
                    disabled={emailSending}
                    style={{ width: '100%', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </div>
              </div>
            )}

            {emailType !== 'custom' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 16, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={emailUpdateStatus}
                  onChange={(e) => setEmailUpdateStatus(e.target.checked)}
                  disabled={emailSending}
                />
                Update application status to "{STATUS_LABEL[emailType === 'shortlisted' ? 'shortlisted' : emailType === 'interview' ? 'interview' : 'rejected']}" after sending
              </label>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn btn-ghost" onClick={closeEmailModal} disabled={emailSending}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSendEmail} disabled={emailSending}>
                {emailSending ? <RefreshCw size={15} className="spin" /> : <Send size={15} />}
                {emailSending ? 'Sending…' : 'Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
