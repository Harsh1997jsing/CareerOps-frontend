import { apiRequest } from './client';
import type {
  GenerateDocumentRequest,
  GeneratedDocumentOut,
  JobDetailOut,
  JobListItemOut,
  JobStatusActionOut,
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
