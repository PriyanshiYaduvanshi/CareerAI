// src/App.js - Main app with routing
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/common/Layout';
import BusinessLayout from './components/business/BusinessLayout';
import Chatbot from './components/common/Chatbot';

// Pages
import LandingPage from './pages/LandingPage';
import RoleSelectionPage from './pages/RoleSelectionPage';
import SignInSelectPage from './pages/SignInSelectPage';
import { LoginPage, RegisterPage } from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import JobsPage from './pages/JobsPage';
import JobDetailPage from './pages/JobDetailPage';
import ProfilePage from './pages/ProfilePage';
import SkillGapPage from './pages/SkillGapPage';
import ResumePage from './pages/ResumePage';
import InterviewPage from './pages/InterviewPage';
import ApplicationsPage from './pages/ApplicationsPage';
import NotificationsPage from './pages/NotificationsPage';
import { MarketTrendsPage, LearningPage } from './pages/OtherPages';

// Business Dashboard pages
import BusinessDashboard from './pages/business/BusinessDashboard';
import ManageJobsPage from './pages/business/ManageJobsPage';
import CreateJobPage from './pages/business/CreateJobPage';
import EditJobPage from './pages/business/EditJobPage';
import BusinessApplicantsPage from './pages/business/BusinessApplicantsPage';
import CompanyProfilePage from './pages/business/CompanyProfilePage';
import BusinessSettingsPage from './pages/business/BusinessSettingsPage';
import BusinessNotificationsPage from './pages/business/BusinessNotificationsPage';

import './styles/global.css';

const isCompany = (user) => user?.role === 'company';

// Protected route wrapper
// Company accounts are kept out of the candidate area and sent to their own dashboard.
function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><div className="spinner spinner-blue"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (isCompany(user)) return <Navigate to="/business/dashboard" replace />;
  return <Layout>{children}</Layout>;
}

// Protected route wrapper — Business Dashboard (company accounts only).
function BusinessRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}><div className="spinner spinner-blue"></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isCompany(user)) return <Navigate to="/dashboard" replace />;
  return <BusinessLayout>{children}</BusinessLayout>;
}

// Public route (redirect if logged in)
function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return children;
  return <Navigate to={isCompany(user) ? '/business/dashboard' : '/dashboard'} replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicRoute><LandingPage /></PublicRoute>} />
      <Route path="/get-started" element={<PublicRoute><RoleSelectionPage /></PublicRoute>} />
      <Route path="/login" element={<PublicRoute><SignInSelectPage /></PublicRoute>} />
      <Route path="/signin" element={<PublicRoute><LoginPage /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />
      
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/jobs" element={<PrivateRoute><JobsPage /></PrivateRoute>} />
      <Route path="/jobs/:id" element={<PrivateRoute><JobDetailPage /></PrivateRoute>} />
      <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
      <Route path="/skill-gap" element={<PrivateRoute><SkillGapPage /></PrivateRoute>} />
      <Route path="/resume" element={<PrivateRoute><ResumePage /></PrivateRoute>} />
      <Route path="/interview" element={<PrivateRoute><InterviewPage /></PrivateRoute>} />
      <Route path="/learning" element={<PrivateRoute><LearningPage /></PrivateRoute>} />
      <Route path="/market" element={<PrivateRoute><MarketTrendsPage /></PrivateRoute>} />
      <Route path="/applications" element={<PrivateRoute><ApplicationsPage /></PrivateRoute>} />
      <Route path="/notifications" element={<PrivateRoute><NotificationsPage /></PrivateRoute>} />

      {/* Business Dashboard (company accounts only) */}
      <Route path="/business/dashboard" element={<BusinessRoute><BusinessDashboard /></BusinessRoute>} />
      <Route path="/business/jobs" element={<BusinessRoute><ManageJobsPage /></BusinessRoute>} />
      <Route path="/business/jobs/new" element={<BusinessRoute><CreateJobPage /></BusinessRoute>} />
      <Route path="/business/jobs/:id/edit" element={<BusinessRoute><EditJobPage /></BusinessRoute>} />
      <Route path="/business/applicants" element={<BusinessRoute><BusinessApplicantsPage /></BusinessRoute>} />
      <Route path="/business/company-profile" element={<BusinessRoute><CompanyProfilePage /></BusinessRoute>} />
      <Route path="/business/settings" element={<BusinessRoute><BusinessSettingsPage /></BusinessRoute>} />
      <Route path="/business/notifications" element={<BusinessRoute><BusinessNotificationsPage /></BusinessRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        {/* Rendered once here (not inside Layout) so the widget — and its
            session-only conversation — survives navigating between
            dashboard pages instead of resetting on every route change.
            Chatbot itself checks auth/role and renders nothing outside
            the candidate User Dashboard (logged out, or a business
            account). */}
        <Chatbot />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
