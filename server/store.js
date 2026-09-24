// Picks the tenant store backend at startup: Supabase once SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set in .env, otherwise the local JSON file
// (server/data/tenants.json) so the app still runs with zero setup. Every
// caller (server/index.js) just imports from here — the two backends expose
// an identical async API.

import * as fileStore from './store.file.js';
import * as supabaseStore from './store.supabase.js';

const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

export const backend = useSupabase ? 'supabase' : 'file';
const impl = useSupabase ? supabaseStore : fileStore;

export const listTenants = impl.listTenants;
export const getTenantRaw = impl.getTenantRaw;
export const getTenantPublic = impl.getTenantPublic;
export const toPublic = impl.toPublic;
export const getTenantByUsername = impl.getTenantByUsername;
export const createTenant = impl.createTenant;
export const updateTenant = impl.updateTenant;
export const deleteTenant = impl.deleteTenant;
