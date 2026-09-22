// Days elapsed since an ISO-ish date string, or null if `value` is
// missing/unparseable. Shared by Dashboard.tsx and DiscoveredResults.tsx,
// which both format a "posted N days ago" label from CONTRACT.md's
// approximate/nullable posted_at fields — each keeps its own label
// wording, but the parse-and-diff logic itself was previously duplicated
// near-identically in both files.
export function daysSince(value?: string): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}
