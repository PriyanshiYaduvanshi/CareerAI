// src/components/common/TopBar.js
import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { notificationsAPI } from '../../utils/api';
import { Bell, ChevronDown, User, LogOut, Menu } from 'lucide-react';
import './TopBar.css';

const PAGE_TITLES = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Welcome back!' },
  '/skill-gap': { title: 'Skill Gap Analysis', subtitle: 'Identify what you need to learn' },
  '/resume':       { title: 'Resume Analyzer', subtitle: 'Optimize your resume for ATS' },
  '/interview':    { title: 'Interview Practice', subtitle: 'Practice with AI mock interviews' },
  '/learning':     { title: 'Learning Roadmap', subtitle: 'Curated courses for your goals' },
  '/market':       { title: 'Market Trends', subtitle: 'Real-time job market insights' },
  '/applications': { title: 'Application Tracker', subtitle: 'Track your job applications' },
  '/profile':   { title: 'Profile', subtitle: 'Complete your professional profile' },
  '/notifications': { title: 'Notifications', subtitle: 'Stay up to date on your applications' },
};

export default function TopBar({ onMenuClick = () => {} }) {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const page = PAGE_TITLES[pathname];

  // Profile menu
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Notifications — the bell only shows an unread badge here; clicking it
  // navigates straight to the dedicated Notifications page (no popup).
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const loadUnreadCount = useCallback(() => {
    notificationsAPI.getAll({ limit: 1 })
      .then(res => setUnreadCount(res.data.unreadCount || 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [loadUnreadCount]);

  const handleBellClick = () => navigate('/notifications');

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <header className="topbar">
      <button className="topbar-menu-btn" onClick={onMenuClick} aria-label="Open menu">
        <Menu size={20} />
      </button>
      <div className="topbar-left">
        {page ? (
          <>
            <h1 className="topbar-title">{page.title}</h1>
            {page.subtitle && <p className="topbar-subtitle">{page.subtitle}</p>}
          </>
        ) : null}
      </div>

      <div className="topbar-right">
        <button className="topbar-icon-btn" aria-label="Notifications" title="Notifications" onClick={handleBellClick}>
          <Bell size={19} />
          {unreadCount > 0 && <span className="notif-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>

        <div className="topbar-profile-wrap" ref={menuRef}>
          <button className="topbar-profile" onClick={() => setMenuOpen(o => !o)}>
            <div className="topbar-avatar">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
            <ChevronDown size={16} className={`topbar-chevron ${menuOpen ? 'open' : ''}`} />
          </button>

          {menuOpen && (
            <div className="topbar-menu">
              <div className="topbar-menu-header">
                <div className="topbar-avatar">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
                <div>
                  <div className="topbar-menu-name">{user?.name}</div>
                  <div className="topbar-menu-email">{user?.email}</div>
                </div>
              </div>
              <Link to="/profile" className="topbar-menu-item" onClick={() => setMenuOpen(false)}>
                <User size={15} /> Profile
              </Link>
              <button className="topbar-menu-item danger" onClick={handleLogout}>
                <LogOut size={15} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
