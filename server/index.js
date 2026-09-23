// API for the Super Voice multi-tenant dashboard.
//
// Two logins share one session cookie: a super admin who creates/edits
// tenants (client name, Sonex API key, agent name scope, billing rates), and a
// tenant ("client") login that only ever sees that tenant's own data. Every
// data route below runs behind requireClient and reaches Sonex only through
// getScopedClient(req.tenant), which filters by agent name and never lets
// one tenant read another tenant's calls.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import express from 'express';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import cors from 'cors';
import 'dotenv/config';

import { collectAppointments, DEFAULT_TOOL_MAP } from './appointments.js';
import { priceCall, priceCallWithMargin } from './pricing.js';
import { buildBillingSummary } from './billing.js';
import { getScopedClient, tenantMode, clearTenantClientCache } from './tenantClient.js';
import { requireClient, requireAdmin, checkAdminCredentials, verifyPassword } from './auth.js';
import { readSession, setSessionCookie, clearSessionCookie } from './authSession.js';
import * as store from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const PORT = Number(process.env.PORT) || 8787;
const TIMEZONE = process.env.TIMEZONE || 'UTC';

const app = express();
app.set('trust proxy', 1);
app.use(compression());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(readSession);

const route = (handler) => async (req, res) => {
  try {
    res.json(await handler(req));
  } catch (err) {
    const status = err.status || 502;
    res.status(status).json({ error: { message: err.message, status } });
  }
};

const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const isoDate = (d) => d.toISOString().slice(0, 10);

function resolveRange(query) {
  const days = { '7d': 7, '30d': 30, '90d': 90 }[query.range] || 30;
  return {
    days,
    from: query.from || isoDate(daysAgo(days - 1)),
    to: query.to || isoDate(new Date()),
  };
}

/** Loads the tenant behind the session onto req.tenant + a scoped client. */
async function loadTenant(req, res, next) {
  try {
    const tenant = await store.getTenantRaw(req.authSession.tenantId);
    if (!tenant) {
      clearSessionCookie(res);
      return res.status(401).json({ error: { message: 'Session expired. Sign in again.', status: 401 } });
    }
    req.tenant = tenant;
    req.client = getScopedClient(tenant);
    next();
  } catch (err) {
    res.status(err.status || 502).json({ error: { message: err.message, status: err.status || 502 } });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'super-voice-api' });
});

// --- Auth (one login form for both admin and client) ------------------------
// Tries the admin credentials first (a single pair from .env), then falls
// back to the tenant store. Whichever matches sets the session role, and the
// frontend routes to /admin or / based on what comes back — there is only
// ever one login screen, not two.
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      throw Object.assign(new Error('Enter a username and password.'), { status: 400 });
    }

    if (checkAdminCredentials(username, password)) {
      setSessionCookie(res, { role: 'admin' });
      return res.json({ ok: true, role: 'admin' });
    }

    const tenant = await store.getTenantByUsername(username);
    if (tenant && verifyPassword(password, tenant.passwordHash)) {
      setSessionCookie(res, { role: 'client', tenantId: tenant.id });
      return res.json({ ok: true, role: 'client', tenant: await store.getTenantPublic(tenant.id) });
    }

    throw Object.assign(new Error('Incorrect username or password.'), { status: 401 });
  } catch (err) {
    const status = err.status || 502;
    res.status(status).json({ error: { message: err.message, status } });
  }
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

/** Single "who am I" check the frontend uses to decide which app to render. */
app.get(
  '/api/session',
  route(async (req) => {
    if (req.authSession?.role === 'admin') return { role: 'admin' };
    if (req.authSession?.role === 'client' && req.authSession.tenantId) {
      const tenant = await store.getTenantRaw(req.authSession.tenantId);
      if (tenant) {
        return {
          role: 'client',
          tenant: await store.getTenantPublic(tenant.id),
          mode: tenantMode(tenant),
          pricing: { rate_per_minute_inr: tenant.clientRateInrPerMin, pulse_seconds: tenant.pulseSeconds },
        };
      }
    }
    return { role: null };
  }),
);

app.get(
  '/api/auth/me',
  requireClient,
  loadTenant,
  route(async (req) => ({
    tenant: await store.getTenantPublic(req.tenant.id),
    mode: tenantMode(req.tenant),
    pricing: { rate_per_minute_inr: req.tenant.clientRateInrPerMin, pulse_seconds: req.tenant.pulseSeconds },
  })),
);

// --- Account (tenant changes their own password) ----------------------------
app.post(
  '/api/account/password',
  requireClient,
  loadTenant,
  route(async (req) => {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      throw Object.assign(new Error('Enter your current password and a new password.'), { status: 400 });
    }
    if (!verifyPassword(current_password, req.tenant.passwordHash)) {
      throw Object.assign(new Error('Current password is incorrect.'), { status: 401 });
    }
    if (String(new_password).length < 8) {
      throw Object.assign(new Error('New password must be at least 8 characters.'), { status: 400 });
    }
    await store.updateTenant(req.tenant.id, { password: new_password });
    return { ok: true };
  }),
);

// --- Overview -----------------------------------------------------------------
app.get(
  '/api/overview',
  requireClient,
  loadTenant,
  route(async (req) => {
    const { days, from, to } = resolveRange(req.query);
    const tz = TIMEZONE;

    const [calls, balance, recent] = await Promise.all([
      req.client.listAllCalls({
        started_after: new Date(from + 'T00:00:00Z').toISOString(),
        started_before: new Date(to + 'T23:59:59Z').toISOString(),
      }),
      req.client.getBalance(),
      req.client.listCalls({ limit: 8 }),
    ]);

    const summary = buildBillingSummary(calls, req.tenant);

    const prevTo = new Date(new Date(from).getTime() - 86400000);
    const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86400000);
    const prevCalls = await req.client.listAllCalls({
      started_after: new Date(prevFrom.toISOString().slice(0, 10) + 'T00:00:00Z').toISOString(),
      started_before: new Date(prevTo.toISOString().slice(0, 10) + 'T23:59:59Z').toISOString(),
    });
    const previous = buildBillingSummary(prevCalls, req.tenant).totals;

    return {
      range: { from, to, days, timezone: tz },
      summary,
      previous,
      balance,
      recent_calls: recent.data.map((c) => priceCall(c, req.tenant)),
    };
  }),
);

// --- Calls ----------------------------------------------------------------
app.get(
  '/api/calls',
  requireClient,
  loadTenant,
  route(async (req) => {
    const { limit, cursor, status, direction, phone_number, started_after, started_before } = req.query;
    const result = await req.client.listCalls({
      limit: limit || 25,
      cursor,
      status,
      direction,
      phone_number,
      started_after,
      started_before,
    });
    return { ...result, data: result.data.map((c) => priceCall(c, req.tenant)) };
  }),
);

app.get(
  '/api/calls/:id',
  requireClient,
  loadTenant,
  route(async (req) => {
    const detail = await req.client.getCall(req.params.id, 'transcript');
    return priceCall(detail, req.tenant);
  }),
);

app.get(
  '/api/calls/:id/recording',
  requireClient,
  loadTenant,
  route((req) => req.client.getRecording(req.params.id)),
);

app.get(
  '/api/calls/:id/transcript',
  requireClient,
  loadTenant,
  route((req) => req.client.getTranscript(req.params.id)),
);

// --- Appointments ---------------------------------------------------------
app.get(
  '/api/appointments',
  requireClient,
  loadTenant,
  route(async (req) => {
    const { from, to } = resolveRange(req.query);
    const toolMap = req.query.tools ? JSON.parse(req.query.tools) : DEFAULT_TOOL_MAP;

    const result = await collectAppointments(req.client, {
      toolMap,
      scanLimit: Math.min(Number(req.query.scan_limit) || 60, 200),
      started_after: new Date(from + 'T00:00:00Z').toISOString(),
      started_before: new Date(to + 'T23:59:59Z').toISOString(),
    });

    return { ...result, range: { from, to }, tool_map: toolMap };
  }),
);

// --- Billing (client-facing: their own rate only, no provider cost/margin) --
app.get(
  '/api/billing',
  requireClient,
  loadTenant,
  route(async (req) => {
    const { days, from, to } = resolveRange(req.query);

    const [calls, balance] = await Promise.all([
      req.client.listAllCalls({
        started_after: new Date(from + 'T00:00:00Z').toISOString(),
        started_before: new Date(to + 'T23:59:59Z').toISOString(),
      }),
      req.client.getBalance(),
    ]);

    const summary = buildBillingSummary(calls, req.tenant);

    return {
      range: { from, to, days, timezone: TIMEZONE },
      pricing: { rate_per_minute_inr: req.tenant.clientRateInrPerMin, pulse_seconds: req.tenant.pulseSeconds },
      balance,
      summary,
    };
  }),
);

// Admin sign-in goes through the shared POST /api/auth/login above (one
// login form for both roles); /api/session tells the frontend which one it
// got. requireAdmin below still gates every admin-only route independently.

// --- Admin: tenant management -----------------------------------------------
app.get(
  '/api/admin/tenants',
  requireAdmin,
  route(async () => ({ data: await store.listTenants() })),
);

app.post(
  '/api/admin/tenants',
  requireAdmin,
  route(async (req) => ({ data: await store.createTenant(req.body || {}) })),
);

app.patch(
  '/api/admin/tenants/:id',
  requireAdmin,
  route(async (req) => {
    const updated = await store.updateTenant(req.params.id, req.body || {});
    if (!updated) throw Object.assign(new Error('Tenant not found.'), { status: 404 });
    clearTenantClientCache(req.params.id);
    return { data: updated };
  }),
);

app.delete(
  '/api/admin/tenants/:id',
  requireAdmin,
  route(async (req) => {
    const ok = await store.deleteTenant(req.params.id);
    clearTenantClientCache(req.params.id);
    if (!ok) throw Object.assign(new Error('Tenant not found.'), { status: 404 });
    return { ok: true };
  }),
);

// Per-tenant financials for the admin — the one place provider cost and
// margin are ever computed or shown; never exposed on the client's own
// /api/billing above.
app.get(
  '/api/admin/tenants/:id/billing',
  requireAdmin,
  route(async (req) => {
    const tenant = await store.getTenantRaw(req.params.id);
    if (!tenant) throw Object.assign(new Error('Tenant not found.'), { status: 404 });

    const { days, from, to } = resolveRange(req.query);
    const client = getScopedClient(tenant);
    const calls = await client.listAllCalls({
      started_after: new Date(from + 'T00:00:00Z').toISOString(),
      started_before: new Date(to + 'T23:59:59Z').toISOString(),
    });
    const summary = buildBillingSummary(calls, tenant, { withMargin: true });

    // Every call, priced with margin — this is the only place client rate,
    // provider cost and margin are ever returned per call; never sent to the
    // tenant's own session.
    const line_items = calls
      .slice()
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      .map((c) => priceCallWithMargin(c, tenant));

    return {
      tenant: await store.getTenantPublic(tenant.id),
      mode: tenantMode(tenant),
      range: { from, to, days },
      summary,
      line_items,
    };
  }),
);

// Serve the built SPA when it exists, so `npm run build && npm start` is a
// single-process deployment.
const dist = path.join(ROOT, 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
}

// Vercel imports this module as a serverless function (see api/index.js) and
// invokes the exported app directly per-request — it never calls listen().
// Only start a real listening server when run directly (`node server/index.js`
// / `npm start`, for self-hosting or local dev).
if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`\n  Super Voice API  ->  http://localhost:${PORT}`);
    console.log(`  Tenant store: ${store.backend === 'supabase' ? 'Supabase' : 'local file (server/data/tenants.json)'}`);
    if (process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      console.log(`  Admin login: ${process.env.ADMIN_USERNAME} / (from .env)`);
    } else {
      console.warn('  ⚠ ADMIN_USERNAME / ADMIN_PASSWORD not set in .env — admin console login is disabled until they are.');
    }
    try {
      const tenants = await store.listTenants();
      console.log(`  ${tenants.length} client${tenants.length === 1 ? '' : 's'} configured\n`);
    } catch (err) {
      console.error(`  Could not reach the tenant store: ${err.message}`);
      console.error(`  Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env and that server/supabase.sql has been run.\n`);
    }
  });
}

export default app;
