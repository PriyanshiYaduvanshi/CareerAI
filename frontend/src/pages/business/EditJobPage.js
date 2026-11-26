// src/pages/business/EditJobPage.js
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import JobForm from '../../components/business/JobForm';
import { businessJobsAPI } from '../../utils/api';
import '../../components/business/business.css';

const toDateInputValue = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
};

export default function EditJobPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [initialValues, setInitialValues] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await businessJobsAPI.getOne(id);
        if (!mounted) return;
        const job = res.data.job;
        setInitialValues({
          title: job.title || '',
          company: job.company || '',
          location: job.location || '',
          employmentType: job.employmentType || 'full-time',
          workMode: job.workMode || 'onsite',
          experience: job.experience || 'mid',
          salaryMin: job.salaryMin || '',
          salaryMax: job.salaryMax || '',
          currency: job.currency || 'INR',
          vacancies: job.vacancies || 1,
          deadline: toDateInputValue(job.deadline),
          requiredSkills: job.requiredSkills || [],
          responsibilities: job.responsibilities || [],
          qualifications: job.qualifications || [],
          benefits: job.benefits || [],
          description: job.description || '',
          companyLogo: job.companyLogo || '',
        });
      } catch (err) {
        if (mounted) setNotFound(true);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const handleSubmit = async (form) => {
    setSubmitting(true);
    setServerErrors([]);
    try {
      await businessJobsAPI.update(id, {
        ...form,
        salaryMin: form.salaryMin === '' ? 0 : Number(form.salaryMin),
        salaryMax: form.salaryMax === '' ? 0 : Number(form.salaryMax),
        vacancies: Number(form.vacancies) || 1,
      });
      navigate('/business/jobs');
    } catch (err) {
      const errors = err.response?.data?.errors;
      if (errors?.length) setServerErrors(errors);
      else setServerErrors([{ msg: err.response?.data?.message || 'Failed to update job post.' }]);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 60 }}><div className="spinner spinner-blue" style={{ margin: '0 auto' }}></div></div>;
  }

  if (notFound) {
    return (
      <div className="card biz-placeholder">
        <h3>Job not found</h3>
        <p>This job post doesn't exist or you don't have access to it.</p>
        <Link to="/business/jobs" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Manage Jobs</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="biz-page-header">
        <div>
          <Link to="/business/jobs" className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }}>
            <ArrowLeft size={14} /> Back to Manage Jobs
          </Link>
          <h2>Edit Job Post</h2>
          <p>Update the details of this job posting.</p>
        </div>
      </div>

      <div className="card">
        <JobForm
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={() => navigate('/business/jobs')}
          submitting={submitting}
          serverErrors={serverErrors}
          submitLabel="Save Changes"
        />
      </div>
    </div>
  );
}
