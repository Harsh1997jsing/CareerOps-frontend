import { apiRequest } from './client';
import type { CompanyTargetOut, ExploreResultOut } from '../types/api';

export function listTargets(): Promise<CompanyTargetOut[]> {
  return apiRequest<CompanyTargetOut[]>('/targets');
}

// Fetch-only — does not save anything. Save a chosen result via
// saveResult() in api/explore.ts (the shared "Add to Dashboard" route).
export function searchTargets(): Promise<ExploreResultOut[]> {
  return apiRequest<ExploreResultOut[]>('/targets/search', { method: 'POST' });
}
