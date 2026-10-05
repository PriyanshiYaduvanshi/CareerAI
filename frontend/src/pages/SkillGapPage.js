// src/pages/SkillGapPage.js
import { useState } from 'react';
import { aiAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Search, Sparkles, ClipboardList, AlertTriangle, CheckCircle2, Lightbulb, Clock } from 'lucide-react';
import './AIPages.css';

const PRIORITY_COLORS = { high: '#DC2626', medium: '#D97706', low: '#059669' };

export default function SkillGapPage() {
  const { user } = useAuth();
  const [targetJob, setTargetJob] = useState(user?.targetJob || '');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAnalyze = async () => {
    if (!targetJob) return setError('Please enter a target job');
    if (!user?.skills?.length) return setError('Please add skills to your profile first');
    setError(''); setLoading(true);
    try {
      const res = await aiAPI.skillGap({ targetJob });
      setResult(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'AI analysis failed. Please check your API key.');
    } finally { setLoading(false); }
  };

  return (
    <div className="ai-page">
      <div className="ai-input-card card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Search size={18} strokeWidth={2.2} /> Analyze Your Skill Gap</h3>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>
          AI will compare your current skills with the requirements for your target role.
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <input value={targetJob} onChange={e => setTargetJob(e.target.value)} placeholder="e.g. Senior Full Stack Developer" style={{ flex: 1 }} />
          <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading}>
            {loading ? <><div className="spinner"></div> Analyzing...</> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Sparkles size={16} /> Analyze</span>}
          </button>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}

        {/* Current skills preview */}
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>YOUR CURRENT SKILLS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {user?.skills?.length > 0
              ? user.skills.map(s => <span key={s.name} className="badge badge-blue">{s.name}</span>)
              : <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>No skills added — go to Profile Setup</span>
            }
          </div>
        </div>
      </div>

      {loading && (
        <div className="ai-loading">
          <div className="ai-loading-inner">
            <div className="ai-loader"></div>
            <h3>AI is analyzing your skills...</h3>
            <p>This may take a few seconds</p>
          </div>
        </div>
      )}

      {result && !loading && (
        <div className="ai-results">
          {/* Overview */}
          <div className="grid-3" style={{ marginBottom: 24 }}>
            <div className="card" style={{ background: 'var(--primary)', color: '#fff', border: 'none' }}>
              <div style={{ fontSize: 40, fontWeight: 800, fontFamily: 'Plus Jakarta Sans' }}>{result.overallMatch}%</div>
              <div style={{ opacity: 0.85, marginTop: 4 }}>Overall Match Score</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--danger)' }}>{result.missingSkills?.length || 0}</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Skills to Learn</div>
            </div>
            <div className="card">
              <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--success)' }}>{result.strongSkills?.length || 0}</div>
              <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Strong Skills</div>
            </div>
          </div>

          {/* Summary */}
          <div className="card" style={{ marginBottom: 24 }}>
            <h4 style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}><ClipboardList size={16} strokeWidth={2.2} /> Analysis Summary</h4>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>{result.summary}</p>
          </div>

          <div className="grid-2">
            {/* Missing skills */}
            <div className="card">
              <h4 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><AlertTriangle size={16} strokeWidth={2.2} color="var(--warning)" /> Skills to Develop</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {result.missingSkills?.map((skill, i) => (
                  <div key={i} className="skill-gap-item">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{skill.skill}</span>
                      <span className="badge" style={{ background: PRIORITY_COLORS[skill.priority] + '20', color: PRIORITY_COLORS[skill.priority] }}>
                        {skill.priority} priority
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>{skill.reason}</div>
                    <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={12} /> {skill.timeToLearn}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Strong skills + recommendations */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card">
                <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><CheckCircle2 size={16} strokeWidth={2.2} color="var(--success)" /> Your Strong Skills</h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {result.strongSkills?.map((s, i) => <span key={i} className="badge badge-green">{s}</span>)}
                </div>
              </div>
              <div className="card">
                <h4 style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Lightbulb size={16} strokeWidth={2.2} color="var(--warning)" /> Top Recommendations</h4>
                <ol style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {result.topRecommendations?.map((r, i) => (
                    <li key={i} style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{r}</li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
