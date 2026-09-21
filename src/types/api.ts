// Mirrors ../CareerOps/CONTRACT.md exactly — field name, wire type. See that
// file, not app/api/schemas.py, if the two ever disagree (CONTRACT.md wins).

export interface LoginRequest {
  email: string;
  password: string;
  tenant_slug?: string;
}

export interface TokenOut {
  access_token: string;
  token_type: 'bearer';
  tenant_id: number;
  tenant_slug: string;
  role: string;
  email: string;
}

export interface ApplicationOut {
  application_id: number;
  status: string;
  applied_at?: string;
}

export interface JobListItemOut {
  job_id: number;
  company: string;
  title: string;
  location: string;
  url: string;
  status: string;
  posted_at?: string;
  fit_score?: number;
  confidence?: string;
  strong_matches: unknown[];
  missing_skills: unknown[];
  risks: unknown[];
}

export interface JobDetailOut extends JobListItemOut {
  description: string;
  application?: ApplicationOut;
}

export interface GeneratedDocumentOut {
  id: number;
  type: string;
  file_path: string;
  version: number;
  claim_check_passed?: boolean;
  ats_check_passed?: boolean;
}

export interface ApplicationActionOut {
  application_id: number;
  status: string;
}

export interface JobStatusActionOut {
  job_id: number;
  status: string;
}

export interface ExploreSearchRequest {
  query: string;
  filters?: Record<string, unknown>;
}

export interface ExploreResultOut {
  source: string;
  source_job_id: string;
  company: string;
  title: string;
  location: string;
  url: string;
  description: string;
  employment_type?: string;
  salary_min?: number;
  salary_max?: number;
  posted_at?: string;
}

export type ExploreSaveRequest = ExploreResultOut;

export interface ExploreSaveResponseOut {
  inserted: boolean;
}

export interface CapabilityMatrixOut {
  flags: Record<string, boolean>;
  required_filters: string[];
}

export interface CompanyTargetOut {
  source: string;
  company: string;
  identifier: string;
}

export interface ScrapeJobspyRequest {
  search_term: string;
  location?: string;
  sites?: string[];
  results_wanted?: number;
  experience?: string;
}

// 422 (request validation failure) uses a different `detail` shape than
// other 4xx errors — CONTRACT.md's "Base URL, auth, errors" section.
export interface ValidationErrorDetail {
  loc: (string | number)[];
  msg: string;
  type: string;
}

export interface ApiErrorBody {
  detail: string | ValidationErrorDetail[];
}
