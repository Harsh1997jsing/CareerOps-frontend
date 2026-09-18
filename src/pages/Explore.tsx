import { useEffect, useState, type FormEvent } from 'react';
import { getCapabilities, saveResult, search } from '../api/explore';
import { ApiError } from '../api/client';
import { ApiStatus, type ApiState } from '../components/ApiStatus';
import type { CapabilityMatrixOut, ExploreResultOut } from '../types/api';

export function Explore() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [results, setResults] = useState<ExploreResultOut[]>([]);
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityMatrixOut>>({});
  const [state, setState] = useState<ApiState>('idle');
  const [error, setError] = useState<string | undefined>();
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Rule from ../README.md: if a source lacks a capability, disable that
    // filter for it rather than sending it and dropping results.
    getCapabilities()
      .then(setCapabilities)
      .catch((err) => console.warn('[explore] capabilities fetch failed', err));
  }, []);

  const hasAnySource = Object.keys(capabilities).length > 0;
  const anySupportsLocation = Object.values(capabilities).some((c) => c.flags?.location);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    setState('loading');
    setError(undefined);
    try {
      const filters: Record<string, unknown> = {};
      if (location) filters.location = location;
      const found = await search({ query, filters });
      setResults(found);
      setState('success');
    } catch (err) {
      setState('error');
      setError(err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  const handleSave = async (result: ExploreResultOut) => {
    try {
      const res = await saveResult(result);
      if (res.inserted) {
        setSavedIds((prev) => new Set(prev).add(result.source_job_id));
      }
    } catch (err) {
      console.error('[explore] save failed', err);
    }
  };

  return (
    <div>
      <h1>Explore Jobs</h1>
      <p className="page-hint">
        Live search via MCP sources (<code>POST /explore/search</code>) — results aren't saved to
        the pipeline unless you click Save.
      </p>

      {!hasAnySource && (
        <p className="empty-state">
          No MCP explore sources are configured (<code>JOBO_MCP_API_KEY</code> /{' '}
          <code>HASDATA_*</code> are empty in the backend's <code>.env</code>) — search will return
          no results until at least one is set.
        </p>
      )}

      <form className="toolbar" onSubmit={handleSearch}>
        <label>
          Query
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="backend engineer" required />
        </label>
        <label>
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Bangalore"
            disabled={hasAnySource && !anySupportsLocation}
          />
        </label>
        <button type="submit">Search</button>
      </form>

      <ApiStatus state={state} error={error} />

      {results.map((result) => (
        <div className="result-row" key={`${result.source}-${result.source_job_id}`}>
          <div className="result-main">
            <strong>{result.title}</strong> — {result.company} ({result.location})
            <div className="result-description">{result.description.slice(0, 160)}…</div>
          </div>
          <div className="result-actions">
            <span className="source-badge">{result.source}</span>
            <button type="button" onClick={() => window.open(result.url, '_blank', 'noreferrer')}>
              Apply
            </button>
            <button
              type="button"
              className="secondary"
              disabled={savedIds.has(result.source_job_id)}
              onClick={() => handleSave(result)}
            >
              {savedIds.has(result.source_job_id) ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
