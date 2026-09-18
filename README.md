# CareerOps Frontend

A React dashboard for CareerOps, replacing the former `streamlit run
app/dashboard.py` UI in `../CareerOps`. Scaffolded (React + Vite +
TypeScript, strict mode on) with a sidebar — Dashboard, Explore Jobs,
Target, Job Scraping — and JWT auth. Dashboard (`GET /jobs`) and Explore
(`GET /explore/capabilities`, `POST /explore/search`, `POST
/explore/save`) are wired to live endpoints and verified working end to
end, including against real MCP job data (HasData). Target and Job
Scraping are honest placeholder pages: the backend has no HTTP routes for
company-target or JobSpy ingestion yet (see `../CareerOps/memory/known-gaps.md`),
so they say so rather than faking functionality. The review/approve flow
described later in this file (`JobReview`, `DocumentReview`,
`ApproveRejectBar`) has **not** been built yet — see "Views to cover" for
what's done vs. still open.

Runs in Docker too — `../CareerOps/docker-compose.yml` builds this repo's
own `Dockerfile` as its `frontend` service (Vite dev server, HMR via a
bind-mounted volume, not baked into the image) alongside the backend, so
`docker compose up -d --build` from `../CareerOps` brings up the whole
stack including this frontend on `:5173`.

This document is scoped to the frontend: what it's for, how it fits into
the rest of CareerOps, and the rules for building it. For backend
pipeline rules, see `../CareerOps/CLAUDE.md` — this file doesn't repeat
those, only the parts that constrain the frontend specifically.

**Building an API client?** Start from `CONTRACT.md`, not this file — it's
the exact, versioned wire contract, synced with `../CareerOps/CONTRACT.md`.
Any backend API change lands there first.

## Why a separate frontend

The existing `app/dashboard.py` is a Streamlit app that imports
`app/services/dashboard_data.py` directly and queries Postgres in-process.
That's fine for a single local reviewer but doesn't support:

- a proper review UI (diffing generated text against evidence side by
  side, filtering/sorting large job lists, etc.)
- running the UI and the data layer as separate processes/deployments
- anything other than one person, on one machine, with the repo checked out

This frontend is a standalone React app. It does **not** import Python or
touch Postgres directly — it talks to a new HTTP API described below.

## Full app architecture

All three ingestion sources below are built and tested in `../CareerOps`
already (174 tests passing, 1 skipped pending LibreOffice) — this isn't a
proposal, it's what's actually in the repo today. MCP explore has now
connected to real servers: HasData's Glassdoor/Indeed tools are verified
end-to-end against live data; Jobo is configured but structurally can't
return results without OAuth support the backend doesn't implement — see
`../CareerOps/memory/known-gaps.md`.

```
Three ingestion sources (CLAUDE.md rule 2 — LinkedIn excluded from all of them):

┌────────────────────────┐  ┌──────────────────────────┐  ┌──────────────────────────┐
│ Manual company targets  │  │ JobSpy multi-site scrape   │  │ MCP explore connectors     │
│ greenhouse.py / lever.py │  │ jobspy_source.py — Glassdoor,│  │ mcp/ — JOBO, Indeed/HasData│
│ via data/companies.yaml  │  │ Naukri, Indeed, ZipRecruiter,│  │ live search only, not       │
│                          │  │ Google. LinkedIn hardcoded   │  │ persisted to `jobs` unless   │
│                          │  │ out of every call.            │  │ the human explicitly saves it│
└────────────┬─────────────┘  └────────────┬──────────────┘  └────────────┬──────────────┘
             │ insert_jobs() — dedup by description_hash          │ rendered directly in
             ▼                              ▼                      │ the frontend's Explore page
      ┌─────────────────────┐
      │ hard_filters.py      │  deterministic: location, type, cooldown, etc.
      └──────────┬───────────┘
                 ▼
      ┌─────────────────────┐
      │ job_scorer.py         │  Claude call → JobFitAnalysis → REJECT /
      │ (Anthropic API)       │  REVIEW_REQUIRED / READY_FOR_REVIEW
      └──────────┬───────────┘
                 ▼
      ┌─────────────────────┐
      │ resume_generator.py,  │  Claude calls → DOCX sections/letter, strictly
      │ cover_letter.py        │  from data/evidence.yaml — never invented
      └──────────┬───────────┘
                 ▼
      ┌─────────────────────┐
      │ claim_validator.py,   │  Claude call + deterministic DOCX/ATS checks
      │ ats_validator.py       │  gate claim_check_passed / ats_check_passed
      └──────────┬───────────┘
                 ▼
      ┌─────────────────────┐      ┌───────────────────────┐
      │ Postgres (app/models/,│◄────┤ FastAPI layer — built    │◄──── this frontend
      │ Alembic migrations)   │     │ app/api/ (17 routes,    │      (React + Vite +
      │ jobs, job_analysis,   │     │ see below) — verified   │      TypeScript, this
      │ generated_documents,  │     │ against live Postgres   │      repo, scaffolded)
      │ applications, ...     │     └───────────────────────┘
      └──────────┬───────────┘
                 ▲
                 │ human clicks Approve/Reject in this frontend
                 │ human clicks Submit in their OWN browser tab (never this app)
                 │ human then confirms "I applied" → tracker.mark_applied(confirmed=True)
```

The MCP explore path is deliberately separate from the other two: it's a
live, on-demand search the human runs from the frontend, not a batch
ingestion into `jobs`. A result only enters the normal pipeline (hard
filters → scoring → generation) if the human picks "Save" on it — explore
results are never auto-inserted.

Everything above the FastAPI box is the existing, tested Python codebase
in `../CareerOps` — this frontend changes none of it. The FastAPI layer
(`app/api/`) is built, tested, and now verified against a live Postgres
instance (see `../CareerOps/memory/known-gaps.md`). There's still no
pipeline orchestrator, a separate, backend-only gap this frontend doesn't
need to wait on, since it only reads/writes already-scored jobs and
applications.

Run the backend locally with `uvicorn app.api.main:app --reload` from
`../CareerOps` (needs `DATABASE_URL` reachable), or run the whole stack —
this frontend included — with `docker compose up -d --build` from
`../CareerOps` (see its README's "Running with Docker"). CORS is open to
`FRONTEND_ORIGIN` (defaults to `http://localhost:5173`, Vite's default dev
port; both `localhost` and `127.0.0.1` are allow-listed since browsers
treat them as different origins for the same server).

### API endpoints this frontend needs

All 9 exist as real HTTP routes now — this table is what to call, not
what to build. `GET /docs` on the running server has the live OpenAPI
schema. The `/explore/*` routes are thin wrappers: the actual search/
capability-detection logic lives in and is tested by
`../CareerOps/app/sources/mcp/` — the routes just call
`explore.search()` / `explore.get_all_capabilities()`, both already
`async`:

| Method | Path | Backend function it wraps |
|---|---|---|
| `GET` | `/jobs?status=` | `dashboard_data.list_jobs()` — list view, no `description` (kept light) |
| `GET` | `/jobs/{job_id}` | `dashboard_data.get_job()` — full detail incl. `description` and nested `application` (fit score, matches, gaps, risks, current application status) |
| `GET` | `/jobs/{job_id}/documents` | `dashboard_data.list_generated_documents()` — generated resume/cover letter + `claim_check_passed`/`ats_check_passed` |
| `POST` | `/applications/{application_id}/approve` | sets `applications.status = APPROVED`; 404 if the application doesn't exist |
| `POST` | `/applications/{application_id}/reject` | sets `applications.status = REJECTED`; 404 if the application doesn't exist |
| `POST` | `/applications/{application_id}/open` | `tracker.open_job_url()` — opens the posting in a browser **on the machine running the API process** (local-first tool, same machine as the human); returns a synthetic `"OPENED"` status, doesn't touch `applications.status` |
| `POST` | `/applications/{application_id}/mark-applied` | looks up job/company via `dashboard_data.get_application_context()`, then `tracker.mark_applied(confirmed=True)` — `confirmed=True` is hardcoded here; this route *is* the human's explicit confirmation, there's no earlier implicit path to it |
| `GET` | `/explore/capabilities` | `mcp/explore.get_all_capabilities()` — per-source flags, built from each source's real `list_tools()` response |
| `POST` | `/explore/search` | `mcp/explore.search(query, filters)` — fans out to every configured source in parallel, returns results tagged with their source; a source that errors or lacks a search tool is skipped, not fatal |
| `POST` | `/explore/save` | inserts one result into `jobs` via `insert_jobs()`'s dedup path. No `{result_id}` — results aren't cached server-side, so the frontend posts back the full result object it already has; `description_hash` is recomputed server-side, never trusted from the client |

The API is read-heavy by design: this frontend displays what the backend
pipeline already produced. It never generates documents, scores jobs, or
calls Anthropic directly — that stays server-side.

## How the dashboard is built

Stack: **React + Vite + TypeScript** (strict mode on). Lightweight SPA, no
SSR needed for an internal review tool.

```bash
npm install
npm run dev            # http://localhost:5173
```

Or via Docker — see `../CareerOps/docker-compose.yml`'s `frontend` service
(this repo's own `Dockerfile`, dev-mode with HMR through a bind mount).

Actual structure:

```
CareerOps-frontend/
├── README.md              (this file)
├── CONTRACT.md             # wire contract, synced with ../CareerOps/CONTRACT.md
├── Dockerfile / .dockerignore
├── src/
│   ├── api/
│   │   ├── client.ts        # fetch wrapper: auth header, error shape, console logging
│   │   ├── auth.ts
│   │   ├── jobs.ts
│   │   └── explore.ts
│   ├── context/
│   │   └── AuthContext.tsx  # token storage, login/logout
│   ├── components/
│   │   ├── Layout.tsx       # sidebar + outlet
│   │   ├── ProtectedRoute.tsx
│   │   └── ApiStatus.tsx    # loading/success/error banner, used by every page
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx    # done — real GET /jobs, status filter
│   │   ├── Explore.tsx      # done — real search/save/capabilities
│   │   ├── Target.tsx       # placeholder — no backend route yet
│   │   └── JobScraping.tsx  # placeholder — no backend route yet
│   └── types/
│       └── api.ts           # mirrors CONTRACT.md exactly
└── .env.example              # VITE_API_BASE_URL=http://localhost:8000
```

**Not yet built:** `JobReview`/`DocumentReview`/`ApproveRejectBar`/
`ApplyConfirmDialog` — the fit-analysis-next-to-generated-documents review
flow described below. Dashboard currently only lists jobs; it doesn't yet
link into a per-job review/approve view.

Views to cover (matching what `app/dashboard.py` used to do, per
`../CareerOps/CLAUDE.md`):

1. **Job list — done.** `Dashboard.tsx`: jobs at `READY_FOR_REVIEW` /
   `REVIEW_REQUIRED` (and others via the status filter), from `GET /jobs`.
   Not yet sortable by fit score.
2. **Job review — not built.** Fit analysis, missing requirements/gaps,
   evidence used, next to the generated resume and cover letter.
3. **Approve / Reject — not built.** Sets `applications.status`. This is
   explicitly **not** "applied" (see rules below).
4. **Apply flow — not built.** A button that opens the job posting in a
   new browser tab (`/applications/{id}/open`), and a *separate*,
   explicitly-confirmed action for "I actually submitted this" that calls
   `mark-applied`.
5. **Explore — done.** `Explore.tsx`: a search box (query, location) posts
   to `/explore/search`; results render as a flat list regardless of which
   MCP source they came from. Each row has two elements on its right edge:
   - a **source badge** (e.g. `hasdata`) — not a button, just an
     indicator of provenance, since claim_validator and hard_filters never
     touch these results and the human should know that
   - an **Apply button** — opens the listing's `apply_url` directly in a
     new browser tab, client-side (`window.open`), not via
     `/applications/{id}/open` — an explore result has no `application_id`
     until it's Saved. Same effect as every other apply path in this app
     (open a tab, never fill in or submit anything), just a different
     mechanism since there's nothing in Postgres to look up yet.
   A separate, smaller "Save" button (not one of the two right-edge
   buttons) posts the result to `/explore/save` to pull it into the normal
   pipeline — apply and save are different actions and aren't combined
   into one button. If `/explore/capabilities` reports a source lacks a
   capability (e.g. no location filter), that filter input is disabled
   rather than silently sent and dropped.
   Verified end-to-end against live MCP data: HasData's Glassdoor/Indeed
   tools return real jobs through this page. Jobo is configured but
   structurally can't return anything without OAuth support the backend
   doesn't have yet — see `../CareerOps/memory/known-gaps.md`.

## Rules for frontend

These are hard constraints, not style preferences — they exist because
the backend was deliberately built with the same constraints, and a
frontend that ignores them defeats the point of `../CareerOps/CLAUDE.md`'s
rule #1 and #5.

1. **This frontend never submits a job application, anywhere.** No
   scripted form-fill, no headless browser, no auto-navigation past
   opening a tab. The only actions on an application are: approve,
   reject, open the posting URL, and (after a human confirms) mark it
   applied. If a feature request implies filling in a form on an external
   site, it's out of scope — say so instead of building it.
2. **"Approved" and "Applied" are different buttons with different
   weight.** Approve/Reject is a low-stakes review action. Marking
   something Applied must require a distinct, explicit confirmation step
   (e.g. a dialog with its own confirm click) — never a side effect of
   approving, and never a default value wired to `true`.
3. **No document generation, scoring, or Anthropic calls happen in this
   frontend.** If a page needs new content (e.g. "regenerate this
   section"), it calls a backend endpoint that runs the existing
   `structured_call()` path — the frontend never holds an API key or
   calls `api.anthropic.com` itself.
4. **Every claim shown as "verified" must come from the backend's
   `claim_check_passed` / `ats_check_passed` flags**, not be inferred or
   assumed true client-side. Don't add a client-side check that could
   diverge from `claim_validator.py`'s.
5. **Read-only assumptions**: the frontend renders `evidence.yaml`-sourced
   content; it does not let a user free-type replacement resume text that
   bypasses `claim_validator.py`. Editing evidence itself, if ever added,
   is a backend/data-file concern, not a frontend form.
6. **Explore results never show a LinkedIn or Naukri-MCP source, and its
   Apply button never does more than open a URL.** This mirrors
   `../CareerOps/CLAUDE.md` rule 2 exactly — if a future MCP source is
   added, it goes through the same review that JOBO and Indeed/HasData
   got before it's wired into `/explore/search`.
7. **API base URL is configurable, never hardcoded** — read from
   `VITE_API_BASE_URL`, mirroring how the backend rule requires
   `os.environ["ANTHROPIC_MODEL"]` instead of a hardcoded model string.
8. **TypeScript strict mode on** (`tsconfig.app.json`). `src/types/api.ts`
   mirrors `../CareerOps/CONTRACT.md` (and, one level deeper,
   `app/api/schemas.py`/`app/models/`) by hand until/unless the API layer
   starts generating an OpenAPI schema to derive them from.
9. No comments explaining *what* code does; only *why*, matching the
   convention already used across `../CareerOps`.
