import { apiRequest } from './client';
import type { ExploreResultOut, ScrapeJobspyRequest } from '../types/api';

// Fetch-only — does not save anything. Save a chosen result via
// saveResult() in api/explore.ts (the shared "Add to Dashboard" route).
export function scrapeJobspy(request: ScrapeJobspyRequest): Promise<ExploreResultOut[]> {
  return apiRequest<ExploreResultOut[]>('/scrape/jobspy', { method: 'POST', body: request });
}
