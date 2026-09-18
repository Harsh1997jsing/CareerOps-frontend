import { apiRequest } from './client';
import type { LoginRequest, TokenOut } from '../types/api';

export function login(credentials: LoginRequest): Promise<TokenOut> {
  return apiRequest<TokenOut>('/auth/login', { method: 'POST', body: credentials, auth: false });
}
