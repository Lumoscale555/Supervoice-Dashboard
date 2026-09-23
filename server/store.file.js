// File-backed tenant store — the fallback used until SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are set in .env (see server/store.supabase.js).
// Same async shape as the Supabase store so server/index.js never needs to
// know which one is active.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const FILE = path.join(DATA_DIR, 'tenants.json');

function load() {
  if (!fs.existsSync(FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return [];
  }
}

function persist() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(tenants, null, 2));
}

let tenants = load();

// Backfill updatedAt on records written before this field existed, so old
// entries show a real timestamp (their created date) instead of blank.
for (const t of tenants) {
  if (!t.updatedAt) t.updatedAt = t.createdAt;
}

// No hardcoded demo credential is ever shipped in source. If you want a demo
// client seeded on first run, set DEMO_SEED_USERNAME/DEMO_SEED_PASSWORD in
// .env; otherwise the store starts empty and the first client comes from the
// admin console (itself gated by ADMIN_USERNAME/ADMIN_PASSWORD in .env).
if (tenants.length === 0 && process.env.DEMO_SEED_USERNAME && process.env.DEMO_SEED_PASSWORD) {
  tenants.push({
    id: crypto.randomUUID(),
    name: 'Demo Client',
    username: process.env.DEMO_SEED_USERNAME,
    passwordHash: hashPassword(process.env.DEMO_SEED_PASSWORD),
    sonexApiKey: '',
    agentName: 'Demo Agent',
    clientRateInrPerMin: 5,
    providerCostInrPerMin: 2.5,
    pulseSeconds: 30,
    createdAt: new Date().toISOString(),
  });
  persist();
}

function toPublic(t) {
  const { passwordHash, sonexApiKey, ...rest } = t;
  return {
    ...rest,
    hasApiKey: Boolean(sonexApiKey),
    apiKeyPreview: sonexApiKey ? `${sonexApiKey.slice(0, 7)}…${sonexApiKey.slice(-4)}` : null,
  };
}

export async function listTenants() {
  return tenants.map(toPublic);
}

export async function getTenantRaw(id) {
  return tenants.find((t) => t.id === id) ?? null;
}

export async function getTenantPublic(id) {
  const t = await getTenantRaw(id);
  return t ? toPublic(t) : null;
}

export async function getTenantByUsername(username) {
  return tenants.find((t) => t.username.toLowerCase() === String(username).toLowerCase()) ?? null;
}

export async function createTenant(input) {
  if (!input.name || !input.username || !input.password) {
    throw Object.assign(new Error('name, username and password are required.'), { status: 400 });
  }
  if (await getTenantByUsername(input.username)) {
    throw Object.assign(new Error('That username is already taken.'), { status: 409 });
  }
  const tenant = {
    id: crypto.randomUUID(),
    name: input.name,
    username: input.username,
    passwordHash: hashPassword(input.password),
    sonexApiKey: (input.sonexApiKey || '').trim(),
    agentName: input.agentName || null,
    clientRateInrPerMin: Number(input.clientRateInrPerMin) || 5,
    providerCostInrPerMin: Number(input.providerCostInrPerMin) || 2.5,
    pulseSeconds: Number(input.pulseSeconds) || 30,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  tenants.push(tenant);
  persist();
  return toPublic(tenant);
}

export async function updateTenant(id, patch) {
  const t = await getTenantRaw(id);
  if (!t) return null;
  if (patch.name !== undefined) t.name = patch.name;
  if (patch.username !== undefined) {
    const clash = await getTenantByUsername(patch.username);
    if (clash && clash.id !== id) throw Object.assign(new Error('That username is already taken.'), { status: 409 });
    t.username = patch.username;
  }
  if (patch.password) t.passwordHash = hashPassword(patch.password);
  if (patch.sonexApiKey !== undefined) t.sonexApiKey = String(patch.sonexApiKey).trim();
  if (patch.agentName !== undefined) t.agentName = patch.agentName || null;
  if (patch.clientRateInrPerMin !== undefined) t.clientRateInrPerMin = Number(patch.clientRateInrPerMin);
  if (patch.providerCostInrPerMin !== undefined) t.providerCostInrPerMin = Number(patch.providerCostInrPerMin);
  if (patch.pulseSeconds !== undefined) t.pulseSeconds = Number(patch.pulseSeconds);
  t.updatedAt = new Date().toISOString();
  persist();
  return toPublic(t);
}

export async function deleteTenant(id) {
  const before = tenants.length;
  tenants = tenants.filter((t) => t.id !== id);
  persist();
  return tenants.length < before;
}
