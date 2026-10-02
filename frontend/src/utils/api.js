// src/utils/api.js - Axios instance with auth interceptors
import axios from 'axios';

const API = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 errors
API.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authAPI = {
  register: (data) => API.post('/auth/register', data),
  login:    (data) => API.post('/auth/login', data),
  googleLogin: (credential) => API.post('/auth/google', { credential }),
  getMe:    ()     => API.get('/auth/me'),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const usersAPI = {
  getProfile:    ()     => API.get('/users/profile'),
  updateProfile: (data) => API.put('/users/profile', data),
  getDashboard:  ()     => API.get('/users/dashboard'),
};

// ── Jobs ──────────────────────────────────────────────────────────────────────
export const jobsAPI = {
  getAll:       (params) => API.get('/jobs', { params }),
  getRecommended: (params) => API.get('/jobs/recommended', { params }),
  getOne:       (id) => API.get(`/jobs/${id}`),
  toggleSave:   (id) => API.post(`/jobs/${id}/save`),
  seed:         () => API.post('/jobs/seed'),
};

// ── Applications ──────────────────────────────────────────────────────────────
export const applicationsAPI = {
  getAll:    (params) => API.get('/applications', { params }),
  remove:    (id) => API.delete(`/applications/${id}`),
  // Apply Job flow: submit resume + details for a real job posting
  apply:     (jobId, formData) => API.post(`/applications/apply/${jobId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  checkApplied: (jobId) => API.get(`/applications/check/${jobId}`),
};

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiAPI = {
  skillGap:        (data) => API.post('/ai/skill-gap', data),
  marketTrends:    (data) => API.post('/ai/market-trends', data),
  learningRoadmap: (data) => API.post('/ai/learning-roadmap', data),
};

// ── Interview ─────────────────────────────────────────────────────────────────
export const interviewAPI = {
  getAll:   () => API.get('/interview'),
  start:    (data) => API.post('/interview/start', data),
  answer:   (id, data) => API.post(`/interview/${id}/answer`, data),
};

// ── Resume ────────────────────────────────────────────────────────────────────
export const resumeAPI = {
  analyze: (formData) => API.post('/resume/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// ── Notifications ─────────────────────────────────────────────────────────────
export const notificationsAPI = {
  getAll:      (params) => API.get('/notifications', { params }),
  markRead:    (id) => API.patch(`/notifications/${id}/read`),
  markAllRead: () => API.patch('/notifications/read-all'),
  remove:      (id) => API.delete(`/notifications/${id}`),
};

// ── Search ────────────────────────────────────────────────────────────────────
export const searchAPI = {
  query: (q) => API.get('/search', { params: { q } }),
};

// ── Chat (chatbot infrastructure — backed by the Orchestrator Agent) ───────────
export const chatAPI = {
  // `history` is the recent tail of this session's messages (shaped like
  // { role: 'user'|'assistant', text: string }) — sent so the backend's
  // intent classification can resolve follow-up questions ("what about
  // certifications?"). Never persisted server-side; see Chatbot.js.
  //
  // `extra` optionally carries the guided career-onboarding wizard's
  // client-owned state: { careerSession, resetOnboarding, resumeUploaded }
  // (see backend/agents/orchestrator/careerOnboarding.js). Also
  // session-only — never persisted server-side.
  sendMessage: (message, history = [], extra = {}) => API.post('/chat/message', { message, history, ...extra }),
};

// ── Career (Orchestrator's unified career-report workflow) ─────────────────────
export const careerAPI = {
  // Non-streaming: kept for any caller that just wants the final report.
  generateReport: (data) => API.post('/career/report', data),

  // Streaming: same workflow (POST /api/career/report/stream), but reads the
  // response as newline-delimited JSON (NDJSON) so the chatbot can render
  // each step's progress live instead of waiting for the whole report.
  // Plain `fetch` (not the shared `API` axios instance) because streaming
  // the response body via a ReadableStream reader is what Chatbot.js needs
  // here — the Authorization header is attached manually below to match
  // exactly what the axios interceptor above already does for every other
  // call, so auth behaves identically.
  //
  // `onEvent(event)` is called once per NDJSON line, already JSON.parsed.
  // Returns nothing; throws if the request itself fails (network/HTTP
  // error) before any streaming could start.
  streamReport: async ({ targetRole, resumeText, location, duration }, onEvent, { signal } = {}) => {
    const baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('token');

    const response = await fetch(`${baseURL}/career/report/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // Lets the backend's compression middleware skip this response so
        // chunks reach the client immediately instead of being buffered
        // for a better compression ratio (see careerController.js).
        'x-no-compression': 'true',
      },
      body: JSON.stringify({ targetRole, resumeText, location, duration }),
      signal,
    });

    if (!response.ok || !response.body) {
      let message = 'Unable to generate career report.';
      try {
        const body = await response.json();
        message = body?.message || message;
      } catch {
        // non-JSON error body (e.g. a proxy error page) — fall back to the default message
      }
      throw new Error(message);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex;
      // eslint-disable-next-line no-cond-assign
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line) continue;
        try {
          onEvent(JSON.parse(line));
        } catch {
          // A malformed/partial line should never break the rest of the
          // stream — skip it and keep reading.
        }
      }
    }

    const trailing = buffer.trim();
    if (trailing) {
      try {
        onEvent(JSON.parse(trailing));
      } catch {
        // ignore trailing partial line
      }
    }
  },
};

// ── Business Job Posting (business/company accounts only) ─────────────────────
export const businessJobsAPI = {
  getAll:  ()             => API.get('/business/jobs'),
  getOne:  (id)           => API.get(`/business/jobs/${id}`),
  create:  (data)         => API.post('/business/jobs', data),
  update:  (id, data)     => API.put(`/business/jobs/${id}`, data),
  remove:  (id)           => API.delete(`/business/jobs/${id}`),
  close:   (id)           => API.patch(`/business/jobs/${id}/close`),
  reopen:  (id)           => API.patch(`/business/jobs/${id}/reopen`),
};

// ── Business Applicant Management (business/company accounts only) ────────────
export const businessApplicantsAPI = {
  getAll:  (params)        => API.get('/business/applicants', { params }),
  getOne:  (id)             => API.get(`/business/applicants/${id}`),
  // Resumes need the Authorization header, so they're fetched as a blob
  // (not a plain <a href>) and opened/downloaded on the client.
  getResumeBlob: (id, download) => API.get(`/business/applicants/${id}/resume`, {
    params: download ? { download: 'true' } : {},
    responseType: 'blob',
  }),
  // (Re-)runs AI resume analysis on demand — e.g. if it failed at upload time.
  analyzeResume: (id) => API.post(`/business/applicants/${id}/analyze-resume`),
  // Shortlist / Reject / Keep Pending / move to any other stage. Every call
  // is recorded in the applicant's status history on the backend.
  updateStatus: (id, status, note) => API.patch(`/business/applicants/${id}/status`, { status, note }),
  // Status counts (pending/shortlisted/rejected/etc.) for Dashboard stats.
  getStatusCounts: (params) => API.get('/business/applicants/stats/summary', { params }),
  // Email module: send a Shortlisted / Interview Invitation / Rejected /
  // Custom email to an applicant (auto-fills candidate/company/job info),
  // and fetch the email history for one applicant.
  sendEmail:   (id, data) => API.post(`/business/applicants/${id}/send-email`, data),
  getEmailHistory: (id) => API.get(`/business/applicants/${id}/emails`),
};

// ── Business Company Profile (business/company accounts only) ─────────────────
export const businessProfileAPI = {
  get:    ()     => API.get('/business/profile'),
  update: (data) => API.put('/business/profile', data),
};

// ── Business Settings — notification preferences (business/company accounts only) ──
export const businessSettingsAPI = {
  getNotificationPrefs:    ()     => API.get('/business/settings/notifications'),
  updateNotificationPrefs: (data) => API.put('/business/settings/notifications', data),
};

// ── Business Navbar: search + Calendar/Mail dropdowns (business/company accounts only) ──
export const businessSearchAPI = {
  query: (q) => API.get('/business/search', { params: { q } }),
};

export const businessInboxAPI = {
  getUpcomingInterviews: (params) => API.get('/business/inbox/upcoming-interviews', { params }),
  getRecentEmails:       (params) => API.get('/business/inbox/recent-emails', { params }),
};

// ── Business Dashboard Analytics (business/company accounts only) ─────────────
export const businessAnalyticsAPI = {
  // Single call powering every chart on the Business Dashboard: applications
  // over time, applications per job, hiring funnel, status counts, top
  // skills, and recent applicants.
  getDashboard: (params) => API.get('/business/analytics/dashboard', { params }),
};

export default API;
