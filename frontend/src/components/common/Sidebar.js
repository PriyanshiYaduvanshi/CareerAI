// src/components/common/Sidebar.js
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import logo from '../../assets/careerai-logo.png';
import {
  LayoutGrid, BarChart3, FileText, Target,
  GraduationCap, TrendingUp, ClipboardList, User,
  Bell, Settings, LogOut, Briefcase, X,
} from 'lucide-react';
import './Sidebar.css';

const NAV_ITEMS = [
  { path: '/dashboard',    icon: LayoutGrid,     label: 'Dashboard' },
  { path: '/jobs',         icon: Briefcase,      label: 'Job Recommendations' },
  { path: '/skill-gap',    icon: BarChart3,      label: 'Skill Gap Analysis' },
  { path: '/resume',       icon: FileText,       label: 'Resume Analyzer' },
  { path: '/interview',    icon: Target,         label: 'Interview Practice' },
  { path: '/learning',     icon: GraduationCap,  label: 'Learning Roadmap' },
  { path: '/market',       icon: TrendingUp,     label: 'Market Trends' },
  { path: '/applications', icon: ClipboardList,  label: 'Application Tracker' },
  { path: '/profile',      icon: User,           label: 'Profile' },
];

// `open` / `onClose` control the mobile slide-in drawer state (owned by
// Layout). On desktop widths these have no visual effect — the sidebar is
// always shown via CSS — but on narrow viewports the sidebar is hidden
// off-screen until `open` is true, with a tap-to-dismiss backdrop.
export default function Sidebar({ open = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); onClose(); };

  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} aria-hidden="true" />}
      <aside className={`sidebar ${open ? 'mobile-open' : ''}`}>
        <div className="sidebar-logo">
          <span className="logo-chip">
            <img src={logo} alt="careerAI" className="sidebar-logo-img" />
          </span>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                onClick={onClose}
              >
                <span className="nav-icon"><Icon size={17} strokeWidth={2} /></span>
                <span className="nav-label">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-utility">
          <NavLink to="/dashboard" className="utility-btn" aria-label="Dashboard grid" title="Dashboard grid" onClick={onClose}>
            <LayoutGrid size={17} />
          </NavLink>
          <NavLink
            to="/notifications"
            className={({ isActive }) => `utility-btn ${isActive ? 'active' : ''}`}
            aria-label="Notifications"
            title="Notifications"
            onClick={onClose}
          >
            <Bell size={17} />
          </NavLink>
          <NavLink to="/profile" className="utility-btn" aria-label="Settings" title="Settings" onClick={onClose}>
            <Settings size={17} />
          </NavLink>
        </div>

        <div className="sidebar-footer">
          <div className="user-mini">
            <div className="user-avatar">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
            <div className="user-info">
              <div className="user-name">{user?.name || 'User'}</div>
              <div className="user-email">{user?.email}</div>
            </div>
          </div>
          <button className="logout-btn" onClick={handleLogout} aria-label="Logout" title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
}
