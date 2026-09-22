import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';

// One login screen for everyone — the server checks the admin credentials
// first, then the client (tenant) store, and tells us which matched.
export default function Login() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const role = await login(username, password);
      navigate(role === 'admin' ? '/admin' : '/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#eaf2fd,_#f5f8fd)] px-4">
      <div className="w-full max-w-sm animate-fade-up">
        <div className="mb-8 flex flex-col items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-brand-500 text-white shadow-lift">
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M2 8h1.4M5 4.8v6.4M8 2.6v10.8M11 5.6v4.8M14 7.2v1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Super Voice</h1>
          <p className="text-sm text-ink-muted">Sign in to continue</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4 p-6">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-xs font-medium text-ink-muted">
              Username
            </label>
            <input
              id="username"
              className="field w-full"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-ink-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="field w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <button type="submit" className="btn-primary w-full justify-center" disabled={submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
