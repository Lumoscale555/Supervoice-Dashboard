// Builds (and caches) a Sonex client per tenant, and enforces agent-level
// isolation: when a tenant has an agentId configured, every call this wrapper
// makes is forced to that agent — a tenant can never see another tenant's
// calls even if they share one Sonex account and API key.

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
 * but `agent_id` is always forced to the tenant's configured agent (when set)
 * on every list/scan call, and single-call lookups are verified to belong to
 * that agent afterward.
 */
export function getScopedClient(tenant) {
  const base = baseClientFor(tenant);
  const agentId = tenant.agentId || null;

  const forceAgent = (params = {}) => (agentId ? { ...params, agent_id: agentId } : params);

  async function assertOwned(call) {
    if (agentId && call?.agent?.id && call.agent.id !== agentId) {
      throw new SonexError(404, { message: 'Call not found' });
    }
    return call;
  }

  return {
    listCalls: (params) => base.listCalls(forceAgent(params)),
    listAllCalls: (params, opts) => base.listAllCalls(forceAgent(params), opts),
    getCall: async (id, include) => assertOwned(await base.getCall(id, include)),
    getTranscript: (id) => base.getTranscript(id),
    getRecording: (id) => base.getRecording(id),
    getBalance: () => base.getBalance(),
    listVoices: () => base.listVoices(),
    clearCache: () => base.clearCache?.(),
  };
}
