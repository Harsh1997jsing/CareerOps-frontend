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

// `auth` admin routes (/auth/users, /auth/tenants) have these types but no
// UI consuming them yet (CONTRACT.md: "This app doesn't plan to expose
// admin-only UI yet").
export interface UserOut {
  id: number;
  tenant_id: number;
  email: string;
  role: string;
  is_default_admin: boolean;
  is_active: boolean;
  created_at?: string;
}

export interface UserCreateRequest {
  email: string;
  password: string;
  role?: string;
}

export interface TenantOut {
  id: number;
  name: string;
  slug: string;
  is_active: boolean;
  created_at?: string;
}

export interface TenantCreateRequest {
  name: string;
  slug: string;
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

export interface GenerateDocumentRequest {
  type: 'resume' | 'cover_letter';
}

export interface ResumeSectionOut {
  section: string;
  content: string;
  evidence_ids_used: string[];
}

export interface SuggestDocumentEditRequest {
  feedback: string;
}

// Exactly one pair is set, matching the document's own type:
// current_sections/proposed_sections for "resume", current_content/
// proposed_content for "cover_letter". Send proposed_sections or
// proposed_content back to apply-edit verbatim to accept it.
export interface DocumentEditSuggestionOut {
  change_summary: string;
  current_sections?: ResumeSectionOut[];
  proposed_sections?: ResumeSectionOut[];
  current_content?: string;
  proposed_content?: string;
}

export interface ApplyDocumentEditRequest {
  sections?: ResumeSectionOut[];
  content?: string;
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

// A staged chat-search result — ExploreResultOut's fields plus its own
// staged-row id, so it's already a valid ExploreSaveRequest (see
// api/explore.ts's saveResult, the single shared save path every
// discovery source — including chat — saves through). `summary` is a
// one-line AI summary of the JD, batched for the whole result set in one
// call server-side (see app/services/chat_search.py's summarize_results).
export interface ChatSearchResultOut extends ExploreResultOut {
  id: number;
  summary?: string;
}

export interface ChatMessageRequest {
  session_id: string;
  message: string;
  known_filters?: Record<string, unknown>;
}

export interface ChatMessageResponse {
  reply: string;
  filters: Record<string, unknown>;
  ready: boolean;
  results: ChatSearchResultOut[];
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
