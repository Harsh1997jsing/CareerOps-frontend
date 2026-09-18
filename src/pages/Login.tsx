import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [tenantSlug, setTenantSlug] = useState('default');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email, password, tenant_slug: tenantSlug });
      navigate('/');
    } catch (err) {
      // CONTRACT.md: 429 on login → "too many attempts, try again in a few
      // minutes", no auto-retry.
      if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts, try again in a few minutes.');
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Login failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>CareerOps</h1>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <label>
          Tenant
          <input value={tenantSlug} onChange={(e) => setTenantSlug(e.target.value)} type="text" />
        </label>
        {error && <div className="api-status api-status-error">{error}</div>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
