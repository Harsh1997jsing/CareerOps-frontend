import { useState } from 'react';
import { getErrorMessage } from '../api/client';
import { saveResult } from '../api/explore';
import type { ExploreResultOut } from '../types/api';
import { daysSince } from '../utils/date';

// CONTRACT.md: ExploreResultOut.posted_at is approximate for some sources
// (e.g. derived server-side from an integer "days old" for HasData, not a
// real timestamp) and can be null when no date info was available at all.
function formatPostedAt(value?: string): string | null {
  const days = daysSince(value);
  if (days == null) return null;
  if (days <= 0) return 'Posted today';
  if (days === 1) return 'Posted 1 day ago';
  return `Posted ${days} days ago`;
}

// `summary`/`id` aren't part of ExploreResultOut (Explore/Target/Job
// Scraping results never have either) — only AI Search's staged results
// do (ChatSearchResultOut). Widening them here, optionally, lets this one
// shared component use them without pulling a chat-specific type into a
// component the other three pages also render.
type DiscoveredResult = ExploreResultOut & { id?: number; summary?: string };

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
  // Tracks rows with an in-flight POST /explore/save — without it, a fast
  // double-click on "Add to Dashboard" fires two concurrent identical
  // requests before the first response arrives (isSaved alone only
  // disables the row *after* a round trip completes).
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  // A single-row add failure previously only logged to console.error —
  // indistinguishable in the UI from the button just... not doing
  // anything. Keyed per-row rather than one shared banner, since several
  // rows can be in flight (via bulk add) at once.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [bulkState, setBulkState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [bulkMessage, setBulkMessage] = useState<string | undefined>();

  // AI Search's staged rows have a stable database id — prefer it over
  // source-source_job_id (which is only a de-facto-unique pairing for
  // the other three pages, never guaranteed unique within one AI Search
  // result set the way a primary key is).
  const keyOf = (r: DiscoveredResult) => (r.id != null ? `chat-${r.id}` : `${r.source}-${r.source_job_id}`);

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

  const addOne = async (result: DiscoveredResult) => {
    const key = keyOf(result);
    if (savingIds.has(key) || savedIds.has(key)) return false;
    setSavingIds((prev) => new Set(prev).add(key));
    setRowErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    try {
      const res = await saveResult(result);
      if (res.inserted) {
        setSavedIds((prev) => new Set(prev).add(key));
      }
      // Either way this row is now resolved (inserted, or already there)
      // — drop it from `selected` so the "select all" checkbox's checked
      // math stays correct and a later bulk-add doesn't redundantly
      // re-POST a row this row's own button already handled.
      setSelected((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return res.inserted;
    } catch (err) {
      console.error('[discovered-results] add failed', err);
      setRowErrors((prev) => ({ ...prev, [key]: getErrorMessage(err) }));
      return false;
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
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
        : `${inserted} of ${toAdd.length} added to Dashboard and queued for analysis (rest were already there).`,
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
        const isSaving = savingIds.has(key);
        return (
          <div className="result-row" key={key}>
            <input
              type="checkbox"
              checked={selected.has(key)}
              disabled={isSaved || isSaving}
              onChange={() => toggleSelected(key)}
            />
            <div className="result-main">
              <strong>{result.title}</strong> — {result.company} ({result.location})
              {postedLabel && <span className="posted-at"> · {postedLabel}</span>}
              <div className="result-description">
                {result.summary ?? `${result.description.slice(0, 160)}…`}
              </div>
              {rowErrors[key] && <p className="api-status api-status-error">Could not add: {rowErrors[key]}</p>}
            </div>
            <div className="result-actions">
              <span className="source-badge">{result.source}</span>
              <button type="button" onClick={() => window.open(result.url, '_blank', 'noreferrer')}>
                Apply
              </button>
              <button
                type="button"
                className="secondary"
                disabled={isSaved || isSaving}
                onClick={() => addOne(result)}
                title={isSaved ? 'Fit analysis runs automatically — check the Dashboard shortly.' : undefined}
              >
                {isSaved ? 'Added' : isSaving ? 'Adding…' : 'Add to Dashboard'}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
