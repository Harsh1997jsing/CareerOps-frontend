import { useState } from 'react';
import { saveResult } from '../api/explore';
import type { ExploreResultOut } from '../types/api';

// CONTRACT.md: ExploreResultOut.posted_at is approximate for some sources
// (e.g. derived server-side from an integer "days old" for HasData, not a
// real timestamp) and can be null when no date info was available at all.
function formatPostedAt(value?: string): string | null {
  if (!value) return null;
  const posted = new Date(value);
  if (Number.isNaN(posted.getTime())) return null;
  const days = Math.floor((Date.now() - posted.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted 1 day ago';
  return `Posted ${days} days ago`;
}

// `summary` isn't part of ExploreResultOut (Explore/Target/Job Scraping
// results never have one) — only AI Search's staged results do, batched
// server-side (see ChatSearchResultOut). Widening it here, optionally,
// lets this one shared component show it without pulling a chat-specific
// type into a component the other three pages also render.
type DiscoveredResult = ExploreResultOut & { summary?: string };

/**
 * Shared "search results → pick some → add to Dashboard" list, used by
 * Explore, Target, Job Scraping, and AI Search alike. None of those save
 * anything on their own — every result here is un-persisted until the
 * user explicitly selects it and adds it, via the shared
 * POST /explore/save route (CONTRACT.md).
 */
export function DiscoveredResults({ results }: { results: DiscoveredResult[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [bulkState, setBulkState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [bulkMessage, setBulkMessage] = useState<string | undefined>();

  const keyOf = (r: ExploreResultOut) => `${r.source}-${r.source_job_id}`;

  const toggleSelected = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectable = results.filter((r) => !savedIds.has(keyOf(r)));
    setSelected((prev) =>
      prev.size === selectable.length ? new Set() : new Set(selectable.map(keyOf)),
    );
  };

  const addOne = async (result: ExploreResultOut) => {
    try {
      const res = await saveResult(result);
      if (res.inserted) {
        setSavedIds((prev) => new Set(prev).add(keyOf(result)));
      }
      return res.inserted;
    } catch (err) {
      console.error('[discovered-results] add failed', err);
      return false;
    }
  };

  const addSelected = async () => {
    setBulkState('loading');
    setBulkMessage(undefined);
    const toAdd = results.filter((r) => selected.has(keyOf(r)));
    const outcomes = await Promise.allSettled(toAdd.map((r) => addOne(r)));
    const inserted = outcomes.filter((o) => o.status === 'fulfilled' && o.value).length;
    const failed = outcomes.filter((o) => o.status === 'rejected').length;
    setSelected(new Set());
    setBulkState(failed > 0 ? 'error' : 'idle');
    setBulkMessage(
      failed > 0
        ? `${inserted} added, ${failed} failed.`
        : `${inserted} of ${toAdd.length} added to Dashboard (rest were already there).`,
    );
  };

  if (results.length === 0) return null;

  return (
    <div>
      <div className="toolbar">
        <span>{selected.size} selected</span>
        <button type="button" disabled={selected.size === 0 || bulkState === 'loading'} onClick={addSelected}>
          Add selected to Dashboard
        </button>
        <label>
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === results.filter((r) => !savedIds.has(keyOf(r))).length}
            onChange={toggleSelectAll}
          />
          Select all
        </label>
      </div>
      {bulkMessage && <p className="empty-state">{bulkMessage}</p>}

      {results.map((result) => {
        const key = keyOf(result);
        const postedLabel = formatPostedAt(result.posted_at);
        const isSaved = savedIds.has(key);
        return (
          <div className="result-row" key={key}>
            <input
              type="checkbox"
              checked={selected.has(key)}
              disabled={isSaved}
              onChange={() => toggleSelected(key)}
            />
            <div className="result-main">
              <strong>{result.title}</strong> — {result.company} ({result.location})
              {postedLabel && <span className="posted-at"> · {postedLabel}</span>}
              <div className="result-description">
                {result.summary ?? `${result.description.slice(0, 160)}…`}
              </div>
            </div>
            <div className="result-actions">
              <span className="source-badge">{result.source}</span>
              <button type="button" onClick={() => window.open(result.url, '_blank', 'noreferrer')}>
                Apply
              </button>
              <button type="button" className="secondary" disabled={isSaved} onClick={() => addOne(result)}>
                {isSaved ? 'Added' : 'Add to Dashboard'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
