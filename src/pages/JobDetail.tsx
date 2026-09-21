import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { analyzeJob, generateDocument, getJob, listDocuments } from '../api/jobs';
import { approveApplication, markApplied, openApplication, rejectApplication } from '../api/applications';
import { ApiError } from '../api/client';
import { ApiStatus, type ApiState } from '../components/ApiStatus';
import type { GeneratedDocumentOut, JobDetailOut } from '../types/api';

function checkLabel(passed?: boolean): string {
  if (passed === true) return 'Passed';
  if (passed === false) return 'Failed';
  return 'Not run';
}

export function JobDetail() {
  const { jobId } = useParams<{ jobId: string }>();
  const id = Number(jobId);

  const [job, setJob] = useState<JobDetailOut | null>(null);
  const [documents, setDocuments] = useState<GeneratedDocumentOut[]>([]);
  const [loadState, setLoadState] = useState<ApiState>('idle');
  const [loadError, setLoadError] = useState<string | undefined>();

  const [analyzeState, setAnalyzeState] = useState<ApiState>('idle');
  const [analyzeError, setAnalyzeError] = useState<string | undefined>();

  const [generatingType, setGeneratingType] = useState<'resume' | 'cover_letter' | null>(null);
  const [generateError, setGenerateError] = useState<string | undefined>();

  const [actionState, setActionState] = useState<ApiState>('idle');
  const [actionError, setActionError] = useState<string | undefined>();

  const load = () => {
    setLoadState('loading');
    setLoadError(undefined);
    Promise.all([getJob(id), listDocuments(id)])
      .then(([jobResult, docsResult]) => {
        setJob(jobResult);
        setDocuments(docsResult);
        setLoadState('success');
      })
      .catch((err) => {
        setLoadState('error');
        setLoadError(err instanceof ApiError ? err.message : 'Unknown error');
      });
  };

  useEffect(load, [id]);

  const handleAnalyze = async () => {
    setAnalyzeState('loading');
    setAnalyzeError(undefined);
    try {
      const updated = await analyzeJob(id);
      setJob(updated);
      setAnalyzeState('success');
    } catch (err) {
      setAnalyzeState('error');
      setAnalyzeError(err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const handleGenerate = async (type: 'resume' | 'cover_letter') => {
    setGeneratingType(type);
    setGenerateError(undefined);
    try {
      await generateDocument(id, { type });
      load();
    } catch (err) {
      setGenerateError(err instanceof ApiError ? err.message : 'Unknown error');
    } finally {
      setGeneratingType(null);
    }
  };

  const runApplicationAction = async (action: (applicationId: number) => Promise<unknown>) => {
    if (!job?.application) return;
    setActionState('loading');
    setActionError(undefined);
    try {
      await action(job.application.application_id);
      load();
      setActionState('success');
    } catch (err) {
      setActionState('error');
      setActionError(err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const handleMarkApplied = () => {
    // CLAUDE.md rule 5: never mark APPLIED without an explicit human
    // confirmation distinct from the click that got here — this dialog
    // is that confirmation, not a redundant "are you sure".
    if (!window.confirm('Only confirm this after you have actually submitted this application yourself.')) {
      return;
    }
    runApplicationAction(markApplied);
  };

  if (loadState === 'loading' || loadState === 'idle') {
    return <ApiStatus state={loadState} error={loadError} />;
  }
  if (loadState === 'error' || !job) {
    return <ApiStatus state="error" error={loadError ?? 'Job not found'} />;
  }

  return (
    <div>
      <h1>
        {job.title} — {job.company}
      </h1>
      <p className="page-hint">
        {job.location} · <span className="status-badge">{job.status}</span> ·{' '}
        <a href={job.url} target="_blank" rel="noreferrer">
          View original posting
        </a>
      </p>

      <h2>Full description</h2>
      <div className="result-description">{job.description}</div>

      <h2>Fit analysis</h2>
      {job.fit_score != null ? (
        <div>
          <p>
            Fit score: <strong>{job.fit_score}</strong> ({job.confidence} confidence)
          </p>
          {job.strong_matches.length > 0 && (
            <p>Strong matches: {job.strong_matches.join(', ')}</p>
          )}
          {job.missing_skills.length > 0 && <p>Missing: {job.missing_skills.join(', ')}</p>}
          {job.risks.length > 0 && <p>Risks: {job.risks.join(', ')}</p>}
        </div>
      ) : (
        <p className="empty-state">Not analyzed yet.</p>
      )}
      <div className="toolbar">
        <button type="button" disabled={analyzeState === 'loading'} onClick={handleAnalyze}>
          {analyzeState === 'loading' ? 'Analyzing…' : job.fit_score != null ? 'Re-analyze' : 'Analyze'}
        </button>
      </div>
      <ApiStatus state={analyzeState} error={analyzeError} />

      <h2>Documents</h2>
      {documents.length === 0 && <p className="empty-state">No documents generated yet.</p>}
      {documents.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Version</th>
              <th>Claim check</th>
              <th>ATS check</th>
              <th>File</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.type}</td>
                <td>{doc.version}</td>
                <td>{checkLabel(doc.claim_check_passed)}</td>
                <td>{checkLabel(doc.ats_check_passed)}</td>
                <td>{doc.file_path}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="toolbar">
        <button type="button" disabled={generatingType !== null} onClick={() => handleGenerate('resume')}>
          {generatingType === 'resume' ? 'Generating…' : 'Generate Resume'}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={generatingType !== null}
          onClick={() => handleGenerate('cover_letter')}
        >
          {generatingType === 'cover_letter' ? 'Generating…' : 'Generate Cover Letter'}
        </button>
      </div>
      {generateError && <ApiStatus state="error" error={generateError} />}

      <h2>Application</h2>
      {!job.application ? (
        <p className="empty-state">
          No application started yet — generate a document above to start one.
        </p>
      ) : (
        <>
          <p>
            Status: <span className="status-badge">{job.application.status}</span>
          </p>
          <div className="toolbar">
            <button type="button" disabled={actionState === 'loading'} onClick={() => runApplicationAction(approveApplication)}>
              Approve
            </button>
            <button
              type="button"
              className="secondary"
              disabled={actionState === 'loading'}
              onClick={() => runApplicationAction(rejectApplication)}
            >
              Reject
            </button>
            <button type="button" disabled={actionState === 'loading'} onClick={() => runApplicationAction(openApplication)}>
              Open posting
            </button>
            <button type="button" disabled={actionState === 'loading'} onClick={handleMarkApplied}>
              Mark applied
            </button>
          </div>
          <ApiStatus state={actionState} error={actionError} />
        </>
      )}
    </div>
  );
}
