# CareerOps Frontend

A React dashboard for CareerOps, replacing the current `streamlit run
app/dashboard.py` UI in `../CareerOps`. This folder is new and currently
empty except for this README — nothing here has been scaffolded yet.

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
already (111 tests, 110 passing / 1 skipped pending LibreOffice) — this
isn't a proposal, it's what's actually in the repo today. The one
exception: MCP explore has never connected to a real JOBO/HasData server
yet (no API keys configured), so its capability-detection and result
parsing are verified against fixtures only — see
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
      │ Postgres (schema.sql) │◄────┤ FastAPI layer — built    │◄──── this frontend
      │ jobs, job_analysis,   │     │ app/api/ (9 routes, see │      (React + Vite
      │ generated_documents,  │     │ below) — not yet run     │       + TypeScript,
      │ applications, ...     │     │ against live Postgres    │       not yet scaffolded)
      └──────────┬───────────┘     └───────────────────────┘
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
(`app/api/`) is built and tested (16 tests, mocked DB/MCP calls) but has
never run against live Postgres — same "untested against real
infrastructure" caveat as the rest of the backend, see
`../CareerOps/memory/known-gaps.md`. There's also still no pipeline
orchestrator, a separate, backend-only gap this frontend doesn't need to
wait on, since it only reads/writes already-scored jobs and applications.

Run it locally with `uvicorn app.api.main:app --reload` from `../CareerOps`
(needs `DATABASE_URL` reachable, same as the Streamlit dashboard). CORS is
open to `FRONTEND_ORIGIN` (defaults to `http://localhost:5173`, Vite's
default dev port).

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

## How to build the dashboard

Recommended stack: **React + Vite + TypeScript**. Lightweight SPA, no SSR
needed for an internal review tool.

```bash
npm create vite@latest . -- --template react-ts
npm install
npm run dev
```

Suggested structure once scaffolded:

```
frontend/
├── README.md              (this file)
├── src/
│   ├── api/                # thin fetch wrappers, one file per resource
│   │   ├── jobs.ts
│   │   └── applications.ts
│   ├── pages/
│   │   ├── JobList.tsx      # filter/sort jobs by status, fit score
│   │   ├── JobReview.tsx    # fit analysis + gaps + evidence side by side
│   │   ├── DocumentReview.tsx  # generated resume/cover letter + claim/ATS check results
│   │   └── Explore.tsx      # MCP search: query + filters, results list
│   ├── components/
│   │   ├── ApproveRejectBar.tsx
│   │   ├── ApplyConfirmDialog.tsx   # the explicit "I actually clicked submit" step
│   │   ├── StatusBadge.tsx
│   │   └── ExploreResultRow.tsx     # source badge + Apply button, right-aligned
│   └── types/                # mirrors app/llm/schemas.py + schema.sql shapes
└── .env.example              # VITE_API_BASE_URL=http://localhost:8000
```

Views to cover (matching what `app/dashboard.py` does today, per
`../CareerOps/CLAUDE.md`):

1. **Job list** — jobs at `READY_FOR_REVIEW` / `REVIEW_REQUIRED`, sortable
   by fit score, filterable by status/company.
2. **Job review** — fit analysis, missing requirements/gaps, evidence used,
   next to the generated resume and cover letter.
3. **Approve / Reject** — sets `applications.status`. This is explicitly
   **not** "applied" (see rules below).
4. **Apply flow** — a button that opens the job posting in a new browser
   tab (`/applications/{id}/open`), and a *separate*, explicitly-confirmed
   action for "I actually submitted this" that calls `mark-applied`.
5. **Explore** — a fifth view, reachable from an "Explore" button on the
   job list. A search box (title/keywords, location, filters) posts to
   `/explore/search`; results render as a flat list regardless of which
   MCP source they came from. Each row has two elements on its right edge:
   - a **source badge** (e.g. `JOBO` / `Indeed`) — not a button, just an
     indicator of provenance, since claim_validator and hard_filters never
     touch these results and the human should know that
   - an **Apply button** — opens the listing's `apply_url` directly in a
     new browser tab, client-side (`window.open`), not via
     `/applications/{id}/open` — an explore result has no `application_id`
     until it's Saved. Same effect as every other apply path in this app
     (open a tab, never fill in or submit anything), just a different
     mechanism since there's nothing in Postgres to look up yet.
   A separate, smaller "Save" affordance (not one of the two right-edge
   buttons) is what posts the result to `/explore/save` to pull it into
   the normal pipeline — apply and save are different actions and
   shouldn't be combined into one button.
   If `/explore/capabilities` reports a source lacks a capability (e.g.
   no location filter), disable that filter for that source rather than
   silently sending it and dropping the results, or hiding the source
   from the results entirely — surface the gap in the UI (e.g. a "location
   filter not supported by Indeed" note) instead of failing quietly.

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
8. **TypeScript strict mode on.** Types for API responses should mirror
   `../CareerOps/app/llm/schemas.py` and `schema.sql` shapes by hand until/
   unless the API layer starts generating an OpenAPI schema to derive them
   from.
9. No comments explaining *what* code does; only *why*, matching the
   convention already used across `../CareerOps`.
