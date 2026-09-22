# Full code audit — frontend

A systematic sweep for issues not already documented in `CONTRACT.md`
(no tenant isolation, no download route for generated documents,
`/applications/{id}/open` opens a tab server-side not client-side,
timestamps are ISO strings, no logout/refresh endpoint,
`claim_check_passed`/`ats_check_passed` nullable meaning "didn't run").
One read-only pass covered dead code, correctness bugs, and gaps across
`src/`; every item below was verified against the actual code paths, not
inferred. Every "Fixed" item was applied directly, checked with
`npm run build` + `npm run lint` after each change. See
`../careerops/memory/code-audit.md` for the backend's half of this same
pass.

## Fixed — auth/session (the most user-visible bug found in the whole audit)

`AuthContext`'s `isAuthenticated` only ever changed via `login()`/`logout()`,
but `src/api/client.ts` cleared the raw `localStorage` token directly on
any 401, entirely outside React — `AuthContext` never found out. Concrete
failure: the 8h JWT expires while the SPA is left open in a browser tab →
the next request 401s and the token gets cleared, but the app still
believes it's logged in forever → every subsequent request silently omits
`Authorization`, 401s again, and nothing ever redirects to `/login` — only
a manual "Log out" click or a hard refresh recovered. Fixed with a small
subscriber mechanism: `client.ts` exports `setUnauthorizedHandler()`,
which `AuthProvider` registers on mount to clear its own state on an
authenticated request's 401 — `ProtectedRoute` (already inside
`BrowserRouter`) then redirects naturally on the very next render, no
direct `navigate()` call needed from outside the router tree.

Same area, same fix: `client.ts` previously cleared the token on *any*
401, not just an authenticated request's — a failed login attempt (bad
password) in one tab would wipe the shared `localStorage` token and
silently kill a *different*, currently-valid session in another tab. The
clear-and-notify path is now scoped to `auth: true` requests only (a login
attempt always sends `auth: false`).

Files: `src/api/client.ts`, `src/context/AuthContext.tsx`.

## Fixed — stale-response race in JobDetail.tsx

`load()` (fetches `GET /jobs/{id}` + `GET /jobs/{id}/documents`) is called
from 4 independent triggers — page mount, Generate, Approve/Reject/Open/
Mark-applied, Accept-edit — unlike `Dashboard.tsx`'s `fetchJobs`, which
only ever fires from one `useEffect` (where returning a cleanup closure is
enough). Concrete scenario: click "Generate Cover Letter" (a real Claude
call, 20s+ per CONTRACT.md), then click "Approve" while it's still in
flight — whichever response lands *last* wins and overwrites the page,
even if it's the stale one from before the other mutation landed. Fixed
with a monotonic `requestIdRef` (only the latest call's result is applied)
plus an `isMountedRef` (stops any of them from touching state after
navigating away mid-request, which previously did nothing but waste
work). File: `src/pages/JobDetail.tsx`.

## Fixed — DiscoveredResults.tsx (shared by Explore/Target/Job Scraping/AI Search)

- No in-flight guard on "Add to Dashboard": a fast double-click fired two
  concurrent, identical `POST /explore/save` requests before the first
  response arrived. Added a `savingIds` set disabling the row (and
  showing "Adding…") for the duration of its own request.
- `addOne` only ever added a saved item's key to `savedIds`, never removed
  it from `selected` — checking several rows (or "Select all"), then
  individually clicking "Add to Dashboard" on one of them, left its key
  stuck in `selected` even though the row was now disabled. This desynced
  the "select all" checkbox's `checked` math and made a later bulk-add
  redundantly re-POST an already-saved item. Fixed: a row's key is now
  dropped from `selected` as soon as it's resolved (inserted, or already
  there), whether from its own button or a bulk add.
- A single-row add failure only ever logged to `console.error`, with no UI
  signal — indistinguishable from the button silently doing nothing.
  Added a per-row error message (keyed by result, since several rows can
  be in flight from a bulk add at once).

File: `src/components/DiscoveredResults.tsx`.

## Fixed — silent failures and loading/empty conflation

- `Explore.tsx`'s capabilities fetch (`GET /explore/capabilities`) failed
  into `console.warn` only, with no UI signal, **and** the page conflated
  "still loading" / "failed to load" with "no sources configured" — all
  three rendered the identical "not configured" message. Added a separate
  `capabilitiesState`/`capabilitiesError` pair so loading, error, and
  genuinely-empty are three distinct messages.
- `Chat.tsx`'s staged-results restore (`GET /chat/results/{session_id}`,
  runs on mount so a page refresh doesn't lose a session's results) had
  the same silent-`console.warn`-only failure mode, indistinguishable from
  "nothing was ever staged." Added a `restoreState`/`restoreError` pair,
  shown only while loading or on error (not on every successful restore,
  to avoid a success banner flashing on every page load for a background
  restore the user didn't initiate).

Files: `src/pages/Explore.tsx`, `src/pages/Chat.tsx`.

## Fixed — real gap: Dashboard had no pagination

`GET /jobs` supports `limit`/`offset` (CONTRACT.md; server defaults to
`limit=50`), but `Dashboard.tsx` never sent either — any filter
combination matching more than 50 jobs silently truncated with no
indication more existed. Added `PAGE_SIZE = 50` and a `page` state with
Prev/Next controls; changing any filter resets to page 1 (a stale page
number from a narrower search may not even exist under a new filter).
`GET /jobs` has no total-count field to page against, so "Next" is
enabled only when the current page came back full (`jobs.length ===
PAGE_SIZE`) — the only signal available that a next page might exist.
File: `src/pages/Dashboard.tsx`.

## Fixed — type drift vs. this repo's own CONTRACT.md

- `UserOut`/`UserCreateRequest`/`TenantOut`/`TenantCreateRequest` are
  documented in CONTRACT.md's own Types block (with the note "`auth`
  admin routes have types but no UI consuming them yet" — intentionally
  ahead-of-UI scaffolding, not an oversight) but didn't actually exist in
  `src/types/api.ts`. Added them, matching the documented shapes exactly.
- `ChatMessageRequest.known_filters` was typed as required where
  CONTRACT.md documents it optional (`known_filters?: object = {}`).
  Harmless today since `Chat.tsx` always passes a `{}`-initialized value,
  but a real signature mismatch against the documented contract. Added `?`.

File: `src/types/api.ts`.

## Fixed — dead code and duplication

- `api/jobs.ts`'s `ListJobsParams` was exported but never imported by
  anything outside its own file (the only use is as `listJobs()`'s own
  parameter type) — dropped the `export`. Also extended it with `limit`/
  `offset` for the Dashboard pagination fix above.
- `formatPostedAt` was implemented twice, near-identically, in
  `Dashboard.tsx` and `DiscoveredResults.tsx` (same day-diff logic,
  different label wording). Extracted the actual duplicated parse-and-diff
  logic into a shared `daysSince(value)` in a new `src/utils/date.ts`;
  each call site keeps its own label wording as a thin wrapper around it,
  since forcing one shared string format across both would have been an
  awkward, unnecessary abstraction for what's genuinely just two different
  presentations of the same number.
- The `err instanceof ApiError ? err.message : 'Unknown error'` idiom was
  copy-pasted 12 times across 6 files (`Dashboard.tsx`, `JobDetail.tsx` ×6,
  `Explore.tsx`, `Target.tsx` ×2, `JobScraping.tsx`, `Chat.tsx`). Extracted
  a shared `getErrorMessage(err)` in `src/api/client.ts`, next to the
  `ApiError` class it switches on, and replaced every occurrence.
  `Login.tsx`'s two `instanceof ApiError` checks were left alone — they
  also branch on `err.status === 429` for the rate-limit case, genuinely
  different logic, not the same idiom.

Files: `src/api/jobs.ts`, `src/utils/date.ts` (new), `src/api/client.ts`,
`src/pages/Dashboard.tsx`, `src/components/DiscoveredResults.tsx`.

## Verification

- `npm run build` (`tsc -b && vite build`) — clean after every change described above.
- `npm run lint` (oxlint) — no new warning categories introduced. The pre-existing `react(set-state-in-effect)` warnings (present in `Target.tsx`/`Dashboard.tsx` before this pass) now also appear in `Chat.tsx`/`Explore.tsx`, since their loading-state fixes above follow the identical, already-accepted pattern of calling `setState` synchronously at the top of a `useEffect`. One new warning, `react-hooks(exhaustive-deps)` on `JobDetail.tsx`'s `load()` effect, is expected and intentional — `load` is redefined every render and wrapping it in `useCallback` would add complexity without changing its behavior (it's idempotent regardless of its identity).
