// src/pages/InterviewPage.js
import { useState } from 'react';
import { interviewAPI } from '../utils/api';
import { Target, Rocket, Trophy } from 'lucide-react';
import './AIPages.css';

export default function InterviewPage() {
  const [step, setStep] = useState('setup');
  const [form, setForm] = useState({ role: '', difficulty: 'medium', count: 5 });
  const [interview, setInterview] = useState(null);
  const [currentQ, setCurrentQ] = useState(0);
  const [answer, setAnswer] = useState('');
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const startInterview = async () => {
    if (!form.role) return setError('Please enter a role');
    setError(''); setLoading(true);
    try {
      const res = await interviewAPI.start({ role: form.role, difficulty: form.difficulty, count: Number(form.count) });
      setInterview(res.data.interview);
      setStep('active');
    } catch (err) { setError(err.response?.data?.message || 'Failed to start interview'); }
    finally { setLoading(false); }
  };

  const submitAnswer = async () => {
    if (!answer.trim()) return;
    setLoading(true); setEvaluation(null);
    try {
      const res = await interviewAPI.answer(interview._id, { questionIndex: currentQ, answer });
      setInterview(res.data.interview);
      setEvaluation(res.data.evaluation);
    } catch { setError('Failed to evaluate answer'); }
    finally { setLoading(false); }
  };

  const nextQuestion = () => {
    setEvaluation(null);
    setAnswer('');
    if (currentQ + 1 >= interview.questions.length) {
      setStep('complete');
    } else {
      setCurrentQ(q => q + 1);
    }
  };

  const getScoreColor = (s) => s >= 8 ? '#059669' : s >= 5 ? '#D97706' : '#DC2626';

  if (step === 'setup') return (
    <div className="interview-setup">
      <div className="card">
        <h3 style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}><Target size={18} strokeWidth={2.2} /> AI Mock Interview</h3>
        <p style={{ color: '#6B7280', marginBottom: 24 }}>Practice with role-specific questions and get instant AI feedback.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-group">
          <label className="form-label">Target Role</label>
          <input value={form.role} onChange={e => setForm({...form, role: e.target.value})} placeholder="e.g. Frontend Developer at Google" />
        </div>
        <div className="grid-2" style={{ gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Difficulty</label>
            <select value={form.difficulty} onChange={e => setForm({...form, difficulty: e.target.value})}>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Number of Questions</label>
            <select value={form.count} onChange={e => setForm({...form, count: e.target.value})}>
              {[3, 5, 7, 10].map(n => <option key={n} value={n}>{n} questions</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-primary btn-lg" onClick={startInterview} disabled={loading} style={{ width: '100%' }}>
          {loading ? <span>Generating questions...</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Rocket size={16} /> Start Interview</span>}
        </button>
      </div>
    </div>
  );

  if (step === 'complete') return (
    <div style={{ maxWidth: 600 }}>
      <div className="card" style={{ textAlign: 'center', padding: 48 }}>
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--warning)' }}><Trophy size={56} strokeWidth={1.5} /></div>
        <h2 style={{ marginTop: 16 }}>Interview Complete!</h2>
        <div style={{ fontSize: 52, fontWeight: 800, color: '#2563EB', margin: '20px 0' }}>
          {interview?.overallScore}/10
        </div>
        <p style={{ color: '#6B7280', marginBottom: 28 }}>{interview?.overallFeedback}</p>
        <button className="btn btn-primary btn-lg" onClick={() => { setStep('setup'); setCurrentQ(0); setInterview(null); }}>
          Practice Again
        </button>
      </div>
      <div className="card" style={{ marginTop: 20 }}>
        <h4 style={{ marginBottom: 16 }}>Question Breakdown</h4>
        {interview?.questions?.map((q, i) => (
          <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #F3F4F6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Q{i+1}: {q.question.substring(0, 60)}...</span>
              <span style={{ fontWeight: 800, color: getScoreColor(q.score) }}>{q.score}/10</span>
            </div>
            <p style={{ fontSize: 13, color: '#6B7280' }}>{q.feedback}</p>
          </div>
        ))}
      </div>
    </div>
  );

  const question = interview?.questions?.[currentQ];
  return (
    <div style={{ maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: '#6B7280' }}>Question {currentQ + 1} of {interview.questions.length}</span>
        <div className="progress-bar" style={{ width: 200 }}>
          <div className="progress-fill" style={{ width: `${((currentQ + 1) / interview.questions.length) * 100}%` }}></div>
        </div>
      </div>

      <div className="card question-card" style={{ marginBottom: 16 }}>
        <div className="question-number">Question {currentQ + 1} - {question?.type} - {question?.difficulty}</div>
        <div className="question-text">{question?.question}</div>
        <textarea
          className="answer-area"
          value={answer}
          onChange={e => setAnswer(e.target.value)}
          placeholder="Type your answer here... Be thorough and specific. Use the STAR method for behavioral questions."
          rows={6}
          disabled={!!evaluation}
        />
        {!evaluation && (
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={submitAnswer} disabled={loading || !answer.trim()}>
            {loading ? 'Evaluating...' : 'Submit Answer'}
          </button>
        )}
      </div>

      {evaluation && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h4>AI Feedback</h4>
            <div className="score-display" style={{ color: getScoreColor(evaluation.score), borderColor: getScoreColor(evaluation.score) }}>
              {evaluation.score}/10
            </div>
          </div>
          <p style={{ color: '#6B7280', marginBottom: 16, lineHeight: 1.7 }}>{evaluation.feedback}</p>

          {evaluation.strengths?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#059669' }}>Strengths</div>
              <ul style={{ paddingLeft: 20 }}>
                {evaluation.strengths.map((s, i) => <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{s}</li>)}
              </ul>
            </div>
          )}
          {evaluation.improvements?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6, color: '#D97706' }}>Improvements</div>
              <ul style={{ paddingLeft: 20 }}>
                {evaluation.improvements.map((s, i) => <li key={i} style={{ fontSize: 13, marginBottom: 4 }}>{s}</li>)}
              </ul>
            </div>
          )}

          <div style={{ background: '#F9FAFB', padding: 14, borderRadius: 10, marginTop: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Ideal Answer</div>
            <p style={{ fontSize: 13, color: '#6B7280', lineHeight: 1.7 }}>{evaluation.idealAnswer}</p>
          </div>

          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={nextQuestion}>
            {currentQ + 1 < interview.questions.length ? 'Next Question' : 'View Results'}
          </button>
        </div>
      )}
    </div>
  );
}
