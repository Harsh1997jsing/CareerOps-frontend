export type ApiState = 'idle' | 'loading' | 'error' | 'success';

export function ApiStatus({ state, error }: { state: ApiState; error?: string }) {
  if (state === 'loading') {
    return <div className="api-status api-status-loading">Calling API…</div>;
  }
  if (state === 'error') {
    return (
      <div className="api-status api-status-error">
        API call failed{error ? `: ${error}` : ''} — open the browser console for the request log.
      </div>
    );
  }
  if (state === 'success') {
    return <div className="api-status api-status-success">API call succeeded — see console for the request log.</div>;
  }
  return null;
}
