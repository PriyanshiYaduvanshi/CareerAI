// src/pages/LandingPage.js
import { Link } from 'react-router-dom';
import logo from '../assets/careerai-logo.png';
import heroVisual from '../assets/hero-visual.webp';
import {
  Search, Route as RouteIcon, Bot, Briefcase, FileEdit, UserSquare2,
  Check, ArrowRight,
} from 'lucide-react';
import './LandingPage.css';

const FEATURES = [
  { icon: Search,      title: 'Skill Gap Analysis', desc: 'AI identifies exactly what skills stand between you and your target role.' },
  { icon: RouteIcon,   title: 'Personalized Roadmap', desc: 'A step-by-step learning path generated from your goals and current skillset.' },
  { icon: Bot,         title: 'Mock Interviews', desc: 'Practice with role-specific questions and get instant, structured AI feedback.' },
  { icon: Briefcase,   title: 'Job Search', desc: 'Jobs ranked by match score, sourced and screened autonomously.' },
  { icon: FileEdit,    title: 'Resume Optimization', desc: 'ATS scoring and rewrite suggestions that get your resume past the filters.' },
  { icon: UserSquare2, title: 'Career Mentor AI', desc: 'An always-on mentor for offer decisions, negotiation, and next steps.' },
];

const TECH_STACK = ['React', 'Node.js', 'Express', 'MongoDB', 'Gemini 2.0 Flash', 'JWT Auth'];

export default function LandingPage() {
  return (
    <div className="landing">
      <nav className="landing-nav">
        <div className="nav-brand"><img src={logo} alt="careerAI" className="nav-logo-img" /></div>
        <div className="nav-center">
          <a href="#features">Features</a>
          <a href="#agents">Agents</a>
          <a href="#tech-stack">Tech Stack</a>
        </div>
        <div className="nav-links">
          <Link to="/login" className="nav-signin">Sign in</Link>
          <Link to="/get-started" className="btn btn-dark">Create account</Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-badge">✨ Infinite agents. Unstoppable career.</div>
          <h1>An intelligent <span className="gradient-text">multi-agent AI</span> for your career.</h1>
          <p>Six specialized agents that analyze your skills, plan learning paths, optimize your resume, and prep you for interviews — autonomously, from skill gap to offer letter.</p>
          <div className="hero-actions">
            <Link to="/get-started" className="btn btn-dark btn-lg">Get started free <ArrowRight size={17} /></Link>
            <Link to="/login" className="btn btn-outline btn-lg">Sign in</Link>
          </div>
          <div className="hero-trust">
            <span><Check size={15} /> Gemini 2.0 Flash</span>
            <span><Check size={15} /> ATS resume scoring</span>
            <span><Check size={15} /> Adaptive learning</span>
            <span><Check size={15} /> Multi-agent coordination</span>
          </div>
        </div>

        <div className="hero-visual" id="agents">
          <div className="hero-visual-bg" />
          <img
            src={heroVisual}
            alt="AI agents collaborating with people through career roadmaps, mock interviews, resume reviews and job search tools"
            className="hero-visual-img"
          />
        </div>
      </section>

      <section className="features" id="features">
        <h2>Everything you need to accelerate your career</h2>
        <div className="features-grid">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div key={f.title} className="feature-card card-hover">
                <div className="feature-icon"><Icon size={20} strokeWidth={2.2} /></div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="tech-stack" id="tech-stack">
        <h2>Built with</h2>
        <div className="tech-stack-row">
          {TECH_STACK.map(t => <span key={t} className="tech-pill">{t}</span>)}
        </div>
      </section>

      <section className="cta">
        <h2>Ready to transform your career?</h2>
        <p>Join to uplift your professional career with CareerAI.</p>
        <Link to="/get-started" className="btn btn-dark btn-lg">Get Started Free</Link>
      </section>

      <footer className="landing-footer">
        <img src={logo} alt="careerAI" className="footer-logo-img" />
        <span>© 2026 AI Job Recommendation Platform</span>
      </footer>
    </div>
  );
}
