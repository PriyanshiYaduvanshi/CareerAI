// src/pages/ResumePage.js
import { useState, useRef } from 'react';
import { resumeAPI } from '../utils/api';
import { Paperclip } from 'lucide-react';
import './AIPages.css';

export default function ResumePage() {
  const [file, setFile] = useState(null);
  const [resumeText, setResumeText] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('upload');
  const fileRef = useRef();

  const handleAnalyze = async () => {
    setError(''); setLoading(true);
    try {
      const formData = new FormData();
      if (tab === 'upload' && file) {
        formData.append('resume', file);
      } else if (tab === 'paste' && resumeText) {
        formData.append('resumeText', resumeText);
      } else {
        setLoading(false);
        return setError('Please provide a resume');
      }
      if (targetRole) formData.append('targetRole', targetRole);
      const res = await resumeAPI.analyze(formData);
      setResult(res.data.analysis);
    } catch (err) {
      setError(err.response?.data?.message || 'Analysis failed. Check API key.');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (s) => s >= 70 ? '#059669' : s >= 50 ? '#D97706' : '#DC2626';

  const uploadZoneStyle = {
    border: '2px dashed #E5E7EB',
    borderRadius: 16,
    padding: '40px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: file ? '#EFF6FF' : '#F9FAFB'
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <div className="card" style={{ marginBottom: 24 }}>
        <h3 style={{ marginBottom: 8 }}>Resume ATS Analyzer</h3>
        <p style={{ color: '#6B7280', marginBottom: 20 }}>Upload your resume and get an ATS score, keyword analysis, and AI-powered improvement suggestions.</p>

        <div style={{ display: 'flex', marginBottom: 20, gap: 8 }}>
          {['upload', 'paste'].map(t => (
            <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(t)}>
              {t === 'upload' ? 'Upload PDF' : 'Paste Text'}
            </button>
          ))}
        </div>

        {tab === 'upload' ? (
          <div style={uploadZoneStyle} onClick={() => fileRef.current.click()}>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt"
              style={{ display: 'none' }}
              onChange={e => setFile(e.target.files[0])}
            />
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10, color: 'var(--text-muted)' }}><Paperclip size={36} strokeWidth={1.6} /></div>
            <div style={{ fontWeight: 600 }}>{file ? file.name : 'Click to upload resume'}</div>
            <div style={{ color: '#9CA3AF', fontSize: 13, marginTop: 4 }}>PDF or TXT, max 5MB</div>
          </div>
        ) : (
          <textarea
            value={resumeText}
            onChange={e => setResumeText(e.target.value)}
            placeholder="Paste your resume text here..."
            rows={10}
            style={{ resize: 'vertical' }}
          />
        )}

        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <input
            value={targetRole}
            onChange={e => setTargetRole(e.target.value)}
            placeholder="Target role (optional) e.g. React Developer"
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-lg" onClick={handleAnalyze} disabled={loading}>
            {loading ? 'Analyzing...' : 'Analyze Resume'}
          </button>
        </div>
        {error && <div className="alert alert-error" style={{ marginTop: 12 }}>{error}</div>}
      </div>

      {loading && (
        <div className="ai-loading">
          <div className="ai-loading-inner">
            <div className="ai-loader"></div>
            <h3>Analyzing your resume...</h3>
            <p>Checking ATS compatibility, keywords, and formatting</p>
          </div>
        </div>
      )}

      {result && !loading && (
        <div>
          <div className="grid-2" style={{ marginBottom: 24 }}>
            <div className="card ats-score-card">
              <div style={{ textAlign: 'center' }}>
                <div className="ats-number" style={{ color: getScoreColor(result.atsScore) }}>{result.atsScore}</div>
                <div style={{ fontWeight: 600, color: '#6B7280', marginTop: 8 }}>ATS Score / 100</div>
                <div style={{ marginTop: 12, fontSize: 14, color: getScoreColor(result.atsScore), fontWeight: 600 }}>
                  {result.atsScore >= 70 ? 'Good' : result.atsScore >= 50 ? 'Fair' : 'Needs Work'}
                </div>
              </div>
            </div>
            <div className="card">
              <h4 style={{ marginBottom: 16 }}>Score Breakdown</h4>
              {Object.entries(result.scoreBreakdown || {}).map(([key, val]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                    <span style={{ textTransform: 'capitalize' }}>{key}</span>
                    <span style={{ fontWeight: 700, color: getScoreColor(val) }}>{val}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${val}%`, background: getScoreColor(val) }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {result.missingKeywords?.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h4 style={{ marginBottom: 12 }}>Missing Keywords</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.missingKeywords.map((k, i) => <span key={i} className="badge badge-red">{k}</span>)}
              </div>
            </div>
          )}

          <div className="grid-2">
            <div className="card">
              <h4 style={{ marginBottom: 16 }}>Improvement Suggestions</h4>
              {result.improvements?.map((imp, i) => (
                <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: '#D97706', marginBottom: 4 }}>{imp.section}</div>
                  <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 4 }}>{imp.issue}</div>
                  <div style={{ fontSize: 13, color: '#2563EB' }}>{imp.suggestion}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div className="card">
                <h4 style={{ marginBottom: 12 }}>Strengths</h4>
                {result.strengths?.map((s, i) => (
                  <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid #F3F4F6', fontSize: 14, color: '#6B7280' }}>
                    {s}
                  </div>
                ))}
              </div>

              {result.betterBulletPoints?.length > 0 && (
                <div className="card">
                  <h4 style={{ marginBottom: 12 }}>Better Bullet Points</h4>
                  {result.betterBulletPoints.slice(0, 3).map((b, i) => (
                    <div key={i} style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 12, color: '#DC2626', marginBottom: 4 }}>Before: {b.original}</div>
                      <div style={{ fontSize: 12, color: '#059669' }}>After: {b.improved}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 20, background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
            <h4 style={{ marginBottom: 10, color: '#1D4ED8' }}>AI Overall Feedback</h4>
            <p style={{ color: '#1D4ED8', lineHeight: 1.7 }}>{result.overallFeedback}</p>
          </div>
        </div>
      )}
    </div>
  );
}
