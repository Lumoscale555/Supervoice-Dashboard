import { FormEvent, useState } from 'react';
import { PageHeader } from '../components/Shell';
import { Card } from '../components/ui';

export default function Settings() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMessage('');

    if (next !== confirm) {
      setStatus('error');
      setMessage('New password and confirmation do not match.');
      return;
    }
    if (next.length < 8) {
      setStatus('error');
      setMessage('New password must be at least 8 characters.');
      return;
    }
    if (!window.confirm('Update your password?')) return;

    setStatus('saving');
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message || 'Could not update password.');

      setStatus('success');
      setMessage('Password updated.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setStatus('error');
      setMessage((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader title="Settings" description="Update your password." />

      <Card title="Change password" className="max-w-md">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="current-password" className="mb-1.5 block text-xs font-medium text-ink-muted">
              Current password
            </label>
            <input
              id="current-password"
              type="password"
              autoComplete="current-password"
              className="field w-full"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-xs font-medium text-ink-muted">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="field w-full"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              minLength={8}
              required
            />
            <p className="mt-1 text-[11px] text-ink-faint">At least 8 characters.</p>
          </div>

          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-xs font-medium text-ink-muted">
              Confirm new password
            </label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              className="field w-full"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={8}
              required
            />
          </div>

          {message && (
            <p className={status === 'error' ? 'text-xs text-rose-600' : 'text-xs text-emerald-700'} role="status">
              {message}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={status === 'saving'}>
            {status === 'saving' ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </Card>
    </div>
  );
}
