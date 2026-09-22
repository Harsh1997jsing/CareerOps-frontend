import { useEffect, useState, type FormEvent } from 'react';
import { getCapabilities, search } from '../api/explore';
import { getErrorMessage } from '../api/client';
import { ApiStatus, type ApiState } from '../components/ApiStatus';
import { DiscoveredResults } from '../components/DiscoveredResults';
import type { CapabilityMatrixOut, ExploreResultOut } from '../types/api';

export function Explore() {
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [postedWithinDays, setPostedWithinDays] = useState('');
  const [experience, setExperience] = useState('');
  const [results, setResults] = useState<ExploreResultOut[]>([]);
  const [capabilities, setCapabilities] = useState<Record<string, CapabilityMatrixOut>>({});
  // Tracked separately from `capabilities` itself (which starts as {}, the
  // same shape a genuinely-empty response has) — without this, "still
  // loading" and "failed to load" were both indistinguishable from "no
  // sources configured", showing the same misleading message either way.
  const [capabilitiesState, setCapabilitiesState] = useState<ApiState>('loading');
  const [capabilitiesError, setCapabilitiesError] = useState<string | undefined>();
  const [state, setState] = useState<ApiState>('idle');
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    // Rule from ../README.md: if a source lacks a capability, disable that
    // filter for it rather than sending it and dropping results.
    setCapabilitiesState('loading');
    setCapabilitiesError(undefined);
    getCapabilities()
      .then((caps) => {
        setCapabilities(caps);
        setCapabilitiesState('success');
      })
      .catch((err) => {
        console.warn('[explore] capabilities fetch failed', err);
        setCapabilitiesState('error');
        setCapabilitiesError(getErrorMessage(err));
      });
  }, []);

  const hasAnySource = Object.keys(capabilities).length > 0;
  // Bug fix (2026-09-19): this checked `c.flags.location`, a key that has
  // never existed — the real flag name is `location_filter` (see
  // CAPABILITY_KEYWORDS in app/sources/mcp/capabilities.py). Reading the
  // wrong key made this permanently false, which permanently disabled the
  // Location input the moment any source was configured — a hard deadlock
  // once Location also became required (see locationRequired below): the
  // field was disabled so it could never be filled in, but handleSearch
  // still refused to submit without it.
  const anySupportsLocation = Object.values(capabilities).some((c) => c.flags?.location_filter);
  // CONTRACT.md: a source's required_filters lists filter keys its search
  // tool's own schema requires — omitting one guarantees that source
  // returns nothing (e.g. HasData's Glassdoor tool requires "location").
  const locationRequired = Object.values(capabilities).some((c) =>
    c.required_filters?.includes('location'),
  );
  const anySupportsExperience = Object.values(capabilities).some((c) => c.flags?.experience_filter);

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (locationRequired && !location) {
      setState('error');
      setError('Location is required — at least one configured source can only return results with one.');
      return;
    }
    setState('loading');
    setError(undefined);
    try {
      const filters: Record<string, unknown> = {};
      if (location) filters.location = location;
      if (postedWithinDays) filters.posted_within_days = Number(postedWithinDays);
      if (experience) filters.experience = experience;
      const found = await search({ query, filters });
      setResults(found);
      setState('success');
    } catch (err) {
      setState('error');
      setError(getErrorMessage(err));
    }
  };

  return (
    <div>
      <h1>Explore Jobs</h1>
      <p className="page-hint">
        Live search via MCP sources (<code>POST /explore/search</code>) — nothing is added to the
        Dashboard until you select results below and add them.
      </p>

      {capabilitiesState === 'loading' && <p className="empty-state">Checking configured sources…</p>}
      {capabilitiesState === 'error' && (
        <p className="empty-state">
          Could not check configured sources{capabilitiesError ? `: ${capabilitiesError}` : ''} — search may
          return no results.
        </p>
      )}
      {capabilitiesState === 'success' && !hasAnySource && (
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
          Location{locationRequired ? ' *' : ''}
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Bangalore"
            disabled={hasAnySource && !anySupportsLocation}
            required={locationRequired}
          />
        </label>
        <label>
          Posted within
          <select value={postedWithinDays} onChange={(e) => setPostedWithinDays(e.target.value)}>
            <option value="">Any time</option>
            <option value="1">Last 1 day</option>
            <option value="3">Last 3 days</option>
            <option value="7">Last 7 days</option>
          </select>
        </label>
        <label>
          Experience
          <input
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="Senior"
            disabled={hasAnySource && !anySupportsExperience}
          />
        </label>
        <button type="submit">Search</button>
      </form>

      <ApiStatus state={state} error={error} />

      <DiscoveredResults results={results} />
    </div>
  );
}
