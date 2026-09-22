import { useCallback, useEffect, useRef, useState } from 'react';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function api<T>(path: string, params?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const url = new URL(path, window.location.origin);
  for (const [k, v] of Object.entries(params || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }

  const res = await fetch(url.toString(), { signal });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(body?.error?.message || `Request failed (${res.status})`, res.status);
  }
  return body as T;
}

export interface Query<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True only on the first load, so refreshes don't blank the page out. */
  initial: boolean;
  refresh: () => void;
}

/**
 * Minimal data hook: fetch on mount and whenever `params` change, keep the last
 * good value visible while refetching, and drop responses that lost a race.
 */
export function useQuery<T>(path: string | null, params?: Record<string, unknown>): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [nonce, setNonce] = useState(0);

  const key = JSON.stringify([path, params]);
  const latest = useRef(0);

  useEffect(() => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    const ticket = ++latest.current;
    const controller = new AbortController();

    setLoading(true);
    api<T>(path, params, controller.signal)
      .then((result) => {
        if (ticket !== latest.current) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => {
        if (ticket !== latest.current || (err as Error).name === 'AbortError') return;
        setError((err as Error).message);
      })
      .finally(() => {
        if (ticket === latest.current) setLoading(false);
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, initial: loading && data === null, refresh };
}
