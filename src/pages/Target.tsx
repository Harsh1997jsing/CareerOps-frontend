export function Target() {
  return (
    <div>
      <h1>Target</h1>
      <p className="page-hint">Manual company targets — Greenhouse / Lever board ingestion.</p>

      <div className="not-wired-notice">
        <strong>Not wired to the API yet.</strong> The backend has no HTTP route for this —
        company targets live in <code>../CareerOps/data/companies.yaml</code> and are only run via
        a Python call (<code>app/sources/targets.py:ingest_all()</code>), not over HTTP. Adding a
        route here (e.g. <code>GET/POST /targets</code>, <code>POST /targets/ingest</code>) is a
        backend change to make before this page can do anything real — see
        <code> ../CareerOps/CONTRACT.md</code> for the endpoints that do exist today.
      </div>
    </div>
  );
}
