import { useState, type FormEvent } from 'react';
import { scrapeJobspy } from '../api/scrape';
import { ApiError } from '../api/client';
import { ApiStatus, type ApiState } from '../components/ApiStatus';
import { DiscoveredResults } from '../components/DiscoveredResults';
import type { ExploreResultOut } from '../types/api';

// Mirrors the backend's ALLOWED_SITES (app/sources/jobspy_source.py) —
// LinkedIn is never an option here, CLAUDE.md rule 2.
const SITES = ['indeed', 'glassdoor', 'naukri', 'zip_recruiter', 'google'];

export function JobScraping() {
  const [searchTerm, setSearchTerm] = useState('');
  const [location, setLocation] = useState('');
  const [sites, setSites] = useState<Set<string>>(new Set(SITES));
  const [state, setState] = useState<ApiState>('idle');
  const [error, setError] = useState<string | undefined>();
  const [results, setResults] = useState<ExploreResultOut[]>([]);

  const toggleSite = (site: string) => {
    setSites((prev) => {
      const next = new Set(prev);
      if (next.has(site)) next.delete(site);
      else next.add(site);
      return next;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setState('loading');
    setError(undefined);
    try {
      const found = await scrapeJobspy({
        search_term: searchTerm,
        location: location || undefined,
        sites: Array.from(sites),
      });
      setResults(found);
      setState('success');
    } catch (err) {
      setState('error');
      setError(err instanceof ApiError ? err.message : 'Unknown error');
    }
  };

  return (
    <div>
      <h1>Job Scraping</h1>
      <p className="page-hint">
        Multi-site scrape (Glassdoor, Naukri, Indeed, ZipRecruiter, Google) via JobSpy — a scrape
        can take up to 90 seconds. Nothing is added to the Dashboard until you select results
        below and add them.
      </p>

      <form className="toolbar" onSubmit={handleSubmit}>
        <label>
          Search term
          <input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="backend engineer" required />
        </label>
        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Bangalore" />
        </label>
        <fieldset>
          <legend>Sites</legend>
          {SITES.map((site) => (
            <label key={site}>
              <input type="checkbox" checked={sites.has(site)} onChange={() => toggleSite(site)} />
              {site}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={state === 'loading' || sites.size === 0}>
          {state === 'loading' ? 'Scraping…' : 'Scrape'}
        </button>
      </form>

      <ApiStatus state={state} error={error} />

      <DiscoveredResults results={results} />
    </div>
  );
}
