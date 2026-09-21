import { apiRequest } from './client';
import type { CompanyTargetOut, ExploreResultOut } from '../types/api';

export function listTargets(): Promise<CompanyTargetOut[]> {
  return apiRequest<CompanyTargetOut[]>('/targets');
}

// Fetch-only — does not save anything. Save a chosen result via
// saveResult() in api/explore.ts (the shared "Add to Dashboard" route).
export function searchTargets(experience?: string): Promise<ExploreResultOut[]> {
  const query = experience ? `?experience=${encodeURIComponent(experience)}` : '';
  return apiRequest<ExploreResultOut[]>(`/targets/search${query}`, { method: 'POST' });
}
