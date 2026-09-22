// Supabase-backed tenant store. Active once SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set in .env — run server/supabase.sql once
// against that project first to create the `tenants` table.
//
// Uses the service-role key because this runs server-side only (never sent
// to the browser) and needs to read/write every tenant regardless of RLS —
// row isolation between clients is enforced in application code
// (server/tenantClient.js), same as with the file store.

import { createClient } from '@supabase/supabase-js';
import { hashPassword } from './crypto.js';

// This module is imported unconditionally by server/store.js so it can be
// switched to at runtime — guard the client construction with placeholders so
// importing it never throws when Supabase isn't configured. store.js only
// ever calls into these functions once SUPABASE_URL/KEY are actually set.
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://placeholder.invalid',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-key',
  { auth: { persistSession: false } },
);

const TABLE = 'tenants';

// snake_case in Postgres <-> camelCase in the app.
function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    username: row.username,
    passwordHash: row.password_hash,
    sonexApiKey: row.sonex_api_key || '',
    agentId: row.agent_id,
    agentName: row.agent_name,
    clientRateInrPerMin: Number(row.client_rate_inr_per_min),
    providerCostInrPerMin: Number(row.provider_cost_inr_per_min),
    pulseSeconds: Number(row.pulse_seconds),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPublic(t) {
  const { passwordHash, sonexApiKey, ...rest } = t;
  return {
    ...rest,
    hasApiKey: Boolean(sonexApiKey),
    apiKeyPreview: sonexApiKey ? `${sonexApiKey.slice(0, 7)}…${sonexApiKey.slice(-4)}` : null,
  };
}

function fail(error, fallbackMessage, status = 502) {
  throw Object.assign(new Error(error?.message || fallbackMessage), { status });
}

export async function listTenants() {
  const { data, error } = await supabase.from(TABLE).select('*').order('created_at', { ascending: false });
  if (error) fail(error, 'Could not load clients.');
  return data.map((row) => toPublic(fromRow(row)));
}

export async function getTenantRaw(id) {
  if (!id) return null;
  const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
  if (error) fail(error, 'Could not load client.');
  return data ? fromRow(data) : null;
}

export async function getTenantPublic(id) {
  const t = await getTenantRaw(id);
  return t ? toPublic(t) : null;
}

export async function getTenantByUsername(username) {
  const { data, error } = await supabase.from(TABLE).select('*').ilike('username', username).maybeSingle();
  if (error) fail(error, 'Could not look up client.');
  return data ? fromRow(data) : null;
}

export async function createTenant(input) {
  if (!input.name || !input.username || !input.password) {
    throw Object.assign(new Error('name, username and password are required.'), { status: 400 });
  }
  if (await getTenantByUsername(input.username)) {
    throw Object.assign(new Error('That username is already taken.'), { status: 409 });
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      name: input.name,
      username: input.username,
      password_hash: hashPassword(input.password),
      sonex_api_key: (input.sonexApiKey || '').trim(),
      agent_id: input.agentId || null,
      agent_name: input.agentName || null,
      client_rate_inr_per_min: Number(input.clientRateInrPerMin) || 5,
      provider_cost_inr_per_min: Number(input.providerCostInrPerMin) || 2.5,
      pulse_seconds: Number(input.pulseSeconds) || 30,
    })
    .select('*')
    .single();

  if (error) fail(error, 'Could not create client.');
  return toPublic(fromRow(data));
}

export async function updateTenant(id, patch) {
  const existing = await getTenantRaw(id);
  if (!existing) return null;

  if (patch.username !== undefined && patch.username !== existing.username) {
    const clash = await getTenantByUsername(patch.username);
    if (clash && clash.id !== id) throw Object.assign(new Error('That username is already taken.'), { status: 409 });
  }

  const update = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.username !== undefined) update.username = patch.username;
  if (patch.password) update.password_hash = hashPassword(patch.password);
  if (patch.sonexApiKey !== undefined) update.sonex_api_key = String(patch.sonexApiKey).trim();
  if (patch.agentId !== undefined) update.agent_id = patch.agentId || null;
  if (patch.agentName !== undefined) update.agent_name = patch.agentName || null;
  if (patch.clientRateInrPerMin !== undefined) update.client_rate_inr_per_min = Number(patch.clientRateInrPerMin);
  if (patch.providerCostInrPerMin !== undefined) update.provider_cost_inr_per_min = Number(patch.providerCostInrPerMin);
  if (patch.pulseSeconds !== undefined) update.pulse_seconds = Number(patch.pulseSeconds);

  const { data, error } = await supabase.from(TABLE).update(update).eq('id', id).select('*').single();
  if (error) fail(error, 'Could not update client.');
  return toPublic(fromRow(data));
}

export async function deleteTenant(id) {
  const { error, count } = await supabase.from(TABLE).delete({ count: 'exact' }).eq('id', id);
  if (error) fail(error, 'Could not remove client.');
  return (count ?? 0) > 0;
}
