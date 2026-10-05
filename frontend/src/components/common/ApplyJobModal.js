// src/components/common/ApplyJobModal.js
// Apply Job modal: collects resume + application details, validates them,
// uploads the resume securely, and stores the application in the database.
import { useRef, useState } from 'react';
import {
  X, UploadCloud, FileText, Phone, Linkedin, Link2, MessageSquare,
  CheckCircle2, Loader2, AlertCircle, Building2,
} from 'lucide-react';
import { applicationsAPI } from '../../utils/api';
import { isValidIndianPhone, PHONE_ERROR_MESSAGE, isValidLinkedInUrl, LINKEDIN_ERROR_MESSAGE } from '../../utils/validators';
import { isPastDeadline } from '../../utils/deadline';
import './ApplyJobModal.css';

const MAX_RESUME_SIZE = 5 * 1024 * 1024; // 5MB
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+/i;

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export default function ApplyJobModal({ job, onClose, onApplied }) {
  const fileInputRef = useRef(null);
  const [resumeFile, setResumeFile] = useState(null);
  const [phone, setPhone] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [portfolio, setPortfolio] = useState('');

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const expired = isPastDeadline(job.deadline);

  const validate = () => {
    const errs = {};
    if (!resumeFile) errs.resume = 'Please upload your resume as a PDF';
    if (!phone.trim()) errs.phone = 'Phone number is required';
    else if (!isValidIndianPhone(phone.trim())) errs.phone = PHONE_ERROR_MESSAGE;
    if (!linkedin.trim()) errs.linkedin = 'LinkedIn profile URL is required';
    else if (!isValidLinkedInUrl(linkedin.trim())) errs.linkedin = LINKEDIN_ERROR_MESSAGE;
    if (portfolio.trim() && !URL_RE.test(portfolio.trim())) errs.portfolio = 'Enter a valid URL (e.g. https://...)';
    if (coverLetter.length > 5000) errs.coverLetter = 'Keep it under 5000 characters';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const pickFile = (file) => {
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setErrors(e => ({ ...e, resume: 'Only PDF files are accepted' }));
      return;
    }
    if (file.size > MAX_RESUME_SIZE) {
      setErrors(e => ({ ...e, resume: 'File is too large — max size is 5MB' }));
      return;
    }
    setErrors(e => ({ ...e, resume: undefined }));
    setResumeFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (expired) { setFormError('The application deadline for this job has passed.'); return; }
    if (!validate()) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      formData.append('phone', phone.trim());
      formData.append('coverLetter', coverLetter.trim());
      formData.append('linkedin', linkedin.trim());
      formData.append('portfolio', portfolio.trim());

      const res = await applicationsAPI.apply(job._id, formData);
      setSuccess(true);
      onApplied?.(job._id, res.data.application);
    } catch (err) {
      const data = err.response?.data;
      if (data?.alreadyApplied) {
        setFormError('You have already applied to this job.');
        onApplied?.(job._id, null); // keep UI in sync (mark as applied)
      } else if (data?.errors?.length) {
        setFormError(data.errors[0]);
      } else {
        setFormError(data?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={submitting ? undefined : onClose}>
      <div className={`modal-content card apply-job-modal${success ? ' apply-job-modal-success' : ''}`} onClick={e => e.stopPropagation()}>
        {success ? (
          <div className="apply-success">
            <div className="apply-success-icon"><CheckCircle2 size={26} /></div>
            <h3>Application submitted!</h3>
            <p>
              Your application for <strong>{job.title}</strong> at <strong>{job.company}</strong> has been sent.
              You can track its status from the Applications page.
            </p>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className="apply-modal-header">
              <div>
                <h3>Apply to {job.title}</h3>
                <div className="apply-modal-subtitle"><Building2 size={13} /> {job.company}</div>
              </div>
              <button className="apply-modal-close" onClick={onClose} disabled={submitting} aria-label="Close">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="apply-modal-form">
              {expired && (
                <div className="apply-form-banner">
                  <AlertCircle size={15} /> The application deadline for this job has passed.
                </div>
              )}
              {formError && (
                <div className="apply-form-banner">
                  <AlertCircle size={15} /> {formError}
                </div>
              )}

              {/* Resume upload */}
              <div className="form-group">
                <label className="form-label">Resume (PDF) *</label>
                <div
                  className={`resume-dropzone ${dragActive ? 'active' : ''} ${errors.resume ? 'has-error' : ''}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    hidden
                    onChange={e => pickFile(e.target.files?.[0])}
                  />
                  {resumeFile ? (
                    <div className="resume-file-chip">
                      <FileText size={18} />
                      <div className="resume-file-info">
                        <div className="resume-file-name">{resumeFile.name}</div>
                        <div className="resume-file-size">{formatSize(resumeFile.size)}</div>
                      </div>
                      <button
                        type="button"
                        className="resume-file-remove"
                        onClick={e => { e.stopPropagation(); setResumeFile(null); }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="resume-dropzone-empty">
                      <UploadCloud size={22} />
                      <span>Click to upload or drag &amp; drop your resume</span>
                      <span className="resume-dropzone-hint">PDF only, max 5MB</span>
                    </div>
                  )}
                </div>
                {errors.resume && <div className="form-error">{errors.resume}</div>}
              </div>

              {/* Phone */}
              <div className="form-group">
                <label className="form-label"><Phone size={13} /> Phone Number *</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="98765 43210"
                />
                {errors.phone && <div className="form-error">{errors.phone}</div>}
              </div>

              {/* Cover letter */}
              <div className="form-group">
                <label className="form-label"><MessageSquare size={13} /> Cover Letter (optional)</label>
                <textarea
                  rows={3}
                  value={coverLetter}
                  onChange={e => setCoverLetter(e.target.value)}
                  placeholder="Tell the hiring team why you're a great fit..."
                />
                <div className="form-hint">{coverLetter.length}/5000</div>
                {errors.coverLetter && <div className="form-error">{errors.coverLetter}</div>}
              </div>

              {/* LinkedIn */}
              <div className="form-group">
                <label className="form-label"><Linkedin size={13} /> LinkedIn *</label>
                <input
                  type="url"
                  value={linkedin}
                  onChange={e => setLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/yourname"
                />
                {errors.linkedin && <div className="form-error">{errors.linkedin}</div>}
              </div>

              {/* Portfolio */}
              <div className="form-group">
                <label className="form-label"><Link2 size={13} /> Portfolio</label>
                <input
                  type="url"
                  value={portfolio}
                  onChange={e => setPortfolio(e.target.value)}
                  placeholder="https://yourportfolio.com"
                />
                {errors.portfolio && <div className="form-error">{errors.portfolio}</div>}
              </div>

              <div className="apply-modal-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={submitting || expired}>
                  {submitting ? <><Loader2 size={15} className="spin" /> Submitting...</> : 'Submit Application'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
