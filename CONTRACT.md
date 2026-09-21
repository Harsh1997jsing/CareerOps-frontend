# API Contract (frontend side)

Keeps this repo and `../CareerOps` (backend) in sync. This file and
`../CareerOps/CONTRACT.md` describe the *same* wire contract, one from
each side. If they disagree, one of them is wrong — fix both in the same
change, never just one.

Implemented in `src/types/api.ts` (types, mirroring the block below
exactly) and `src/api/*.ts` (one thin fetch-wrapper file per resource,
built on `src/api/client.ts`'s shared auth/error handling) — `Dashboard.tsx`,
`Chat.tsx` (AI Search), `Explore.tsx`, `Target.tsx`, and `JobScraping.tsx`
are wired to these and verified against the live backend (the latter
three stay mounted/routable but are off the sidebar nav — AI Search
covers all three of their sources itself now). `auth` admin routes have
types but no UI consuming them yet.

**Rule:** if you're building against this and the running backend doesn't
actually match what's written here, that's a bug — either the backend
drifted from its own contract, or this file is stale. Fix the mismatch in
`../CareerOps/CONTRACT.md` first, in the same change, and update this
file to match. Don't just adapt frontend code silently to whatever the
backend happens to return today — that's how the two files quietly stop
meaning anything.

**Contract version: 7 — 2026-09-21.** Must equal `../CareerOps/CONTRACT.md`'s
version exactly. If they diverge, treat it as a bug to fix, not a note to
read around.

---

## Base URL, auth, errors

- Base URL: `VITE_API_BASE_URL` (`.env` — see `README.md`), defaults to `http://localhost:8000` in dev.
- Attach `Authorization: Bearer <token>` to every request **except** `POST /auth/login` and `GET /health`.
- `POST /auth/login` is rate limited: 5 attempts / 5 minutes / (client ip + email) → `429`.
- 4xx error body: `{"detail": "<message>"}`.
- `422` (request validation failure) uses a different shape: `{"detail": [{"loc": [...], "msg": "...", "type": "..."}]}` — don't assume `detail` is always a string.

## Auth flow this app must implement

1. `POST /auth/login` with `{email, password, tenant_slug}` → store `TokenOut.access_token` client-side (localStorage/memory — there's no server-side session to also manage).
2. Every subsequent call sends `Authorization: Bearer <access_token>`.
3. `401` → the token is missing/expired/invalid: clear the stored token and redirect to login. Don't retry the same request with the same token.
4. `403` → authenticated but not admin, on an admin-only route (`/auth/users`, `/auth/tenants`). This app doesn't plan to expose admin-only UI yet, so a 403 here is a bug to investigate, not an expected user-facing state.
5. `429` on login → show "too many attempts, try again in a few minutes." Don't auto-retry.
6. No logout endpoint exists — "logging out" is purely client-side (discard the token). No refresh-token flow either — a token is valid until it expires (8h default) with nothing to invalidate it early.

## Endpoints

| Method | Path | Auth | Request body | Response | Notes |
|---|---|---|---|---|---|
| GET | `/health` | none | — | `{"status": "ok"\|"degraded", "database": "ok"\|"unreachable"}` | Always 200 |
| POST | `/auth/login` | none (rate limited) | `LoginRequest` | `TokenOut` | 401 bad credentials, 429 rate limited |
| GET | `/auth/me` | bearer | — | `UserOut` | 404 if user record gone |
| POST | `/auth/users` | bearer + admin | `UserCreateRequest` | `UserOut` (201) | 400 bad role, 403 non-admin, 409 duplicate email |
| GET | `/auth/users` | bearer + admin | — | `UserOut[]` | 403 non-admin |
| DELETE | `/auth/users/{user_id}` | bearer + admin | — | `{"deleted": bool, "user_id": int}` | 403 protected default admin, 404 not found |
| POST | `/auth/tenants` | bearer + admin | `TenantCreateRequest` | `TenantOut` (201) | 409 duplicate slug |
| GET | `/jobs` | bearer | query: `status?`, `q?` (description substring, case-insensitive), `posted_within_days?` (≥1), `limit=50` (1-200), `offset=0` | `JobListItemOut[]` | Dashboard — `posted_within_days` matches `posted_at`, falling back to `collected_at` when unknown |
| GET | `/jobs/{job_id}` | bearer | — | `JobDetailOut` | 404. Job review page |
| GET | `/jobs/{job_id}/documents` | bearer | — | `GeneratedDocumentOut[]` | Job detail page |
| POST | `/jobs/{job_id}/reject` | bearer | — | `JobStatusActionOut` | 404. Dashboard's "Reject selected" — sets `Job.status` directly, a separate mechanism from `/applications/{id}/reject` (see "Known gaps" below) |
| POST | `/jobs/{job_id}/restore` | bearer | — | `JobStatusActionOut` | 404. Undoes reject |
| POST | `/jobs/{job_id}/analyze` | bearer | — | `JobDetailOut` | 404. Job detail page's "Analyze" button — real Claude call, takes several seconds; disable the button and show a spinner while it's in flight |
| POST | `/jobs/{job_id}/documents` | bearer | `GenerateDocumentRequest` | `GeneratedDocumentOut` | 404 job not found, 422 bad `type`. Job detail page's "Generate Resume"/"Generate Cover Letter" buttons — several real Claude calls, can take 20s+; also get-or-creates the job's `Application` row, so the approve/reject/open/mark-applied bar only makes sense to show once at least one document exists. `claim_check_passed`/`ats_check_passed` can be `null` (check didn't run) — render that distinctly from `true`/`false`, don't treat `null` as passed |
| POST | `/jobs/{job_id}/documents/{document_id}/suggest-edit` | bearer | `SuggestDocumentEditRequest` | `DocumentEditSuggestionOut` | 404 job/document not found. Job Detail page's per-document "Suggest edit" flow, step 1 — **read-only**, one Claude call, nothing saved. Response has exactly one pair set (current_sections/proposed_sections for a resume, current_content/proposed_content for a cover letter) — check the document's own `type` to know which to render, don't rely on which fields are non-null alone since both could theoretically be absent on a malformed response |
| POST | `/jobs/{job_id}/documents/{document_id}/apply-edit` | bearer | `ApplyDocumentEditRequest` | `GeneratedDocumentOut` | 404 job/document not found, 422 wrong field for this document's type. Step 2 — send back the *exact* `proposed_sections`/`proposed_content` a suggest-edit call returned, don't let the user free-type over it; **no Claude call happens here**, so whatever you send is exactly what gets saved as the new version |
| POST | `/applications/{application_id}/approve` | bearer | — | `ApplicationActionOut` | 404. Approve/Reject bar |
| POST | `/applications/{application_id}/reject` | bearer | — | `ApplicationActionOut` | 404. Approve/Reject bar |
| POST | `/applications/{application_id}/open` | bearer | — | `ApplicationActionOut` | 404. Opens the posting URL **server-side**, not in the caller's browser — see below |
| POST | `/applications/{application_id}/mark-applied` | bearer | — | `ApplicationActionOut` | 404. The apply-confirm dialog's action |
| GET | `/explore/capabilities` | bearer | — | `Record<string, CapabilityMatrixOut>` keyed by MCP source name | Explore page — drives which filters to show/disable per source, and which are required |
| POST | `/explore/search` | bearer | `ExploreSearchRequest` | `ExploreResultOut[]` | Explore page search — `filters.posted_within_days` (number) drops results older than N days, applied server-side after merging every source. `filters.experience` (string) passes through to a connected source's own experience/seniority param when it has one (see `experience_filter` in `GET /explore/capabilities`) |
| POST | `/explore/save` | bearer | `ExploreSaveRequest` | `ExploreSaveResponseOut` | **Shared "Add to Dashboard" action for Explore, Target, Job Scraping, and AI Search alike** — not Explore-only despite the path, see below |
| GET | `/targets` | bearer | — | `CompanyTargetOut[]` | Target page — lists configured Greenhouse/Lever targets |
| POST | `/targets/search` | bearer | query: `experience?` (string, matched against title/description) | `ExploreResultOut[]` | Target page "Search" action — does **not** save; user picks which results to add via `/explore/save` |
| POST | `/scrape/jobspy` | bearer | `ScrapeJobspyRequest` | `ExploreResultOut[]` | Job Scraping page "Scrape" action — never `linkedin`, up to ~90s, does **not** save; user picks which results to add via `/explore/save`. `experience` (string) matched app-side against whatever a given site reports — not every result will have one |
| POST | `/chat/message` | bearer | `ChatMessageRequest` | `ChatMessageResponse` | AI Search page's one endpoint — send the message plus the prior turn's `filters` back as `known_filters`; `ready: false` means show `reply` as a clarifying question and wait for the next message, `ready: true` means show `reply` plus `results` (already staged, save via `/explore/save` same as any other discovery source). Can take several seconds to tens of seconds. |
| GET | `/chat/results/{session_id}` | bearer | — | `ChatSearchResultOut[]` | Restores a session's staged results on page load/refresh — call once on mount with the session id from `localStorage`, no chat turn needed |

## Types

Mirrors `app/api/schemas.py` exactly — field name, wire type. `?` = optional/nullable.

```
LoginRequest          { email: string, password: string, tenant_slug?: string = "default" }
TokenOut                { access_token: string, token_type: "bearer", tenant_id: number, tenant_slug: string, role: string, email: string }
UserOut                  { id: number, tenant_id: number, email: string, role: string, is_default_admin: boolean, is_active: boolean, created_at?: string }
UserCreateRequest        { email: string, password: string (min 8 chars), role?: string = "user" }
TenantOut                { id: number, name: string, slug: string, is_active: boolean, created_at?: string }
TenantCreateRequest      { name: string, slug: string (pattern ^[a-z0-9]+(-[a-z0-9]+)*$, max 63 chars) }

ApplicationOut           { application_id: number, status: string, applied_at?: string }
JobListItemOut           { job_id: number, company: string, title: string, location: string, url: string, status: string, posted_at?: string, fit_score?: number, confidence?: string, strong_matches: any[], missing_skills: any[], risks: any[] }
JobDetailOut              = JobListItemOut & { description: string, application?: ApplicationOut }
GeneratedDocumentOut     { id: number, type: string, file_path: string, version: number, claim_check_passed?: boolean, ats_check_passed?: boolean }
ApplicationActionOut     { application_id: number, status: string }
JobStatusActionOut       { job_id: number, status: string }

ExploreSearchRequest     { query: string, filters?: object = {} }  // filters.posted_within_days?: number, filters.experience?: string
ExploreResultOut          { source: string, source_job_id: string, company: string, title: string, location: string, url: string, description: string, employment_type?: string, salary_min?: number, salary_max?: number, posted_at?: string }
ExploreSaveRequest        = ExploreResultOut  (same shape, posted back to /explore/save)
ExploreSaveResponseOut   { inserted: boolean }
CapabilityMatrixOut      { flags: Record<string, boolean>, required_filters: string[] }

CompanyTargetOut         { source: string, company: string, identifier: string }
ScrapeJobspyRequest      { search_term: string, location?: string, sites?: string[], results_wanted?: number = 50, experience?: string }

GenerateDocumentRequest { type: "resume" | "cover_letter" }

ResumeSectionOut         { section: string, content: string, evidence_ids_used: string[] }
SuggestDocumentEditRequest { feedback: string }
DocumentEditSuggestionOut { change_summary: string, current_sections?: ResumeSectionOut[], proposed_sections?: ResumeSectionOut[], current_content?: string, proposed_content?: string }
ApplyDocumentEditRequest { sections?: ResumeSectionOut[], content?: string }

ChatSearchResultOut       = ExploreResultOut & { id: number, summary?: string }  // id = staged-row id (see GET /chat/results); summary = one-line AI summary
ChatMessageRequest       { session_id: string, message: string, known_filters?: object = {} }  // pass back the prior turn's `filters` verbatim
ChatMessageResponse      { reply: string, filters: object, ready: boolean, results: ChatSearchResultOut[] }
```

## What this frontend needs to design around

- **No `tenant_id` on jobs/applications/documents** — every authenticated user currently sees every job, regardless of tenant. Don't build UI that implies per-tenant job isolation exists yet.
- **`/applications/{id}/open` opens a browser tab on the API's host**, not the browser running this app. In production (frontend and API on different machines) this button would do nothing visible to the user — flag this explicitly if/when this app is ever deployed somewhere other than the same machine as the API, per `README.md`'s "why a separate frontend" section.
- **Timestamps arrive as ISO 8601 strings** — parse with `new Date(value)` or a date library, don't assume any other format.
- **`ExploreResultOut.posted_at` is approximate for HasData results** (derived server-side from an integer "days old" HasData returns, not a real timestamp) and can be `null` when no date info was available at all — don't render it as if it were exact, and always guard for `null`.
- **An `Application` row only exists once `POST /jobs/{job_id}/documents` has been called at least once for that job** (as of contract v6 — previously nothing ever created one). `job.application` on `JobDetailOut` is `null` until then — gate the approve/reject/open/mark-applied bar on `job.application` being non-null, don't show it unconditionally. `/jobs/{id}/reject`/`/jobs/{id}/restore` remain the Dashboard's hide/unhide action regardless (not tied to whether an Application exists). The "Apply all" bulk action still opens each selected job's `url` directly in the browser (`window.open`, client-side) rather than calling `/applications/{id}/open`, for the same reason as below.
- **Generated documents live on the API host's filesystem, not behind a URL.** `GeneratedDocumentOut.file_path` is a local path (this is a local-first tool — frontend and API run on the same machine); there's no download route to link to. Show the path as informational text, not a link.

## When the backend changes

If `../CareerOps/CONTRACT.md`'s version number is higher than this file's,
this file — and any TypeScript types/API client already written against
it — are out of date. Diff `../CareerOps/CONTRACT.md` specifically to see
what changed, not the whole backend; that diff *is* the list of frontend
changes needed.
