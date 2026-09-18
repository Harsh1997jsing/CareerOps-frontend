import { apiRequest } from './client';
import type {
  CapabilityMatrixOut,
  ExploreResultOut,
  ExploreSaveRequest,
  ExploreSaveResponseOut,
  ExploreSearchRequest,
} from '../types/api';

export function getCapabilities(): Promise<Record<string, CapabilityMatrixOut>> {
  return apiRequest<Record<string, CapabilityMatrixOut>>('/explore/capabilities');
}

export function search(request: ExploreSearchRequest): Promise<ExploreResultOut[]> {
  return apiRequest<ExploreResultOut[]>('/explore/search', { method: 'POST', body: request });
}

export function saveResult(result: ExploreSaveRequest): Promise<ExploreSaveResponseOut> {
  return apiRequest<ExploreSaveResponseOut>('/explore/save', { method: 'POST', body: result });
}
