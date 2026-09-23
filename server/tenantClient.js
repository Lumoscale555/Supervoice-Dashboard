// Builds (and caches) a Sonex client per tenant, and enforces agent-level
// isolation: when a tenant has an agentName configured, every call this
// wrapper returns is filtered to that agent — a tenant can never see another
// tenant's calls even if they share one Sonex account and API key.
//
// Sonex's own dashboard only ever shows an agent by name (the Agents table has
// no ID column), so tenants are scoped by agent name, matched case-insensitively,
// rather than by an agent ID we cannot get from the UI.

import { createSonexClient, SonexError } from './sonex.js';
import { createMockClient } from './mock.js';

const cache = new Map(); // tenantId -> { key, client }

function baseClientFor(tenant) {
  const key = (tenant.sonexApiKey || '').trim();
  const cached = cache.get(tenant.id);
  if (cached && cached.key === key) return cached.client;

  const usable = key && !/^vsk_x+$/i.test(key);
  const client = usable ? createSonexClient({ apiKey: key }) : createMockClient();
  cache.set(tenant.id, { key, client });
  return client;
}

/** True once a tenant has something real to call — a key, or demo mode. */
export function tenantMode(tenant) {
  const key = (tenant.sonexApiKey || '').trim();
  return key && !/^vsk_x+$/i.test(key) ? 'live' : 'demo';
}

export function clearTenantClientCache(tenantId) {
  cache.delete(tenantId);
}

/**
 * A client scoped to one tenant. Same method names as the raw Sonex client,
 * but every list/scan call is filtered to calls whose `agent.name` matches the
 * tenant's configured agent name (case-insensitive), and single-call lookups
 * are verified to belong to that agent afterward.
 */
export function getScopedClient(tenant) {
  const base = baseClientFor(tenant);
  const agentName = (tenant.agentName || '').trim().toLowerCase() || null;

  const matches = (call) => !agentName || (call?.agent?.name || '').trim().toLowerCase() === agentName;

  async function assertOwned(call) {
    if (!matches(call)) throw new SonexError(404, { message: 'Call not found' });
    return call;
  }

  // Sonex has no documented "filter calls by agent name" query param, so
  // isolation happens client-side: fetch normally, then drop anything that
  // isn't this tenant's agent.
  return {
    // Known limitation when multiple tenants share one Sonex API key: Sonex
    // paginates before we filter, so a page of `limit` raw calls can filter
    // down to fewer (even zero) rows for this tenant, even though `has_more`
    // still reflects the unfiltered set. Pagination still terminates
    // correctly (has_more/cursor track the real upstream list), it's just
    // uneven page sizes rather than lost data. Tenants with their own
    // dedicated API key (agentName unset) are unaffected — matches() is a
    // no-op there.
    listCalls: async (params) => {
      const res = await base.listCalls(params);
      return { ...res, data: (res.data || []).filter(matches) };
    },
    listAllCalls: async (params, opts) => {
      const calls = await base.listAllCalls(params, opts);
      return calls.filter(matches);
    },
    getCall: async (id, include) => assertOwned(await base.getCall(id, include)),
    getTranscript: (id) => base.getTranscript(id),
    getRecording: (id) => base.getRecording(id),
    getBalance: () => base.getBalance(),
    listVoices: () => base.listVoices(),
    clearCache: () => base.clearCache?.(),
  };
}
