// src/pages/AuthPage.js
import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Lock, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import logo from '../assets/careerai-logo.png';
import './AuthPage.css';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.9v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.17.28-1.7V4.97H.9A9 9 0 0 0 0 9c0 1.45.35 2.83.9 4.03l3.05-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .9 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"/>
    </svg>
  );
}

function BrandHeader() {
  return (
    <div className="auth-brand">
      <span className="brand-chip">
        <img src={logo} alt="careerAI" className="auth-brand-img" />
      </span>
    </div>
  );
}

export function LoginPage() {
  const { login, logout, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const isCompanyRole = roleParam === 'company' || roleParam === 'hire';
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      const data = await login(form.email, form.password);
      const isCompanyAccount = data.user?.role === 'company';

      if (isCompanyRole && !isCompanyAccount) {
        // Someone with a developer/candidate account tried the business login.
        logout();
        setError('This account is registered as a developer account. Please use developer login instead.');
        return;
      }
      if (!isCompanyRole && isCompanyAccount) {
        // Someone with a business account tried the developer login.
        logout();
        setError('This account is registered as a business account. Please use business login instead.');
        return;
      }

      navigate(isCompanyAccount ? '/business/dashboard' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally { setLoading(false); }
  };

  const googleBtnRef = useRef(null);
  useEffect(() => {
  if (!googleBtnRef.current) return;

  let cancelled = false;
  const trySetup = () => {
    if (cancelled) return;
    if (!window.google) {
      setTimeout(trySetup, 100); // script still loading, check again shortly
      return;
    }
    window.google.accounts.id.initialize({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const data = await loginWithGoogle(response.credential);
          const isCompanyAccount = data.user?.role === 'company';
          navigate(isCompanyAccount ? '/business/dashboard' : '/dashboard');
        } catch {
          setError('Google sign-in failed. Please try again.');
        }
      },
    });
    window.google.accounts.id.renderButton(googleBtnRef.current, {
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'left',
    width: googleBtnRef.current.offsetWidth,
  });
  };
  trySetup();

  return () => { cancelled = true; };
}, []);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <BrandHeader />
        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">{isCompanyRole ? 'Sign in to your hiring dashboard' : 'Sign in to continue to your account'}</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="login-email">Email Address</label>
            <div className="input-with-icon">
              <Mail size={17} className="input-icon" aria-hidden="true" />
              <input id="login-email" name="email" autoComplete="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="login-password">Password</label>
            <div className="input-with-icon">
              <Lock size={17} className="input-icon" aria-hidden="true" />
              <input id="login-password" name="password" autoComplete="current-password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="••••••••" required />
              <button type="button" className="input-icon-toggle" onClick={() => setShowPassword(s => !s)} tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          <button type="submit" className="btn btn-viking auth-submit-btn" disabled={loading}>
            {loading ? <><div className="spinner"></div> Signing in...</> : 'Login'}
          </button>
        </form>

        {!isCompanyRole && (
          <>
            <div className="auth-divider"><span>or</span></div>
            <div className="google-btn-wrapper">
              <div ref={googleBtnRef}></div>
            </div>
          </>
        )}

        {!isCompanyRole && (
          <p className="auth-switch">
            Don't have an account? <Link to="/register">Sign up.</Link>
          </p>
        )}
        {isCompanyRole && (
          <p className="auth-switch">
            Don't have an account?{' '}
            <Link to="/get-started">Sign up</Link>
          </p>
        )}
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { register, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleParam = searchParams.get('role');
  const isCompanyRole = roleParam === 'company' || roleParam === 'hire';
  const [form, setForm] = useState({ name: '', companyName: '', email: '', password: '', confirm: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    if (form.password !== form.confirm) return setError('Passwords do not match');
    if (isCompanyRole && !form.companyName.trim()) return setError('Please enter your company name');
    setLoading(true);
    try {
      await register(form.name, form.email, form.password, {
        role: isCompanyRole ? 'company' : 'candidate',
        companyName: isCompanyRole ? form.companyName : undefined,
      });
      navigate(isCompanyRole ? '/business/dashboard' : '/profile');
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed');
    } finally { setLoading(false); }
  };

  const googleBtnRef = useRef(null);
  useEffect(() => {
  if (!googleBtnRef.current) return;

  let cancelled = false;
  const trySetup = () => {
    if (cancelled) return;
    if (!window.google) {
      setTimeout(trySetup, 100);
      return;
    }
    window.google.accounts.id.initialize({
      client_id: process.env.REACT_APP_GOOGLE_CLIENT_ID,
      callback: async (response) => {
        try {
          const data = await loginWithGoogle(response.credential);
          navigate(isCompanyRole ? '/business/dashboard' : '/profile');
        } catch {
          setError('Google sign-up failed. Please try again.');
        }
      },
    });
    window.google.accounts.id.renderButton(googleBtnRef.current, {
  theme: 'outline',
  size: 'large',
  shape: 'pill',
  text: 'continue_with',
  logo_alignment: 'left',
  width: googleBtnRef.current.offsetWidth,
});
  };
  trySetup();

  return () => { cancelled = true; };
}, []);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <BrandHeader />
        <h1 className="auth-title">{isCompanyRole ? 'Create your business account' : 'Create account'}</h1>
        <p className="auth-subtitle">{isCompanyRole ? 'Set up your company to start hiring' : 'Start your career journey today'}</p>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="register-name">Full Name</label>
            <div className="input-with-icon">
              <UserIcon size={17} className="input-icon" aria-hidden="true" />
              <input id="register-name" name="name" autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="John Doe" required />
            </div>
          </div>

          {isCompanyRole && (
            <div className="form-group">
              <label className="form-label" htmlFor="register-company">Company Name</label>
              <div className="input-with-icon">
                <UserIcon size={17} className="input-icon" aria-hidden="true" />
                <input id="register-company" name="companyName" autoComplete="organization" value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} placeholder="Acme Inc." required />
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="register-email">Email Address</label>
            <div className="input-with-icon">
              <Mail size={17} className="input-icon" aria-hidden="true" />
              <input id="register-email" name="email" autoComplete="email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="register-password">Password</label>
            <div className="input-with-icon">
              <Lock size={17} className="input-icon" aria-hidden="true" />
              <input id="register-password" name="password" autoComplete="new-password" type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" required minLength={6} />
              <button type="button" className="input-icon-toggle" onClick={() => setShowPassword(s => !s)} tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="register-confirm">Confirm Password</label>
            <div className="input-with-icon">
              <Lock size={17} className="input-icon" aria-hidden="true" />
              <input id="register-confirm" name="confirmPassword" autoComplete="new-password" type={showPassword ? 'text' : 'password'} value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} placeholder="Repeat password" required />
            </div>
          </div>
          <button type="submit" className="btn btn-viking auth-submit-btn" disabled={loading}>
            {loading ? <><div className="spinner"></div> Creating account...</> : 'Create Account'}
          </button>
        </form>

        {!isCompanyRole && (
          <>
            <div className="auth-divider"><span>or</span></div>
            <div className="google-btn-wrapper">
              <div ref={googleBtnRef}></div>
            </div>
          </>
        )}

        <p className="auth-switch">
          Already have an account? <Link to={isCompanyRole ? '/signin?role=company' : '/login'}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
