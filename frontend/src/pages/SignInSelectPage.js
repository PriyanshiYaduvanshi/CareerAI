// src/pages/SignInSelectPage.js
import { Link, useNavigate } from 'react-router-dom';
import logo from '../assets/careerai-logo.png';
import './SignInSelectPage.css';

export default function SignInSelectPage() {
  const navigate = useNavigate();

  return (
    <div className="signin-select-page">
      <nav className="ss-nav">
        <div className="ss-nav-left">
          <Link to="/" className="ss-logo">
            <img src={logo} alt="careerAI" className="ss-logo-img" />
          </Link>
        </div>
        <div className="ss-nav-right">
          <Link to="/get-started" className="btn btn-viking ss-black-btn">Create a free account</Link>
        </div>
      </nav>

      <div className="ss-body">
        <div className="ss-col">
          <h1 className="ss-heading">For <em>Companies</em></h1>
          <p className="ss-desc">Thousands of companies have embraced the new way to hire and upskill developers across roles and throughout their careers.</p>
          <button className="btn btn-viking ss-black-btn ss-login-btn" onClick={() => navigate('/signin?role=company')}>Login</button>
          <p className="ss-switch">
            Don't have an account?<br />
            <Link to="/get-started">Create One</Link>
          </p>
        </div>

        <div className="ss-divider" />

        <div className="ss-col">
          <h1 className="ss-heading">For <em>Developers</em></h1>
          <p className="ss-desc">Want to switch career! Start your jorney with us. Upskill yourself, prepare for interviews, and get hired to your dream job.</p>
          <button className="btn btn-viking ss-black-btn ss-login-btn" onClick={() => navigate('/signin?role=developer')}>Login</button>
          <p className="ss-switch">
            Don't have an account?<br />
            <Link to="/register">Sign up.</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
