// src/pages/OtherPages.js
import { useState } from 'react';
import { aiAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { BarChart3, IndianRupee, TrendingUp, Building2 } from 'lucide-react';
import { formatCompactINR } from '../utils/currency';
import './AIPages.css';

// ── Market Trends Page ────────────────────────────────────────────────────────
export function MarketTrendsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ role: user?.targetJob || '', location: user?.location || '' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFetch = async () => {
  setError('');
  if (!form.role.trim() || !form.location.trim()) {
    setError('Role and Location are both required.');
    return;
  }
  setLoading(true);
  try {
    const res = await aiAPI.marketTrends(form);
    setResult(res.data.data);
  } catch (err) { setError(err.response?.data?.message || 'Failed to fetch trends'); }
  finally { setLoading(false); }
};

  const salaryData = result ? [
    { level: 'Entry', salary: result.averageSalary?.entry || 0 },
    { level: 'Mid', salary: result.averageSalary?.mid || 0 },
    { level: 'Senior', salary: result.averageSalary?.senior || 0 },
  ] : [];

  return (
    <div className="ai-page">
      <div className="card ai-input-card">
        <h3>Job Market Analysis</h3>
        <p style={{ color: '#6B7280', marginBottom: 20 }}>Get real-time AI insights about salary, demand, and trending skills.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <div style={{ display: 'flex', gap: 12 }}>
          <input value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="Role (e.g. Data Scientist) *" style={{ flex: 1 }} />
          <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="Location (e.g. Vadodara) *" style={{ flex: 1 }} />
            <button className="btn btn-primary" onClick={handleFetch} disabled={loading || !form.role.trim() || !form.location.trim()}>
              {loading ? 'Loading...' : 'Analyze'}
            </button>
        </div>
      </div>

      {loading && (
        <div className="ai-loading">
          <div className="ai-loading-inner">
            <div className="ai-loader"></div>
            <h3>Analyzing market data...</h3>
          </div>
        </div>
      )}

      {result && !loading && (
        <div>
          <div className="grid-4" style={{ marginBottom: 24 }}>
            {[
              { Icon: BarChart3, bg: '#EFF6FF', fg: '#2563EB', label: 'Market Demand', value: (result.demandLevel || '').toUpperCase(), sub: 'Score: ' + (result.demandScore || 0) + '/100' },
              { Icon: IndianRupee, bg: '#ECFDF5', fg: '#059669', label: 'Avg Mid Salary', value: formatCompactINR(result.averageSalary?.mid || 0), sub: 'per year' },
              { Icon: TrendingUp, bg: '#FFFBEB', fg: '#D97706', label: 'Job Growth', value: result.jobGrowth || 'N/A', sub: '' },
              { Icon: Building2, bg: '#F5F3FF', fg: '#7C3AED', label: 'Top Location', value: result.topLocations?.[0] || 'N/A', sub: result.topLocations?.[1] || '' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ textAlign: 'center' }}>
                <div className="stat-icon" style={{ background: s.bg, color: s.fg, margin: '0 auto 8px' }}><s.Icon size={20} strokeWidth={2.2} /></div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{s.value}</div>
                <div style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{s.sub}</div>}
              </div>
            ))}
          </div>

          <div className="grid-2">
            <div className="card">
              <h4 style={{ marginBottom: 20 }}>Salary by Level</h4>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={salaryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="level" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={v => formatCompactINR(v)} />
                  <Tooltip formatter={v => [formatCompactINR(v), 'Salary']} />
                  <Bar dataKey="salary" fill="#2563EB" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card">
                <h4 style={{ marginBottom: 12 }}>Trending Skills</h4>
                {result.trendingSkills?.map((s, i) => (
                  <div key={i} className="trend-item">
                    <span style={{ fontWeight: 500, fontSize: 13 }}>{s.skill}</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#059669' }}>+{s.demandIncrease}%</div>
                      <div className="trend-bar" style={{ width: Math.min(s.demandIncrease * 2, 100) + 'px' }}></div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="card">
                <h4 style={{ marginBottom: 12 }}>Top Hiring Companies</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {result.topCompanies?.map((c, i) => <span key={i} className="badge badge-gray">{c}</span>)}
                </div>
              </div>
            </div>
          </div>

          {result.insights?.length > 0 && (
            <div className="card" style={{ marginTop: 20, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
              <h4 style={{ marginBottom: 12, color: '#1D4ED8' }}>Market Insights</h4>
              <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.insights.map((ins, i) => (
                  <li key={i} style={{ fontSize: 14, color: '#1D4ED8', lineHeight: 1.6 }}>{ins}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Learning Roadmap Page ─────────────────────────────────────────────────────
// Duration and weekly-availability are real inputs that drive the backend's
// deterministic roadmap engine (phase count/length, workload, and cost all
// scale off these), not just labels on an otherwise-fixed roadmap.
const DURATION_OPTIONS = [
  { value: '6 weeks', label: '6 weeks (fast track)' },
  { value: '3 months', label: '3 months' },
  { value: '6 months', label: '6 months' },
  { value: '9 months', label: '9 months' },
  { value: '12 months', label: '12 months' },
];
const WEEKLY_HOURS_OPTIONS = [
  { value: '', label: 'Auto (based on courses)' },
  { value: '5', label: '~5 hrs/week (light)' },
  { value: '10', label: '~10 hrs/week (steady)' },
  { value: '15', label: '~15 hrs/week (intensive)' },
  { value: '20', label: '~20 hrs/week (full-time)' },
];

export function LearningPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({
    skills: '',
    targetJob: user?.targetJob || '',
    duration: '6 months',
    weeklyHoursAvailable: '',
    autoDetectSkillGaps: !user?.skills?.length ? false : true,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!form.targetJob) return setError('Please enter your target job');
    const skillsArr = form.skills.split(',').map(s => s.trim()).filter(Boolean);
    if (!skillsArr.length && !form.autoDetectSkillGaps) {
      return setError('Enter skills to learn, or enable auto-detect from your profile');
    }
    setError(''); setLoading(true);
    try {
      const res = await aiAPI.learningRoadmap({
        skills: skillsArr,
        targetJob: form.targetJob,
        duration: form.duration,
        weeklyHoursAvailable: form.weeklyHoursAvailable || undefined,
        autoDetectSkillGaps: form.autoDetectSkillGaps,
      });
      setResult(res.data.data);
    } catch (err) { setError(err.response?.data?.message || 'Failed to generate roadmap'); }
    finally { setLoading(false); }
  };

  const platformBadgeClass = (platform) => {
    if (platform === 'IBM SkillsBuild') return 'badge badge-teal';
    if (platform === 'Coursera') return 'badge badge-blue';
    if (platform === 'Udemy') return 'badge badge-purple';
    return 'badge badge-gray';
  };

  return (
    <div className="ai-page">
      <div className="card ai-input-card">
        <h3>Learning Roadmap Generator</h3>
        <p style={{ color: '#6B7280', marginBottom: 20 }}>Get a personalized learning path — built from real Coursera, IBM SkillsBuild, and Udemy courses — sequenced to fit the timeline and weekly workload you choose.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="grid-2" style={{ gap: 16 }}>
          <div>
            <label className="form-label">Skills to Learn (comma-separated, optional)</label>
            <input value={form.skills} onChange={e => setForm({...form, skills: e.target.value})} placeholder="React, Node.js, AWS" />
          </div>
          <div>
            <label className="form-label">Target Role *</label>
            <input value={form.targetJob} onChange={e => setForm({...form, targetJob: e.target.value})} placeholder="Full Stack Developer" />
          </div>
        </div>

        <div className="grid-2" style={{ gap: 16, marginTop: 16 }}>
          <div>
            <label className="form-label">Learning Duration</label>
            <select value={form.duration} onChange={e => setForm({...form, duration: e.target.value})}>
              {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Weekly Time Availability</label>
            <select value={form.weeklyHoursAvailable} onChange={e => setForm({...form, weeklyHoursAvailable: e.target.value})}>
              {WEEKLY_HOURS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, fontSize: 13, color: '#374151' }}>
          <input
            type="checkbox"
            checked={form.autoDetectSkillGaps}
            onChange={e => setForm({...form, autoDetectSkillGaps: e.target.checked})}
          />
          Auto-detect my skill gaps from my profile vs. this target role
        </label>

        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Roadmap'}
          </button>
        </div>
      </div>

      {loading && (
        <div className="ai-loading">
          <div className="ai-loading-inner">
            <div className="ai-loader"></div>
            <h3>Crafting your learning path...</h3>
          </div>
        </div>
      )}

      {result && !loading && (
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <h4 style={{ marginBottom: 6 }}>{result.roadmapTitle}</h4>
            <p style={{ color: '#6B7280', fontSize: 14, lineHeight: 1.6 }}>{result.summary}</p>
          </div>

          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB' }}>{result.totalDuration}</div>
              <div style={{ color: '#6B7280', marginTop: 4 }}>Total Duration</div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#059669' }}>
                {result.totalEstimatedCost > 0 ? formatCompactINR(result.totalEstimatedCost) : 'Free'}
              </div>
              <div style={{ color: '#6B7280', marginTop: 4 }}>
                Estimated Cost
                {result.freeCourseCount > 0 && (
                  <div style={{ fontSize: 11, color: '#059669', marginTop: 2 }}>
                    {result.freeCourseCount} of {result.totalCourses} course(s) are free
                  </div>
                )}
              </div>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED' }}>{result.weeklyCommitment}</div>
              <div style={{ color: '#6B7280', marginTop: 4 }}>Weekly Commitment</div>
            </div>
          </div>

          {result.phases?.map((phase, i) => (
            <div key={i} className="card phase-card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div className="phase-number">Phase {phase.phase} · {phase.duration} ({phase.durationWeeks} wks)</div>
                  <h4 style={{ marginTop: 4 }}>{phase.title}</h4>
                </div>
                <span className="badge badge-gray">{phase.weeklyWorkload}</span>
              </div>

              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>
                Milestone: <span style={{ fontWeight: 400, color: '#6B7280' }}>{phase.milestoneGoal}</span>
              </div>

              {phase.learningObjectives?.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Learning Objectives</div>
                  <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {phase.learningObjectives.map((o, j) => (
                      <li key={j} style={{ fontSize: 13, color: '#4B5563' }}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Course Sequence</div>
                {phase.courses?.length ? phase.courses.map((c, j) => (
                  <a key={j} href={c.url} target="_blank" rel="noopener noreferrer" className="course-item" style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <div style={{ fontWeight: 800, color: '#9CA3AF', fontSize: 13, minWidth: 20 }}>{c.sequence}.</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 2 }}>{c.provider} · {c.durationHours}h · {c.level}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, minWidth: 130 }}>
                      <span className={platformBadgeClass(c.platform)}>{c.platform}</span>
                      <span className={c.cost === 'free' ? 'badge badge-green' : 'badge badge-yellow'}>{c.cost === 'free' ? 'Free' : c.priceDisplay}</span>
                    </div>
                  </a>
                )) : (
                  <div style={{ fontSize: 13, color: '#9CA3AF' }}>No catalog match for this skill yet — practice via projects and documentation.</div>
                )}
              </div>
            </div>
          ))}

          {result.expectedOutcomes?.length > 0 && (
            <div className="card" style={{ marginBottom: 20, background: '#ECFDF5', border: '1px solid #A7F3D0' }}>
              <h4 style={{ marginBottom: 12, color: '#065F46' }}>Expected Outcomes</h4>
              <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.expectedOutcomes.map((o, i) => (
                  <li key={i} style={{ fontSize: 14, color: '#065F46', lineHeight: 1.6 }}>{o}</li>
                ))}
              </ul>
            </div>
          )}

          {result.skillMilestones?.length > 0 && (
            <div className="card">
              <h4 style={{ marginBottom: 12 }}>Skill Milestones</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.skillMilestones.map((s, i) => <span key={i} className="badge badge-purple">{s}</span>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
