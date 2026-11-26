// src/pages/business/BusinessSettingsPage.js
import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { businessSettingsAPI } from '../../utils/api';
import '../../components/business/business.css';

function Toggle({ checked, onChange, disabled }) {
  return (
    <label className="biz-switch">
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span className="biz-switch-track" />
    </label>
  );
}

const DEFAULT_PREFS = { newApplicants: true, jobApproved: true, weeklyReport: false };

export default function BusinessSettingsPage() {
  const { user } = useAuth();
  const [notifPrefs, setNotifPrefs] = useState(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    businessSettingsAPI.getNotificationPrefs()
      .then(res => { if (mounted) setNotifPrefs({ ...DEFAULT_PREFS, ...res.data.notificationPrefs }); })
      .catch(() => { if (mounted) setError('Failed to load notification preferences.'); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // Optimistic toggle: flip immediately, persist in the background, and
  // roll back + surface an error if the save fails.
  const toggle = async (key) => {
    setError('');
    const nextValue = !notifPrefs[key];
    setNotifPrefs(prev => ({ ...prev, [key]: nextValue }));
    setSavingKey(key);
    try {
      await businessSettingsAPI.updateNotificationPrefs({ [key]: nextValue });
    } catch (err) {
      setNotifPrefs(prev => ({ ...prev, [key]: !nextValue })); // roll back
      setError(err.response?.data?.message || 'Failed to save notification preference.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div>
      <div className="biz-page-header">
        <div>
          <h2>Settings</h2>
          <p>Manage your account, appearance, and notification preferences.</p>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        <div className="card">
          <div className="biz-settings-section">
            <h3 style={{ marginBottom: 12, fontSize: 15 }}>Account</h3>
            <div className="form-group">
              <label className="form-label">Contact Email</label>
              <input value={user?.email || ''} disabled />
              <p className="form-hint">Used for login and hiring notifications.</p>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Account Type</label>
              <input value="Business" disabled />
            </div>
          </div>

          <div className="biz-settings-section" style={{ marginBottom: 0 }}>
            <h3 style={{ marginBottom: 4, fontSize: 15 }}>Notifications</h3>
            {loading ? (
              <div style={{ padding: '20px 0', textAlign: 'center' }}>
                <div className="spinner spinner-blue" style={{ margin: '0 auto' }}></div>
              </div>
            ) : (
              <>
                <div className="biz-settings-row">
                  <div className="biz-settings-row-text">
                    <div className="title">New applicants</div>
                    <div className="desc">Get notified when someone applies to your jobs.</div>
                  </div>
                  <Toggle checked={notifPrefs.newApplicants} onChange={() => toggle('newApplicants')} disabled={savingKey === 'newApplicants'} />
                </div>
                <div className="biz-settings-row">
                  <div className="biz-settings-row-text">
                    <div className="title">Job post approved</div>
                    <div className="desc">Get notified when a job post goes live.</div>
                  </div>
                  <Toggle checked={notifPrefs.jobApproved} onChange={() => toggle('jobApproved')} disabled={savingKey === 'jobApproved'} />
                </div>
                <div className="biz-settings-row">
                  <div className="biz-settings-row-text">
                    <div className="title">Weekly hiring report</div>
                    <div className="desc">Receive a weekly summary of hiring analytics.</div>
                  </div>
                  <Toggle checked={notifPrefs.weeklyReport} onChange={() => toggle('weeklyReport')} disabled={savingKey === 'weeklyReport'} />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginBottom: 12, fontSize: 15 }}>Danger Zone</h3>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
            These actions are irreversible. Please proceed with caution.
          </p>
          <button className="btn btn-danger btn-sm">Deactivate Business Account</button>
        </div>
      </div>
    </div>
  );
}
