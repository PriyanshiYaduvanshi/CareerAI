// src/pages/ProfilePage.js
import { useState, useEffect } from 'react';
import { usersAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { UserRound, Target, Zap, Save } from 'lucide-react';
import { isValidIndianPhone, PHONE_ERROR_MESSAGE } from '../utils/validators';
import './ProfilePage.css';

const PROFICIENCY = ['beginner', 'intermediate', 'advanced', 'expert'];

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const [form, setForm] = useState({ name: '', title: '', bio: '', location: '', phone: '', targetJob: '', targetSalary: '' });
  const [skills, setSkills] = useState([]);
  const [newSkill, setNewSkill] = useState({ name: '', proficiency: 'intermediate' });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    if (user) {
      setForm({ name: user.name || '', title: user.title || '', bio: user.bio || '', location: user.location || '', phone: user.phone || '', targetJob: user.targetJob || '', targetSalary: user.targetSalary || '' });
      setSkills(user.skills || []);
    }
  }, [user]);

  const addSkill = () => {
    if (!newSkill.name.trim()) return;
    if (skills.find(s => s.name.toLowerCase() === newSkill.name.toLowerCase())) return;
    setSkills(prev => [...prev, { ...newSkill, name: newSkill.name.trim() }]);
    setNewSkill({ name: '', proficiency: 'intermediate' });
  };

  const removeSkill = (name) => setSkills(prev => prev.filter(s => s.name !== name));

  const validate = () => {
    const errs = {};
    if (form.phone.trim() && !isValidIndianPhone(form.phone.trim())) {
      errs.phone = PHONE_ERROR_MESSAGE;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    setSuccess(''); setError('');
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await usersAPI.updateProfile({ ...form, skills });
      updateUser(res.data.user);
      setSuccess('Profile saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      const data = err.response?.data;
      setError(data?.message || data?.errors?.[0]?.msg || 'Failed to save');
    }
    finally { setSaving(false); }
  };

  const pctColors = { beginner: '#6B7280', intermediate: '#2563EB', advanced: '#7C3AED', expert: '#059669' };

  return (
    <div className="profile-page">
      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Basic info */}
      <div className="card profile-section">
        <h3 className="profile-section-title">
          <span className="icon-chip"><UserRound size={17} strokeWidth={2.2} /></span>
          Basic Information
        </h3>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="John Doe" />
          </div>
          <div className="form-group">
            <label className="form-label">Professional Title</label>
            <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} placeholder="Senior Software Engineer" />
          </div>
          <div className="form-group">
            <label className="form-label">Location</label>
            <input value={form.location} onChange={e => setForm({...form, location: e.target.value})} placeholder="San Francisco, CA" />
          </div>
          <div className="form-group">
            <label className="form-label">Phone</label>
            <input
              value={form.phone}
              onChange={e => { setForm({...form, phone: e.target.value}); setFieldErrors(fe => ({...fe, phone: undefined})); }}
              placeholder="98765 43210"
            />
            {fieldErrors.phone && <div className="form-error">{fieldErrors.phone}</div>}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Bio</label>
          <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} rows={3} placeholder="Brief professional summary..." />
        </div>
      </div>

      {/* Career goals */}
      <div className="card profile-section">
        <h3 className="profile-section-title">
          <span className="icon-chip"><Target size={17} strokeWidth={2.2} /></span>
          Career Goals
        </h3>
        <div className="grid-2">
          <div className="form-group">
            <label className="form-label">Target Job Role</label>
            <input value={form.targetJob} onChange={e => setForm({...form, targetJob: e.target.value})} placeholder="Senior Full Stack Developer" />
            <p className="form-hint">Used for AI job matching and skill gap analysis</p>
          </div>
          <div className="form-group">
            <label className="form-label">Target Salary (₹/year)</label>
            <input type="number" value={form.targetSalary} onChange={e => setForm({...form, targetSalary: e.target.value})} placeholder="1200000" />
          </div>
        </div>
      </div>

      {/* Skills */}
      <div className="card profile-section">
        <h3 className="profile-section-title" style={{ marginBottom: 8 }}>
          <span className="icon-chip"><Zap size={17} strokeWidth={2.2} /></span>
          Skills
        </h3>
        <p className="profile-section-hint">Add your technical and soft skills. These are used for AI job matching.</p>

        {/* Current skills */}
        <div className="profile-skills-list">
          {skills.map((s, i) => (
            <div key={i} className="profile-skill-chip">
              <span className="name">{s.name}</span>
              <span className="proficiency" style={{ color: pctColors[s.proficiency] }}>{s.proficiency}</span>
              <button className="remove-btn" onClick={() => removeSkill(s.name)}>×</button>
            </div>
          ))}
          {skills.length === 0 && <span className="profile-skills-empty">No skills added yet</span>}
        </div>

        {/* Add skill */}
        <div className="profile-add-skill">
          <input value={newSkill.name} onChange={e => setNewSkill({...newSkill, name: e.target.value})}
            placeholder="Skill name (e.g. React, Python...)"
            onKeyDown={e => e.key === 'Enter' && addSkill()}
          />
          <select value={newSkill.proficiency} onChange={e => setNewSkill({...newSkill, proficiency: e.target.value})}>
            {PROFICIENCY.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
          </select>
          <button className="btn btn-primary" onClick={addSkill}>+ Add</button>
        </div>
      </div>

      <button className="btn btn-primary btn-lg profile-save-btn" onClick={handleSave} disabled={saving}>
        {saving ? <><div className="spinner"></div> Saving...</> : <><Save size={16} /> Save Profile</>}
      </button>
    </div>
  );
}
