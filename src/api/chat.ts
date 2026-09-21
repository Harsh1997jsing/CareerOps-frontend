import { apiRequest } from './client';
import type { ChatMessageRequest, ChatMessageResponse, ChatSearchResultOut } from '../types/api';

export function sendMessage(request: ChatMessageRequest): Promise<ChatMessageResponse> {
  return apiRequest<ChatMessageResponse>('/chat/message', { method: 'POST', body: request });
}

// Refetches a session's currently staged results — lets the chat page
// restore its results list after a refresh without resending the search.
export function getStagedResults(sessionId: string): Promise<ChatSearchResultOut[]> {
  return apiRequest<ChatSearchResultOut[]>(`/chat/results/${encodeURIComponent(sessionId)}`);
}
