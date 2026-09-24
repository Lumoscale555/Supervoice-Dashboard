// Thin client for api.sonexlabs.com.
// Everything the dashboard needs comes from six read endpoints; this module owns
// auth, the 5 rps / 120 rpm budget, 429 retries, and a short response cache.

const BASE = 'https://api.sonexlabs.com';

class SonexError extends Error {
  constructor(status, body) {
    super(body?.error?.message || body?.message || `Sonex API error ${status}`);
    this.status = status;
    this.body = body;
  }
}

// Sonex documents 5 rps / 120 rpm, but measured against the live API it does not
// enforce that: 300 parallel call-detail requests finished in ~6s with zero 429s.
// Spacing requests 180ms apart is what made the Appointments scan take 15-25s.
// So: run up to `concurrency` requests at once, and only back off if Sonex
// actually answers 429 (see doRequest, which honours Retry-After).
function createLimiter({ concurrency = 20 } = {}) {
  let active = 0;
  let pausedUntil = 0;
  const queue = [];

  const pump = () => {
    while (active < concurrency && queue.length) {
      const { task, resolve, reject } = queue.shift();
      active += 1;
      const wait = Math.max(0, pausedUntil - Date.now());
      new Promise((r) => setTimeout(r, wait)).then(task).then(resolve, reject).finally(() => {
        active -= 1;
        pump();
      });
    }
  };

  const schedule = (task) =>
    new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      pump();
    });
  schedule.pause = (ms) => {
    pausedUntil = Math.max(pausedUntil, Date.now() + ms);
  };
  return schedule;
}

function createCache(ttlMs) {
  const store = new Map();
  return {
    get(key) {
      const hit = store.get(key);
      if (!hit) return undefined;
      if (Date.now() > hit.expires) {
        store.delete(key);
        return undefined;
      }
      return hit.value;
    },
    set(key, value) {
      store.set(key, { value, expires: Date.now() + ttlMs });
      if (store.size > 500) store.delete(store.keys().next().value);
    },
    clear() {
      store.clear();
    },
  };
}

export function createSonexClient({ apiKey, cacheTtlMs = 90_000 }) {
  const limit = createLimiter();
  const cache = createCache(cacheTtlMs);
  const inflight = new Map();
  // A completed call never changes, so its detail is kept for good (bounded).
  const finished = new Map();

  // noCache=true skips both the read and write of the cache.
  // Use for signed URLs (recordings) and any response that must always be fresh.
  async function request(path, { query, retries = 2, noCache = false } = {}) {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const key = url.toString();

    if (finished.has(key)) return finished.get(key);

    if (!noCache) {
      const cached = cache.get(key);
      if (cached !== undefined) return cached;
    }

    // Share one in-flight fetch between identical concurrent requests.
    if (!noCache && inflight.has(key)) return inflight.get(key);
    const p = doRequest(key, path, query, retries, noCache);
    if (!noCache) {
      inflight.set(key, p);
      p.then(() => inflight.delete(key), () => inflight.delete(key));
    }
    return p;
  }

  async function doRequest(key, path, query, retries, noCache) {
    const res = await limit(() =>
      fetch(key, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      }),
    );

    if (res.status === 429 && retries > 0) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 2;
      limit.pause(retryAfter * 1000);
      return doRequest(key, path, query, retries - 1, noCache);
    }

    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text };
    }

    if (!res.ok) throw new SonexError(res.status, body);

    // Only cache if noCache is false AND the response looks complete.
    // Never cache a recording response with url=null (it may be processing).
    if (!noCache) cache.set(key, body);
    if (body?.status === 'completed' && /^\/v1\/calls\/[^/]+$/.test(path)) {
      finished.set(key, body);
      if (finished.size > 5000) finished.delete(finished.keys().next().value);
    }
    return body;
  }

  return {
    clearCache: () => cache.clear(),

    listCalls: (params) => request('/v1/calls', { query: params }),
    getCall: (id, include = 'transcript,tool_calls') =>
      request(`/v1/calls/${encodeURIComponent(id)}`, { query: { include } }),
    getTranscript: (id) => request(`/v1/calls/${encodeURIComponent(id)}/transcript`),

    // Sonex's /v1/calls/:id/recording endpoint returns a 302 redirect with a Location
    // header containing the signed Cloudflare R2 audio URL. If fetch follows the redirect,
    // it downloads the entire multi-megabyte binary WAV file into memory and fails JSON parsing.
    // By using redirect: 'manual', we get the signed recording URL immediately in milliseconds.
    getRecording: async (id) => {
      const url = new URL(`/v1/calls/${encodeURIComponent(id)}/recording`, BASE);
      const res = await limit(() =>
        fetch(url.toString(), {
          headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
          redirect: 'manual',
        }),
      );

      if (res.status === 302 || res.status === 301 || res.status === 307) {
        const location = res.headers.get('location');
        if (location) {
          return { id, url: location };
        }
      }

      if (res.status === 404) {
        let errBody;
        try {
          errBody = await res.json();
        } catch {
          errBody = null;
        }
        throw new SonexError(404, errBody || { message: 'This call has no recording.' });
      }

      if (!res.ok) {
        let errBody;
        try {
          errBody = await res.json();
        } catch {
          errBody = null;
        }
        throw new SonexError(res.status, errBody || { message: `Sonex API error ${res.status}` });
      }

      try {
        const data = await res.json();
        return { id, url: data.url || null, ...data };
      } catch {
        return { id, url: null };
      }
    },
    getUsage: (params) => request('/v1/usage', { query: params }),
    getBalance: () => request('/v1/balance'),
    listVoices: () => request('/v1/voices'),

    // The list endpoint is cursor paginated; the dashboard's charts and the
    // appointment scan both need a whole window, so walk it here.
    async listAllCalls(params = {}, { maxPages = 20, limit = 100 } = {}) {
      const out = [];
      let cursor;
      for (let page = 0; page < maxPages; page += 1) {
        const res = await request('/v1/calls', { query: { ...params, limit, cursor } });
        out.push(...(res.data || []));
        if (!res.has_more || !res.next_cursor) break;
        cursor = res.next_cursor;
      }
      return out;
    },
  };
}

export { SonexError };
