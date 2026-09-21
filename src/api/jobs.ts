import { apiRequest } from './client';
import type {
  ApplyDocumentEditRequest,
  DocumentEditSuggestionOut,
  GenerateDocumentRequest,
  GeneratedDocumentOut,
  JobDetailOut,
  JobListItemOut,
  JobStatusActionOut,
  SuggestDocumentEditRequest,
} from '../types/api';

export interface ListJobsParams {
  status?: string;
  q?: string;
  postedWithinDays?: number;
}

export function listJobs(params: ListJobsParams = {}): Promise<JobListItemOut[]> {
  const search = new URLSearchParams();
  if (params.status) search.set('status', params.status);
  if (params.q) search.set('q', params.q);
  if (params.postedWithinDays) search.set('posted_within_days', String(params.postedWithinDays));
  const query = search.toString();
  return apiRequest<JobListItemOut[]>(`/jobs${query ? `?${query}` : ''}`);
}

export function getJob(jobId: number): Promise<JobDetailOut> {
  return apiRequest<JobDetailOut>(`/jobs/${jobId}`);
}

export function rejectJob(jobId: number): Promise<JobStatusActionOut> {
  return apiRequest<JobStatusActionOut>(`/jobs/${jobId}/reject`, { method: 'POST' });
}

export function restoreJob(jobId: number): Promise<JobStatusActionOut> {
  return apiRequest<JobStatusActionOut>(`/jobs/${jobId}/restore`, { method: 'POST' });
}

export function listDocuments(jobId: number): Promise<GeneratedDocumentOut[]> {
  return apiRequest<GeneratedDocumentOut[]>(`/jobs/${jobId}/documents`);
}

// Real Claude call — takes several seconds.
export function analyzeJob(jobId: number): Promise<JobDetailOut> {
  return apiRequest<JobDetailOut>(`/jobs/${jobId}/analyze`, { method: 'POST' });
}

// Several real Claude calls — can take 20s+. Also get-or-creates the
// job's Application row (see CONTRACT.md), so this is what first makes
// the approve/reject/open/mark-applied bar meaningful for a job.
export function generateDocument(jobId: number, request: GenerateDocumentRequest): Promise<GeneratedDocumentOut> {
  return apiRequest<GeneratedDocumentOut>(`/jobs/${jobId}/documents`, { method: 'POST', body: request });
}

// Read-only — one Claude call, no database write. Send the returned
// proposed_sections/proposed_content back to applyDocumentEdit()
// verbatim to actually save it.
export function suggestDocumentEdit(
  jobId: number,
  documentId: number,
  request: SuggestDocumentEditRequest,
): Promise<DocumentEditSuggestionOut> {
  return apiRequest<DocumentEditSuggestionOut>(`/jobs/${jobId}/documents/${documentId}/suggest-edit`, {
    method: 'POST',
    body: request,
  });
}

// No Claude call — persists exactly what was previewed as a new document version.
export function applyDocumentEdit(
  jobId: number,
  documentId: number,
  request: ApplyDocumentEditRequest,
): Promise<GeneratedDocumentOut> {
  return apiRequest<GeneratedDocumentOut>(`/jobs/${jobId}/documents/${documentId}/apply-edit`, {
    method: 'POST',
    body: request,
  });
}
