// In-memory call mirror, one per tenant.
//
// Sonex has no aggregate endpoint: every dashboard number needs the raw call
// list, and that list is cursor-paginated (100 per page, one page at a time, at
// most ~5 requests/second). Walking it on every page view is what made Overview,
// Billing, Calls and Appointments take 10s+.
//
// Instead, each tenant's calls are pulled once, kept in memory, and every page
// filters that copy locally (sub-millisecond). After that only new/changed calls
// are fetched, in the background (stale-while-revalidate).
//
// `coveredFrom` is the earliest instant already synced, so switching from
// "Month" to "90 days" only fetches the extra 60 days.

const FRESH_MS = 20_000; // younger than this: serve as-is
const HARD_STALE_MS = 5 * 60_000; // older than this: wait for a refresh before serving
const OVERLAP_MS = 2 * 3600_000; // re-fetch the last 2h so in-progress calls settle
const MAX_PAGES = 50;

const mirrors = new Map(); // tenantId -> mirror
const iso = (ms) => new Date(ms).toISOString();

function mirrorFor(tenantId) {
  let m = mirrors.get(tenantId);
  if (!m) {
    m = { calls: new Map(), coveredFrom: null, syncedAt: 0, chain: Promise.resolve(), refreshing: null };
    mirrors.set(tenantId, m);
  }
  return m;
}

// Serialise syncs per tenant so concurrent page loads share the work.
function serialize(m, fn) {
  const result = m.chain.then(fn, fn);
  m.chain = result.then(() => {}, () => {});
  return result;
}

function merge(m, rows) {
  for (const c of rows) m.calls.set(c.id, c);
}

async function extendBack(m, client, fromMs) {
  if (m.coveredFrom !== null && fromMs >= m.coveredFrom) return; // another request already did it
  const endMs = m.coveredFrom ?? Date.now();
  const rows = await client.listAllCalls(
    { started_after: iso(fromMs), started_before: iso(endMs) },
    { maxPages: MAX_PAGES },
  );
  merge(m, rows);
  m.coveredFrom = fromMs;
  if (!m.syncedAt) m.syncedAt = Date.now();
}

async function refresh(m, client) {
  let newest = 0;
  for (const c of m.calls.values()) newest = Math.max(newest, Date.parse(c.started_at) || 0);
  const since = Math.max(newest - OVERLAP_MS, m.coveredFrom ?? 0);
  const rows = await client.listAllCalls({ started_after: iso(since) }, { maxPages: 10 });
  merge(m, rows);
  m.syncedAt = Date.now();
}

function refreshInBackground(m, client) {
  if (m.refreshing) return m.refreshing;
  m.refreshing = serialize(m, () => refresh(m, client))
    .catch((err) => console.warn('[mirror] background refresh failed:', err.message))
    .finally(() => {
      m.refreshing = null;
    });
  return m.refreshing;
}

/**
 * Calls for a tenant between two ISO instants, newest first.
 * `client` must be the tenant-scoped client.
 */
export async function getCalls(tenant, client, { from, to }) {
  const m = mirrorFor(tenant.id);
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);

  if (m.coveredFrom === null || fromMs < m.coveredFrom) {
    await serialize(m, () => extendBack(m, client, fromMs));
  }

  const age = Date.now() - m.syncedAt;
  if (age > HARD_STALE_MS) await refreshInBackground(m, client);
  else if (age > FRESH_MS) refreshInBackground(m, client);

  const out = [];
  for (const c of m.calls.values()) {
    const t = Date.parse(c.started_at);
    if (t >= fromMs && t <= toMs) out.push(c);
  }
  return out.sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

export function clearMirror(tenantId) {
  mirrors.delete(tenantId);
}

// On a long-running server, keep every mirror warm so requests never wait.
// (Vercel's serverless functions are frozen between requests; there the
// stale-while-revalidate path in getCalls does the work instead.)
export function startMirrorWarmer(getClient) {
  const timer = setInterval(async () => {
    for (const [tenantId, m] of mirrors) {
      try {
        const client = await getClient(tenantId);
        if (client) await refreshInBackground(m, client);
      } catch {
        /* tenant deleted or key removed */
      }
    }
  }, FRESH_MS);
  timer.unref?.();
}
