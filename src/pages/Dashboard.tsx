import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listJobs, rejectJob, restoreJob } from '../api/jobs';
import { ApiError } from '../api/client';
import { ApiStatus, type ApiState } from '../components/ApiStatus';
import type { JobListItemOut } from '../types/api';

// Same approximate-date convention as Explore.tsx's formatPostedAt —
// CONTRACT.md: JobListItemOut.posted_at falls back to collected_at when
// the source never gave a real posting date, so this is "posted, or if
// unknown, added to this app" — not always the employer's own date.
function formatPostedAt(value?: string): string | null {
  if (!value) return null;
  const posted = new Date(value);
  if (Number.isNaN(posted.getTime())) return null;
  const days = Math.floor((Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export function Dashboard() {
  const [jobs, setJobs] = useState<JobListItemOut[]>([]);
  const [state, setState] = useState<ApiState>('idle');
  const [error, setError] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState('');
  const [q, setQ] = useState('');
  const [postedWithinDays, setPostedWithinDays] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkState, setBulkState] = useState<ApiState>('idle');
  const [bulkError, setBulkError] = useState<string | undefined>();
  const [bulkMessage, setBulkMessage] = useState<string | undefined>();

  const fetchJobs = () => {
    let cancelled = false;
    setState('loading');
    setError(undefined);
    listJobs({
      status: statusFilter || undefined,
      q: q || undefined,
      postedWithinDays: postedWithinDays ? Number(postedWithinDays) : undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setJobs(result);
        setSelected(new Set());
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
  };

  useEffect(fetchJobs, [statusFilter, q, postedWithinDays]);

  const toggleSelected = (jobId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => (prev.size === jobs.length ? new Set() : new Set(jobs.map((j) => j.job_id))));
  };

  const handleOpenSelected = () => {
    // Deliberately client-side, not a call to POST /applications/{id}/open
    // — that route opens a tab on the API's host, not the caller's
    // (CONTRACT.md), and there's no Application row for these jobs to
    // call it on anyway. This never marks anything as applied — you still
    // have to actually submit each one yourself and confirm it later.
    for (const job of jobs) {
      if (selected.has(job.job_id)) window.open(job.url, '_blank', 'noreferrer');
    }
  };

  const runBulkStatusAction = async (action: (jobId: number) => Promise<unknown>, verb: string) => {
    setBulkState('loading');
    setBulkError(undefined);
    setBulkMessage(undefined);
    const ids = Array.from(selected);
    const outcomes = await Promise.allSettled(ids.map((id) => action(id)));
    const failed = outcomes.filter((o) => o.status === 'rejected').length;
    if (failed > 0) {
      setBulkState('error');
      setBulkError(`${failed} of ${ids.length} failed to ${verb}.`);
    } else {
      setBulkState('success');
      setBulkMessage(`${ids.length} job${ids.length === 1 ? '' : 's'} ${verb}ed.`);
    }
    fetchJobs();
  };

  return (
    <div>
      <h1>Dashboard</h1>
      <p className="page-hint">
        Jobs from <code>GET /jobs</code>.
      </p>

      <div className="toolbar">
        <label>
          Status
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="DISCOVERED">DISCOVERED</option>
            <option value="READY_FOR_REVIEW">READY_FOR_REVIEW</option>
            <option value="REVIEW_REQUIRED">REVIEW_REQUIRED</option>
            {/* REJECT (POST /jobs/{id}/analyze's ineligible/hard-filtered outcome)
                and REJECTED (POST /jobs/{id}/reject's manual hide) are both
                real Job.status values but distinct mechanisms — see
                CONTRACT.md. "APPROVED" was removed: it's an
                Application.status value, never a Job.status one. */}
            <option value="REJECT">REJECT (auto)</option>
            <option value="REJECTED">REJECTED (manual)</option>
          </select>
        </label>
        <label>
          Description contains
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="python" />
        </label>
        <label>
          Posted within
          <select value={postedWithinDays} onChange={(e) => setPostedWithinDays(e.target.value)}>
            <option value="">Any time</option>
            <option value="1">Last 1 day</option>
            <option value="3">Last 3 days</option>
            <option value="7">Last 7 days</option>
          </select>
        </label>
      </div>

      <ApiStatus state={state} error={error} />

      {state === 'success' && jobs.length === 0 && (
        <p className="empty-state">
          No jobs match these filters — nothing ingested yet, or nothing fits the current status /
          keyword / date filter.
        </p>
      )}

      {jobs.length > 0 && (
        <>
          <div className="toolbar">
            <span>{selected.size} selected</span>
            <button type="button" disabled={selected.size === 0} onClick={handleOpenSelected}>
              Open selected
            </button>
            <button
              type="button"
              disabled={selected.size === 0 || bulkState === 'loading'}
              onClick={() => runBulkStatusAction(rejectJob, 'reject')}
            >
              Reject selected
            </button>
            <button
              type="button"
              className="secondary"
              disabled={selected.size === 0 || bulkState === 'loading'}
              onClick={() => runBulkStatusAction(restoreJob, 'restore')}
            >
              Restore selected
            </button>
          </div>
          <ApiStatus state={bulkState} error={bulkError} />
          {bulkState === 'success' && bulkMessage && <p className="empty-state">{bulkMessage}</p>}

          <table className="data-table">
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={selected.size === jobs.length && jobs.length > 0}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th>Company</th>
                <th>Title</th>
                <th>Location</th>
                <th>Status</th>
                <th>Posted</th>
                <th>Fit score</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.job_id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(job.job_id)}
                      onChange={() => toggleSelected(job.job_id)}
                    />
                  </td>
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
                  <td>{formatPostedAt(job.posted_at) ?? '—'}</td>
                  <td>{job.fit_score ?? '—'}</td>
                  <td>
                    <Link to={`/jobs/${job.job_id}`}>Details</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
