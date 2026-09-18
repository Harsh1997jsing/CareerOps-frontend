# API Contract (frontend side)

Keeps this repo and `../CareerOps` (backend) in sync. This file and
`../CareerOps/CONTRACT.md` describe the *same* wire contract, one from
each side. If they disagree, one of them is wrong — fix both in the same
change, never just one.

Implemented in `src/types/api.ts` (types, mirroring the block below
exactly) and `src/api/*.ts` (one thin fetch-wrapper file per resource,
built on `src/api/client.ts`'s shared auth/error handling) — `Dashboard.tsx`
and `Explore.tsx` are wired to these and verified against the live
backend. `auth`/`applications` admin routes and `/jobs/{id}`,
`/jobs/{id}/documents` have types but no UI consuming them yet (no job-
review/approve view exists — see `README.md`'s "Views to cover").

**Rule:** if you're building against this and the running backend doesn't
actually match what's written here, that's a bug — either the backend
drifted from its own contract, or this file is stale. Fix the mismatch in
`../CareerOps/CONTRACT.md` first, in the same change, and update this
file to match. Don't just adapt frontend code silently to whatever the
backend happens to return today — that's how the two files quietly stop
meaning anything.

**Contract version: 1 — 2026-09-18.** Must equal `../CareerOps/CONTRACT.md`'s
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
| GET | `/jobs` | bearer | query: `status?`, `limit=50` (1-200), `offset=0` | `JobListItemOut[]` | Job list page |
| GET | `/jobs/{job_id}` | bearer | — | `JobDetailOut` | 404. Job review page |
| GET | `/jobs/{job_id}/documents` | bearer | — | `GeneratedDocumentOut[]` | Document review page |
| POST | `/applications/{application_id}/approve` | bearer | — | `ApplicationActionOut` | 404. Approve/Reject bar |
| POST | `/applications/{application_id}/reject` | bearer | — | `ApplicationActionOut` | 404. Approve/Reject bar |
| POST | `/applications/{application_id}/open` | bearer | — | `ApplicationActionOut` | 404. Opens the posting URL **server-side**, not in the caller's browser — see below |
| POST | `/applications/{application_id}/mark-applied` | bearer | — | `ApplicationActionOut` | 404. The apply-confirm dialog's action |
| GET | `/explore/capabilities` | bearer | — | `Record<string, CapabilityMatrixOut>` keyed by MCP source name | Explore page — drives which filters to show/disable per source |
| POST | `/explore/search` | bearer | `ExploreSearchRequest` | `ExploreResultOut[]` | Explore page search |
| POST | `/explore/save` | bearer | `ExploreSaveRequest` | `ExploreSaveResponseOut` | Explore page "Save" action |

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
JobListItemOut           { job_id: number, company: string, title: string, location: string, url: string, status: string, fit_score?: number, confidence?: string, strong_matches: any[], missing_skills: any[], risks: any[] }
JobDetailOut              = JobListItemOut & { description: string, application?: ApplicationOut }
GeneratedDocumentOut     { id: number, type: string, file_path: string, version: number, claim_check_passed?: boolean, ats_check_passed?: boolean }
ApplicationActionOut     { application_id: number, status: string }

ExploreSearchRequest     { query: string, filters?: object = {} }
ExploreResultOut          { source: string, source_job_id: string, company: string, title: string, location: string, url: string, description: string, employment_type?: string, salary_min?: number, salary_max?: number }
ExploreSaveRequest        = ExploreResultOut  (same shape, posted back to /explore/save)
ExploreSaveResponseOut   { inserted: boolean }
CapabilityMatrixOut      { flags: Record<string, boolean> }
```

## What this frontend needs to design around

- **No `tenant_id` on jobs/applications/documents** — every authenticated user currently sees every job, regardless of tenant. Don't build UI that implies per-tenant job isolation exists yet.
- **`/applications/{id}/open` opens a browser tab on the API's host**, not the browser running this app. In production (frontend and API on different machines) this button would do nothing visible to the user — flag this explicitly if/when this app is ever deployed somewhere other than the same machine as the API, per `README.md`'s "why a separate frontend" section.
- **Timestamps arrive as ISO 8601 strings** — parse with `new Date(value)` or a date library, don't assume any other format.

## When the backend changes

If `../CareerOps/CONTRACT.md`'s version number is higher than this file's,
this file — and any TypeScript types/API client already written against
it — are out of date. Diff `../CareerOps/CONTRACT.md` specifically to see
what changed, not the whole backend; that diff *is* the list of frontend
changes needed.
