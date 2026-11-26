// src/pages/business/CreateJobPage.js
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JobForm from '../../components/business/JobForm';
import { businessJobsAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import '../../components/business/business.css';

export default function CreateJobPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);

  const handleSubmit = async (form) => {
    setSubmitting(true);
    setServerErrors([]);
    try {
      await businessJobsAPI.create({
        ...form,
        salaryMin: form.salaryMin === '' ? 0 : Number(form.salaryMin),
        salaryMax: form.salaryMax === '' ? 0 : Number(form.salaryMax),
        vacancies: Number(form.vacancies) || 1,
      });
      navigate('/business/jobs');
    } catch (err) {
      const errors = err.response?.data?.errors;
      if (errors?.length) setServerErrors(errors);
      else setServerErrors([{ msg: err.response?.data?.message || 'Failed to create job post.' }]);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="biz-page-header">
        <div>
          <h2>Create Job Post</h2>
          <p>Fill in the details below to publish a new job opening.</p>
        </div>
      </div>

      <div className="card">
        <JobForm
          initialValues={{ company: user?.companyName || user?.name || '' }}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/business/jobs')}
          submitting={submitting}
          serverErrors={serverErrors}
          submitLabel="Publish Job Post"
        />
      </div>
    </div>
  );
}
