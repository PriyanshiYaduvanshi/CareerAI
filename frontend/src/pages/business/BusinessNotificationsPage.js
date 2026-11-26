// src/pages/business/BusinessNotificationsPage.js
import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, Briefcase, CheckCircle2, XCircle, CalendarClock, Bell } from 'lucide-react';
import { notificationsAPI } from '../../utils/api';
import '../../components/business/business.css';

// Business notifications are all of Notification.type === 'application' (the
// only type the backend currently emits), so we pick an icon/color based on
// keywords in the title instead of a dedicated notification sub-type.
const iconFor = (title = '') => {
  const t = title.toLowerCase();
  if (t.includes('new application')) return { icon: Users, bg: '#EFF6FF', color: '#2563EB' };
  if (t.includes('shortlist')) return { icon: CheckCircle2, bg: '#ECFDF5', color: '#059669' };
  if (t.includes('interview')) return { icon: CalendarClock, bg: '#F5F3FF', color: '#7C3AED' };
  if (t.includes('reject')) return { icon: XCircle, bg: '#FEF2F2', color: '#DC2626' };
  if (t.includes('job')) return { icon: Briefcase, bg: '#FFFBEB', color: '#D97706' };
  return { icon: Bell, bg: 'var(--bg)', color: 'var(--text-secondary)' };
};

const timeAgo = (dateStr) => {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
};

export default function BusinessNotificationsPage() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    notificationsAPI.getAll({ limit: 50 })
      .then(res => { setNotifications(res.data.notifications || []); setError(''); })
      .catch(err => {
        setNotifications([]);
        setError(err.response?.data?.message || 'Failed to load notifications');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleMarkAllRead = async () => {
    setMarking(true);
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to mark notifications as read');
    }
    setMarking(false);
  };

  const handleNotifClick = async (n) => {
    if (!n.isRead) {
      try {
        await notificationsAPI.markRead(n._id);
        setNotifications(prev => prev.map(x => x._id === n._id ? { ...x, isRead: true } : x));
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to mark notification as read');
      }
    }
    if (n.link) navigate(n.link);
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
    <div>
      <div className="biz-page-header">
        <div>
          <h2>Notifications</h2>
          <p>Stay up to date with your hiring activity.</p>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={handleMarkAllRead} disabled={marking}>
            {marking ? 'Marking…' : 'Mark all as read'}
          </button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card">
        {loading ? (
          <div className="empty-state"><p>Loading notifications…</p></div>
        ) : notifications.length > 0 ? (
          <div className="biz-notif-list">
            {notifications.map(n => {
              const cfg = iconFor(n.title);
              const Icon = cfg.icon;
              return (
                <div
                  key={n._id}
                  className={`biz-notif-item ${!n.isRead ? 'unread' : ''}`}
                  onClick={() => handleNotifClick(n)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="biz-notif-icon" style={{ background: cfg.bg, color: cfg.color }}>
                    <Icon size={17} />
                  </div>
                  <div className="biz-notif-text">
                    <div className="title">{n.title}</div>
                    {n.message && <div className="desc">{n.message}</div>}
                  </div>
                  <div className="biz-notif-time">{timeAgo(n.createdAt)}</div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <p>You're all caught up!</p>
          </div>
        )}
      </div>
    </div>
  );
}
