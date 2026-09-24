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

// The documented budget is 5 requests/second and 120/minute per tenant. We stay
// under both by spacing requests ~180ms apart through a single queue, so a burst
// of call-detail lookups can never trip a 429 on its own.
function createLimiter({ minIntervalMs = 180, perMinute = 110 } = {}) {
  let chain = Promise.resolve();
  let last = 0;
  let window = [];

  return function schedule(task) {
    const run = async () => {
      const now = Date.now();
      window = window.filter((t) => now - t < 60_000);
      let wait = Math.max(0, last + minIntervalMs - now);
      if (window.length >= perMinute) {
        wait = Math.max(wait, 60_000 - (now - window[0]));
      }
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      last = Date.now();
      window.push(last);
      return task();
    };
    const result = chain.then(run, run);
    chain = result.then(() => {}, () => {});
    return result;
  };
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

export function createSonexClient({ apiKey, cacheTtlMs = 30_000 }) {
  const limit = createLimiter();
  const cache = createCache(cacheTtlMs);

  async function request(path, { query, retries = 2 } = {}) {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(query || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const key = url.toString();
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const res = await limit(() =>
      fetch(key, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      }),
    );

    if (res.status === 429 && retries > 0) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 2;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      return request(path, { query, retries: retries - 1 });
    }

    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { message: text };
    }
    if (!res.ok) throw new SonexError(res.status, body);

    cache.set(key, body);
    return body;
  }

  return {
    clearCache: () => cache.clear(),

    listCalls: (params) => request('/v1/calls', { query: params }),
    getCall: (id, include = 'transcript,tool_calls') =>
      request(`/v1/calls/${encodeURIComponent(id)}`, { query: { include } }),
    getTranscript: (id) => request(`/v1/calls/${encodeURIComponent(id)}/transcript`),
    getRecording: (id) => request(`/v1/calls/${encodeURIComponent(id)}/recording`),
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
