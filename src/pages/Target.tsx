import { useEffect, useState } from 'react';
import { listTargets, searchTargets } from '../api/targets';
import { getErrorMessage } from '../api/client';
import { ApiStatus, type ApiState } from '../components/ApiStatus';
import { DiscoveredResults } from '../components/DiscoveredResults';
import type { CompanyTargetOut, ExploreResultOut } from '../types/api';

export function Target() {
  const [targets, setTargets] = useState<CompanyTargetOut[]>([]);
  const [listState, setListState] = useState<ApiState>('idle');
  const [listError, setListError] = useState<string | undefined>();
  const [results, setResults] = useState<ExploreResultOut[]>([]);
  const [searchState, setSearchState] = useState<ApiState>('idle');
  const [searchError, setSearchError] = useState<string | undefined>();
  const [experience, setExperience] = useState('');

  useEffect(() => {
    setListState('loading');
    listTargets()
      .then((result) => {
        setTargets(result);
        setListState('success');
      })
      .catch((err) => {
        setListState('error');
        setListError(getErrorMessage(err));
      });
  }, []);

  const handleSearch = async () => {
    setSearchState('loading');
    setSearchError(undefined);
    try {
      const found = await searchTargets(experience || undefined);
      setResults(found);
      setSearchState('success');
    } catch (err) {
      setSearchState('error');
      setSearchError(getErrorMessage(err));
    }
  };

  return (
    <div>
      <h1>Target</h1>
      <p className="page-hint">
        Manual company targets — Greenhouse / Lever board search, from <code>GET /targets</code>{' '}
        and <code>POST /targets/search</code>. Nothing is added to the Dashboard until you select
        results below and add them.
      </p>

      <ApiStatus state={listState} error={listError} />

      {listState === 'success' && targets.length === 0 && (
        <p className="empty-state">
          No company targets configured — add entries to the backend's{' '}
          <code>data/companies.yaml</code> before searching.
        </p>
      )}

      {targets.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Company</th>
              <th>Identifier</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => (
              <tr key={`${t.source}-${t.identifier}`}>
                <td>{t.source}</td>
                <td>{t.company}</td>
                <td>{t.identifier}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="toolbar">
        <label>
          Experience
          <input
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            placeholder="Senior"
            title="Matched against each posting's title/description — Greenhouse/Lever expose no structured experience field."
          />
        </label>
        <button type="button" onClick={handleSearch} disabled={searchState === 'loading' || targets.length === 0}>
          {searchState === 'loading' ? 'Searching…' : 'Search'}
        </button>
      </div>

      <ApiStatus state={searchState} error={searchError} />

      <DiscoveredResults results={results} />
    </div>
  );
}
