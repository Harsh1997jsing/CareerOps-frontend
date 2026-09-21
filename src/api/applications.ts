import { apiRequest } from './client';
import type { ApplicationActionOut } from '../types/api';

export function approveApplication(applicationId: number): Promise<ApplicationActionOut> {
  return apiRequest<ApplicationActionOut>(`/applications/${applicationId}/approve`, { method: 'POST' });
}

export function rejectApplication(applicationId: number): Promise<ApplicationActionOut> {
  return apiRequest<ApplicationActionOut>(`/applications/${applicationId}/reject`, { method: 'POST' });
}

// Opens the posting URL server-side (webbrowser.open) — only meaningful
// when the frontend and API run on the same machine (CONTRACT.md).
export function openApplication(applicationId: number): Promise<ApplicationActionOut> {
  return apiRequest<ApplicationActionOut>(`/applications/${applicationId}/open`, { method: 'POST' });
}

// The only route that sets status APPLIED — call only after the user has
// actually submitted the application themselves.
export function markApplied(applicationId: number): Promise<ApplicationActionOut> {
  return apiRequest<ApplicationActionOut>(`/applications/${applicationId}/mark-applied`, { method: 'POST' });
}
