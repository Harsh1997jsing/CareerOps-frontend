export function JobScraping() {
  return (
    <div>
      <h1>Job Scraping</h1>
      <p className="page-hint">Multi-site scrape (Glassdoor, Naukri, Indeed, ZipRecruiter, Google) via JobSpy.</p>

      <div className="not-wired-notice">
        <strong>Not wired to the API yet.</strong> The backend has no HTTP route for this —
        <code> app/sources/jobspy_source.py:fetch_jobs()</code> is only callable from Python today,
        with LinkedIn hardcoded out of every call (<code>../CareerOps/CLAUDE.md</code> rule 2). A
        route here (e.g. <code>POST /scrape/jobspy</code>) is a backend change to make before this
        page can trigger a real scrape — see <code>../CareerOps/CONTRACT.md</code> for the
        endpoints that do exist today.
      </div>
    </div>
  );
}
