// src/pages/JobsPage.js — Job Recommendations (real jobs from database, incl. Business-posted jobs)
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, MapPin, SlidersHorizontal, X, Briefcase, Star,
  IndianRupee, GraduationCap, Building2, ChevronLeft, ChevronRight, Check,
} from 'lucide-react';
import { jobsAPI } from '../utils/api';
import ApplyJobModal from '../components/common/ApplyJobModal';
import { formatSalaryRange } from '../utils/currency';
import { isPastDeadline } from '../utils/deadline';
import './JobsPage.css';

const EXPERIENCE_OPTS = [
  { value: '', label: 'Any Experience' },
  { value: 'entry', label: 'Entry' },
  { value: 'mid', label: 'Mid' },
  { value: 'senior', label: 'Senior' },
  { value: 'lead', label: 'Lead' },
  { value: 'executive', label: 'Executive' },
];
const WORK_MODE_OPTS = [
  { value: '', label: 'Any Work Mode' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'onsite', label: 'Onsite' },
];
const EMPLOYMENT_TYPE_OPTS = [
  { value: '', label: 'Any Employment Type' },
  { value: 'full-time', label: 'Full-time' },
  { value: 'part-time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'internship', label: 'Internship' },
  { value: 'temporary', label: 'Temporary' },
];

const PAGE_SIZE = 9;
const EMPTY_FILTERS = {
  search: '', location: '', experience: '', skills: [],
  minSalary: '', maxSalary: '', workMode: '', employmentType: '',
};

const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

const AVATAR_COLORS = ['#2563EB', '#7C3AED', '#059669', '#D97706', '#DC2626', '#0891B2'];
const colorFor = (name = '') => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

function JobCard({ job, onSave, onApply }) {
  const navigate = useNavigate();
  const skills = job.requiredSkills || [];
  const visibleSkills = skills.slice(0, 4);
  const extraSkills = skills.length - visibleSkills.length;
  const logo = job.companyLogo || job.logoUrl;
  const expired = isPastDeadline(job.deadline);

  const openDetail = () => navigate(`/jobs/${job._id}`);
  // Stop clicks on interactive controls (save star, apply button) from
  // also triggering the card's own navigation to the detail page.
  const stop = (e) => e.stopPropagation();

  return (
    <div className="card card-hover job-card" onClick={openDetail} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') openDetail(); }}>
      <div className="job-card-top">
        <div className="job-card-logo" style={{ background: logo ? 'transparent' : colorFor(job.company) }}>
          {logo ? <img src={logo} alt={job.company} /> : initials(job.company)}
        </div>
        <div className="job-card-headline">
          <h4 className="job-title" title={job.title}>{job.title}</h4>
          <div className="job-company"><Building2 size={13} /> {job.company}</div>
        </div>
        <button
          className={`job-save-btn ${job.isSaved ? 'saved' : ''}`}
          title={job.isSaved ? 'Saved' : 'Save job'}
          onClick={(e) => { stop(e); onSave(job); }}
        >
          <Star size={16} fill={job.isSaved ? 'currentColor' : 'none'} />
        </button>
      </div>

      <div className="job-card-meta">
        <span><MapPin size={13} /> {job.location}</span>
        <span><IndianRupee size={13} /> {formatSalaryRange(job)}</span>
        <span><GraduationCap size={13} /> {job.experience}</span>
      </div>

      {skills.length > 0 && (
        <div className="job-tags">
          {visibleSkills.map(s => <span key={s} className="badge badge-blue">{s}</span>)}
          {extraSkills > 0 && <span className="badge badge-gray">+{extraSkills} more</span>}
        </div>
      )}

      <p className="job-card-desc">
        {job.description?.length > 140 ? `${job.description.slice(0, 140).trim()}…` : job.description}
      </p>

      <div className="job-card-footer">
        <div className="job-card-badges">
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
        {job.isApplied ? (
          <button className="btn btn-sm" disabled style={{ background: '#ECFDF5', color: 'var(--success)', cursor: 'default' }}>
            <Check size={14} /> Applied
          </button>
        ) : expired ? (
          <button className="btn btn-sm" disabled style={{ background: '#FEF2F2', color: 'var(--danger)', cursor: 'not-allowed' }}>
            Expired
          </button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={(e) => { stop(e); onApply(job); }}>
            <Briefcase size={14} /> Apply
          </button>
        )}
      </div>
    </div>
  );
}

function JobCardSkeleton() {
  return (
    <div className="card job-card job-card-skeleton">
      <div className="job-card-top">
        <div className="skeleton skeleton-logo" />
        <div style={{ flex: 1 }}>
          <div className="skeleton skeleton-line" style={{ width: '70%', height: 14 }} />
          <div className="skeleton skeleton-line" style={{ width: '45%', height: 11, marginTop: 8 }} />
        </div>
      </div>
      <div className="skeleton skeleton-line" style={{ width: '90%', marginTop: 16 }} />
      <div className="skeleton skeleton-line" style={{ width: '95%', marginTop: 8 }} />
      <div className="skeleton skeleton-line" style={{ width: '60%', marginTop: 8 }} />
    </div>
  );
}

export default function JobsPage() {
  const [searchInput, setSearchInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [skillInput, setSkillInput] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [toast, setToast] = useState('');
  const [applyJob, setApplyJob] = useState(null); // job currently open in the Apply modal

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500); };

  // Debounce free-text search & location inputs into the active filter set
  const debounceRef = useRef(null);
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters(f => ({ ...f, search: searchInput, location: locationInput }));
      setPage(1);
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput, locationInput]);

  const loadJobs = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await jobsAPI.getRecommended({
        search: filters.search || undefined,
        location: filters.location || undefined,
        experience: filters.experience || undefined,
        skills: filters.skills.length ? filters.skills.join(',') : undefined,
        minSalary: filters.minSalary || undefined,
        maxSalary: filters.maxSalary || undefined,
        workMode: filters.workMode || undefined,
        employmentType: filters.employmentType || undefined,
        page, limit: PAGE_SIZE,
      });
      setJobs(res.data.jobs || []);
      setTotalPages(res.data.pages || 1);
      setTotalCount(res.data.count || 0);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load jobs. Please try again.');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const updateFilter = (key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(1); };

  const addSkill = () => {
    const val = skillInput.trim();
    if (val && !filters.skills.includes(val)) {
      updateFilter('skills', [...filters.skills, val]);
    }
    setSkillInput('');
  };
  const removeSkill = (skill) => updateFilter('skills', filters.skills.filter(s => s !== skill));

  const resetFilters = () => {
    setSearchInput(''); setLocationInput(''); setSkillInput('');
    setFilters(EMPTY_FILTERS); setPage(1);
  };

  const activeFilterCount = ['experience', 'workMode', 'employmentType', 'minSalary', 'maxSalary']
    .filter(k => filters[k]).length + filters.skills.length;

  const handleSave = async (job) => {
    try {
      const res = await jobsAPI.toggleSave(job._id);
      setJobs(prev => prev.map(j => j._id === job._id ? { ...j, isSaved: res.data.saved } : j));
      showToast(res.data.saved ? '⭐ Job saved' : 'Job unsaved');
    } catch { showToast('❌ Failed to update saved jobs'); }
  };

  const handleApply = (job) => {
    if (job.isApplied || isPastDeadline(job.deadline)) return;
    setApplyJob(job);
  };

  const handleApplied = (jobId) => {
    setJobs(prev => prev.map(j => j._id === jobId ? { ...j, isApplied: true } : j));
    showToast('✅ Application submitted successfully!');
  };

  return (
    <div className="jobs-page">
      {toast && <div className="toast">{toast}</div>}

      <div className="jobs-page-header">
        <div>
          <h2>Job Recommendations</h2>
          <p>Real, live openings from companies hiring on CareerAI — matched to your profile.</p>
        </div>
      </div>

      {/* Search + filter toggle */}
      <div className="card jobs-search-bar">
        <div className="jobs-search-input">
          <Search size={16} />
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by job title, company, or skill..."
          />
        </div>
        <div className="jobs-search-input jobs-search-location">
          <MapPin size={16} />
          <input
            value={locationInput}
            onChange={e => setLocationInput(e.target.value)}
            placeholder="Location"
          />
        </div>
        <button
          className={`btn ${showFilters ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setShowFilters(s => !s)}
        >
          <SlidersHorizontal size={15} /> Filters
          {activeFilterCount > 0 && <span className="filter-count-pill">{activeFilterCount}</span>}
        </button>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="card jobs-filters-panel">
          <div className="jobs-filters-grid">
            <div className="filter-field">
              <label>Experience</label>
              <select value={filters.experience} onChange={e => updateFilter('experience', e.target.value)}>
                {EXPERIENCE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="filter-field">
              <label>Work Mode</label>
              <select value={filters.workMode} onChange={e => updateFilter('workMode', e.target.value)}>
                {WORK_MODE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="filter-field">
              <label>Employment Type</label>
              <select value={filters.employmentType} onChange={e => updateFilter('employmentType', e.target.value)}>
                {EMPLOYMENT_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="filter-field">
              <label>Min Salary (₹)</label>
              <input type="number" min="0" placeholder="e.g. 60000" value={filters.minSalary}
                onChange={e => updateFilter('minSalary', e.target.value)} />
            </div>
            <div className="filter-field">
              <label>Max Salary (₹)</label>
              <input type="number" min="0" placeholder="e.g. 150000" value={filters.maxSalary}
                onChange={e => updateFilter('maxSalary', e.target.value)} />
            </div>
            <div className="filter-field filter-field-skills">
              <label>Skills</label>
              <div className="skills-input-wrap">
                <input
                  value={skillInput}
                  onChange={e => setSkillInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                  placeholder="Type a skill, press Enter"
                />
                <button type="button" className="btn btn-outline btn-sm" onClick={addSkill}>Add</button>
              </div>
              {filters.skills.length > 0 && (
                <div className="job-tags" style={{ marginTop: 8 }}>
                  {filters.skills.map(s => (
                    <span key={s} className="badge badge-blue skill-chip">
                      {s} <X size={11} onClick={() => removeSkill(s)} />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="jobs-filters-actions">
            <button className="btn btn-ghost btn-sm" onClick={resetFilters}>Clear all filters</button>
          </div>
        </div>
      )}

      {/* Results summary */}
      {!loading && !error && (
        <div className="jobs-results-summary">
          {totalCount} {totalCount === 1 ? 'job' : 'jobs'} found
        </div>
      )}

      {/* Job grid */}
      {loading ? (
        <div className="jobs-grid">
          {Array.from({ length: 6 }).map((_, i) => <JobCardSkeleton key={i} />)}
        </div>
      ) : error ? (
        <div className="empty-state card">
          <div className="icon">⚠️</div>
          <h3>Something went wrong</h3>
          <p>{error}</p>
          <button className="btn btn-primary btn-sm" onClick={loadJobs} style={{ marginTop: 12 }}>Retry</button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="empty-state card">
          <div className="icon">💼</div>
          <h3>No jobs found</h3>
          <p>Try adjusting your search or filters to see more openings.</p>
          {activeFilterCount > 0 || filters.search || filters.location ? (
            <button className="btn btn-primary btn-sm" onClick={resetFilters} style={{ marginTop: 12 }}>Clear all filters</button>
          ) : null}
        </div>
      ) : (
        <div className="jobs-grid">
          {jobs.map(job => (
            <JobCard key={job._id} job={job} onSave={handleSave} onApply={handleApply} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!loading && !error && jobs.length > 0 && totalPages > 1 && (
        <div className="pagination">
          <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            <ChevronLeft size={15} /> Prev
          </button>
          <span className="pagination-status">Page {page} of {totalPages}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next <ChevronRight size={15} />
          </button>
        </div>
      )}

      {applyJob && (
        <ApplyJobModal
          job={applyJob}
          onClose={() => setApplyJob(null)}
          onApplied={(jobId) => { handleApplied(jobId); }}
        />
      )}
    </div>
  );
}
