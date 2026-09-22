import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api';
import type { AuthMe } from './types';

// One login screen, one session. The server decides whether the credentials
// matched the admin account or a tenant and tells us which; we just route
// accordingly. No separate "admin login" UI.

type Session = { role: 'admin' } | ({ role: 'client' } & AuthMe) | { role: null };

interface SessionState {
  session: Session | null; // null while the initial check is in flight
  login: (username: string, password: string) => Promise<'admin' | 'client'>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await api<Session>('/api/session');
      setSession(result);
    } catch {
      setSession({ role: null });
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (username: string, password: string) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error?.message || 'Could not sign in.');
      await refresh();
      return body.role as 'admin' | 'client';
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setSession({ role: null });
  }, []);

  return <SessionContext.Provider value={{ session, login, logout, refresh }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}
