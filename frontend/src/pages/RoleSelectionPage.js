// src/pages/RoleSelectionPage.js
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Search, Terminal } from 'lucide-react';
import logo from '../assets/careerai-logo.png';
import roleIllustration from '../assets/roleselection-image.png';
import './RoleSelectionPage.css';

const ROLES = [
  {
    id: 'hire',
    icon: Search,
    title: "I'm here to hire tech talent",
    subtitle: 'Evaluate tech skills at scale',
  },
  {
    id: 'practice',
    icon: Terminal,
    title: "I'm here to practice and prepare",
    subtitle: 'Solve problems and learn new skills',
    badge: null,
  },
];

export default function RoleSelectionPage() {
  const [selected, setSelected] = useState('hire');
  const navigate = useNavigate();

  const handleContinue = () => {
    sessionStorage.setItem('selectedRole', selected);
    if (selected === 'hire') {
      // Hiring/admin accounts are provisioned internally — sign in only
      navigate('/register?role=company');
    } else {
      navigate('/register?role=practice');
    }
  };

  return (
    <div className="role-page">
      <div className="role-left">
        <div className="role-brand">
          <span className="role-brand-chip">
            <img src={logo} alt="careerAI" className="role-brand-img" />
          </span>
        </div>

        <h1 className="role-heading">How do you want to<br />use careerAI?</h1>
        <p className="role-subheading">We'll personalize your setup experience accordingly.</p>

        <div className="role-options">
          {ROLES.map(role => {
            const Icon = role.icon;
            const isSelected = selected === role.id;
            return (
              <button
                key={role.id}
                type="button"
                className={`role-option ${isSelected ? 'role-option-selected' : ''}`}
                onClick={() => setSelected(role.id)}
              >
                <span className="role-option-icon"><Icon size={20} /></span>
                <span className="role-option-text">
                  <span className="role-option-title">{role.title}</span>
                  <span className="role-option-subtitle">{role.subtitle}</span>
                </span>
                {role.badge && <span className="role-option-badge">{role.badge}</span>}
              </button>
            );
          })}
        </div>

        <button className="btn btn-primary role-create-btn" onClick={handleContinue}>
          Create account
        </button>

        <p className="role-signin-hint">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>

      <div className="role-right">
        <div className="role-illustration-glow" />
        <img
          src={roleIllustration}
          alt="Illustration of a person working on a laptop, representing AI-powered career tools"
          className="role-illustration-img"
        />
      </div>
    </div>
  );
}