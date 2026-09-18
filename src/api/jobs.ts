import { apiRequest } from './client';
import type { JobDetailOut, JobListItemOut } from '../types/api';

export function listJobs(status?: string): Promise<JobListItemOut[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<JobListItemOut[]>(`/jobs${query}`);
}

export function getJob(jobId: number): Promise<JobDetailOut> {
  return apiRequest<JobDetailOut>(`/jobs/${jobId}`);
}
