// src/pages/business/CompanyProfilePage.js
import { useEffect, useState } from 'react';
import { Building2, Globe, MapPin, Users2, CalendarDays } from 'lucide-react';
import { businessProfileAPI } from '../../utils/api';
import '../../components/business/business.css';

const emptyProfile = { name: '', industry: '', size: '', founded: '', location: '', website: '', about: '' };

export default function CompanyProfilePage() {
  const [form, setForm] = useState(emptyProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    businessProfileAPI.get()
      .then(res => { if (mounted) setForm({ ...emptyProfile, ...res.data.profile }); })
      .catch(() => { if (mounted) setError('Failed to load company profile.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  const handleChange = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await businessProfileAPI.update(form);
      setForm({ ...emptyProfile, ...res.data.profile });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      const data = err.response?.data;
      if (data?.errors?.length) setError(data.errors[0].msg || data.errors[0].message);
      else setError(data?.message || 'Failed to save company profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <div className="spinner spinner-blue"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="biz-page-header">
        <div>
          <h2>Company Profile</h2>
          <p>This information is shown to candidates on your job postings.</p>
        </div>
      </div>

      {saved && <div className="alert alert-success">Company profile saved successfully! ✅</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        <div className="card">
          <div className="biz-company-card" style={{ marginBottom: 20 }}>
            <div className="biz-company-logo"><Building2 size={26} /></div>
            <div className="biz-company-meta">
              <h3>{form.name || 'Your Company'}</h3>
              <div className="industry">{form.industry}</div>
            </div>
          </div>

          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Company Name</label>
              <input value={form.name} onChange={handleChange('name')} />
            </div>
            <div className="form-group">
              <label className="form-label">Industry</label>
              <input value={form.industry} onChange={handleChange('industry')} />
            </div>
            <div className="grid-2" style={{ gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Company Size</label>
                <input value={form.size} onChange={handleChange('size')} placeholder="e.g. 201-500 employees" />
              </div>
              <div className="form-group">
                <label className="form-label">Founded</label>
                <input type="number" min="1800" max={new Date().getFullYear()} value={form.founded} onChange={handleChange('founded')} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Location</label>
              <input value={form.location} onChange={handleChange('location')} />
            </div>
            <div className="form-group">
              <label className="form-label">Website</label>
              <input value={form.website} onChange={handleChange('website')} placeholder="https://example.com" />
            </div>
            <div className="form-group">
              <label className="form-label">About</label>
              <textarea rows={4} value={form.about} onChange={handleChange('about')} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><div className="spinner"></div> Saving...</> : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 16, fontSize: 16 }}>Preview</h3>
          <div className="biz-company-card">
            <div className="biz-company-logo"><Building2 size={26} /></div>
            <div className="biz-company-meta">
              <h3>{form.name || 'Your Company'}</h3>
              <div className="industry">{form.industry}</div>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '10px 0 14px' }}>{form.about}</p>
              <div className="biz-company-facts" style={{ flexDirection: 'column', gap: 10 }}>
                <span className="biz-company-fact"><Users2 size={14} /> {form.size}</span>
                <span className="biz-company-fact"><MapPin size={14} /> {form.location}</span>
                <span className="biz-company-fact"><CalendarDays size={14} /> Founded {form.founded}</span>
                <span className="biz-company-fact"><Globe size={14} /> {form.website}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
