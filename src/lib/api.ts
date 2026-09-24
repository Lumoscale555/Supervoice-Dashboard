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

// ---------------------------------------------------------------------------
// SSE streaming hook — calls a /stream endpoint and merges pages of data in
// real-time, so the UI can show the first page in milliseconds while the
// server is still fetching subsequent pages from Sonex.
// ---------------------------------------------------------------------------

export interface StreamState<T> {
  /** All items accumulated so far across all streamed pages. */
  items: T[];
  /** Extra top-level fields from the last streamed chunk (totals, range, etc.). */
  meta: Record<string, unknown>;
  error: string | null;
  /** True while the connection is open and no 'done' event has arrived. */
  streaming: boolean;
  /** True only before the very first chunk — use this to show a skeleton. */
  initial: boolean;
  refresh: () => void;
}

export function useStreamQuery<T>(
  path: string | null,
  params?: Record<string, unknown>,
  /** Name of the array key inside each chunk (default: 'data'). */
  itemsKey = 'data',
): StreamState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(Boolean(path));
  const [nonce, setNonce] = useState(0);
  const hadFirst = useRef(false);
  const [initial, setInitial] = useState(Boolean(path));

  useEffect(() => {
    if (!path) {
      setItems([]);
      setMeta({});
      setStreaming(false);
      setInitial(false);
      return;
    }
    hadFirst.current = false;
    setItems([]);
    setMeta({});
    setError(null);
    setStreaming(true);
    setInitial(true);

    const url = new URL(path, window.location.origin);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }

    const ctrl = new AbortController();
    let buffer = '';

    fetch(url.toString(), { signal: ctrl.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.message || `Request failed (${res.status})`);
        }
        const reader = res.body!.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith('data:')) continue;
            const json = line.slice(5).trim();
            if (!json) continue;
            let evt: Record<string, unknown>;
            try { evt = JSON.parse(json); } catch { continue; }

            if (evt.event === 'done') {
              setStreaming(false);
              return;
            }
            if (evt.event === 'error') {
              setError(String(evt.message || 'Stream error'));
              setStreaming(false);
              return;
            }
            // Regular data chunk
            const chunk = evt.chunk as Record<string, unknown> | undefined;
            if (!chunk) continue;
            const newItems = (chunk[itemsKey] as T[] | undefined) ?? [];
            if (!hadFirst.current) {
              hadFirst.current = true;
              setInitial(false);
            }
            setItems((prev) => [...prev, ...newItems]);
            // Merge all non-items keys into meta
            const { [itemsKey]: _omit, ...rest } = chunk;
            setMeta((prev) => ({ ...prev, ...rest }));
          }
        }
        setStreaming(false);
      })
      .catch((err: unknown) => {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message);
        setStreaming(false);
        setInitial(false);
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, JSON.stringify(params), itemsKey, nonce]);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  return { items, meta, error, streaming, initial, refresh };
}
