import { apiRequest } from './client';
import type { JobDetailOut, JobListItemOut, JobStatusActionOut } from '../types/api';

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
