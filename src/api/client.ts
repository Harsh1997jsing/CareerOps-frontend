import type { ApiErrorBody } from '../types/api';

// Rule 7 (../README.md "Rules for frontend"): API base URL is configurable,
// never hardcoded.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

const TOKEN_KEY = 'careerops_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null, message: string) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

function errorMessage(body: ApiErrorBody | null, status: number): string {
  if (!body) return `Request failed with status ${status}`;
  if (typeof body.detail === 'string') return body.detail;
  if (Array.isArray(body.detail)) {
    return body.detail.map((d) => `${d.loc.join('.')}: ${d.msg}`).join('; ');
  }
  return `Request failed with status ${status}`;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

// CONTRACT.md: 401 means the token is missing/expired/invalid — clear it and
// let the caller redirect to login, but never silently retry the request.
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const url = `${API_BASE_URL}${path}`;
  console.log(`[api] ${method} ${url}`);

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    console.error(`[api] ${method} ${url} — network error`, err);
    throw new ApiError(0, null, 'Could not reach the API. Is the backend running?');
  }

  if (response.status === 401) {
    console.warn(`[api] ${method} ${url} — 401, clearing stored token`);
    clearToken();
  }

  if (!response.ok) {
    let parsedBody: ApiErrorBody | null = null;
    try {
      parsedBody = await response.json();
    } catch {
      // no JSON body — fall through with parsedBody left null
    }
    const message = errorMessage(parsedBody, response.status);
    console.error(`[api] ${method} ${url} — ${response.status}`, parsedBody ?? message);
    throw new ApiError(response.status, parsedBody, message);
  }

  console.log(`[api] ${method} ${url} — ${response.status} ok`);

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
