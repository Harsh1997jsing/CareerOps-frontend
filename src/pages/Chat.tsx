import { useEffect, useState, type FormEvent } from 'react';
import { getStagedResults, sendMessage } from '../api/chat';
import { getErrorMessage } from '../api/client';
import { ApiStatus, type ApiState } from '../components/ApiStatus';
import { DiscoveredResults } from '../components/DiscoveredResults';
import type { ChatSearchResultOut } from '../types/api';

const SESSION_KEY = 'careerops_chat_session_id';

function getOrCreateSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export function Chat() {
  const [sessionId] = useState(getOrCreateSessionId);
  const [turns, setTurns] = useState<ChatTurn[]>([
    { role: 'assistant', content: "Tell me what kind of role you're looking for." },
  ]);
  const [input, setInput] = useState('');
  const [knownFilters, setKnownFilters] = useState<Record<string, unknown>>({});
  const [results, setResults] = useState<ChatSearchResultOut[]>([]);
  const [state, setState] = useState<ApiState>('idle');
  const [error, setError] = useState<string | undefined>();
  const [restoreState, setRestoreState] = useState<ApiState>('loading');
  const [restoreError, setRestoreError] = useState<string | undefined>();

  // Restores results staged by an earlier turn (e.g. after a page refresh)
  // without resending anything through the model — GET /chat/results is
  // plain staged-row lookup, not a chat turn. Previously silent on
  // failure (console.warn only) — a real failure here looked identical to
  // "nothing was ever staged", with no way to tell the two apart or retry.
  useEffect(() => {
    setRestoreState('loading');
    setRestoreError(undefined);
    getStagedResults(sessionId)
      .then((staged) => {
        setResults(staged);
        setRestoreState('success');
      })
      .catch((err) => {
        console.warn('[chat] could not restore staged results', err);
        setRestoreState('error');
        setRestoreError(getErrorMessage(err));
      });
  }, [sessionId]);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    const message = input.trim();
    if (!message) return;

    setTurns((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    setState('loading');
    setError(undefined);

    try {
      const response = await sendMessage({ session_id: sessionId, message, known_filters: knownFilters });
      setTurns((prev) => [...prev, { role: 'assistant', content: response.reply }]);
      setKnownFilters(response.filters);
      if (response.ready) setResults(response.results);
      setState('success');
    } catch (err) {
      setState('error');
      setError(getErrorMessage(err));
      setTurns((prev) => [...prev, { role: 'assistant', content: "Sorry, that search didn't go through." }]);
    }
  };

  return (
    <div>
      <h1>AI Search</h1>
      <p className="page-hint">
        Describe what you're looking for — filters are pulled out of the conversation for you,
        and the assistant picks which source(s) to search (<code>POST /chat/message</code>).
        Nothing is added to the Dashboard until you select results below and add them.
      </p>

      {(restoreState === 'loading' || restoreState === 'error') && (
        <ApiStatus state={restoreState} error={restoreError} />
      )}

      <div className="chat-transcript">
        {turns.map((turn, i) => (
          <div key={i} className={`chat-turn chat-turn-${turn.role}`}>
            <strong>{turn.role === 'user' ? 'You' : 'Assistant'}:</strong> {turn.content}
          </div>
        ))}
      </div>

      <form className="toolbar" onSubmit={handleSend}>
        <label style={{ flex: 1 }}>
          Message
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Senior backend roles in Bangalore, posted this week"
            disabled={state === 'loading'}
          />
        </label>
        <button type="submit" disabled={state === 'loading' || !input.trim()}>
          {state === 'loading' ? 'Thinking…' : 'Send'}
        </button>
      </form>

      <ApiStatus state={state} error={error} />

      <DiscoveredResults results={results} />
    </div>
  );
}
