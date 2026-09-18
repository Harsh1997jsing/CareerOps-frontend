import { useEffect, useState } from 'react';
import { listJobs } from '../api/jobs';
import { ApiError } from '../api/client';
import { ApiStatus, type ApiState } from '../components/ApiStatus';
import type { JobListItemOut } from '../types/api';

export function Dashboard() {
  const [jobs, setJobs] = useState<JobListItemOut[]>([]);
  const [state, setState] = useState<ApiState>('idle');
  const [error, setError] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError(undefined);
    listJobs(statusFilter || undefined)
      .then((result) => {
        if (cancelled) return;
        setJobs(result);
        setState('success');
      })
      .catch((err) => {
        if (cancelled) return;
        setState('error');
        setError(err instanceof ApiError ? err.message : 'Unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="page-hint">
        Jobs at REVIEW_REQUIRED / READY_FOR_REVIEW, from <code>GET /jobs</code>.
      </p>

      <div className="toolbar">
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="READY_FOR_REVIEW">READY_FOR_REVIEW</option>
            <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
            <option value="REJECTED">REJECTED</option>
            <option value="APPROVED">APPROVED</option>
          </select>
        </label>
      </div>

      <ApiStatus state={state} error={error} />

      {state === 'success' && jobs.length === 0 && (
        <p className="empty-state">
          No jobs yet — nothing has been ingested into this database. Once the backend's ingestion
          sources (targets / job scraping) have run, jobs will show up here.
        </p>
      )}

      {jobs.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Title</th>
              <th>Location</th>
              <th>Status</th>
              <th>Fit score</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.job_id}>
                <td>{job.company}</td>
                <td>
                  <a href={job.url} target="_blank" rel="noreferrer">
                    {job.title}
                  </a>
                </td>
                <td>{job.location}</td>
                <td>
                  <span className="status-badge">{job.status}</span>
                </td>
                <td>{job.fit_score ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
