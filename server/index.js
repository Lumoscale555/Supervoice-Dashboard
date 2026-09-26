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

import { collectAppointments, appointmentsFromCall, isScannable, DEFAULT_TOOL_MAP } from './appointments.js';
import { getCalls, clearMirror, startMirrorWarmer } from './mirror.js';
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

/**
 * Opens an SSE connection and provides a send/done/error helper.
 * The handler receives (req, sse) where sse.send(chunk), sse.done(), sse.error(msg).
 */
function sseRoute(handler) {
  return async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    const sse = {
      send(chunk) {
        res.write(`data: ${JSON.stringify({ event: 'chunk', chunk })}\n\n`);
        // flush if available (compression middleware)
        if (typeof res.flush === 'function') res.flush();
      },
      done() {
        res.write(`data: ${JSON.stringify({ event: 'done' })}\n\n`);
        res.end();
      },
      error(message, status = 502) {
        res.write(`data: ${JSON.stringify({ event: 'error', message, status })}\n\n`);
        res.end();
      },
    };

    try {
      await handler(req, sse);
    } catch (err) {
      try { sse.error(err.message, err.status || 502); } catch { /* already closed */ }
    }
  };
}

// The dashboard shows only calls from 26 Sep 2026 (00:00 IST) onward, up to now.
// Anything earlier is never requested from Sonex, so it can't be shown or billed.
// Fixed in code — no .env setting, no range picker, and no query parameter can
// reach further back.
const DATA_START_AT = new Date('2026-09-26T00:00:00+05:30');

const localDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);

function resolveRange() {
  const from = localDate(DATA_START_AT);
  const to = localDate(new Date());
  return { days: Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1), from, to };
}

const todayISO = () => ({ from: DATA_START_AT.toISOString(), to: new Date().toISOString() });

/** Overview payload: everything since DATA_START. */
async function overviewPayload(req) {
  const { days, from, to } = resolveRange();
  const [calls, balance] = await Promise.all([
    getCalls(req.tenant, req.client, todayISO()),
    req.client.getBalance(),
  ]);

  return {
    range: { from, to, days, timezone: TIMEZONE },
    summary: buildBillingSummary(calls, req.tenant),
    previous: buildBillingSummary([], req.tenant).totals,
    balance,
    recent_calls: calls.slice(0, 8).map((c) => priceCall(c, req.tenant)),
  };
}

// Every request needs the tenant row (a Supabase round trip, 300ms-1s). Keep it
// briefly in memory; admin edits/deletes drop the entry on this instance.
const tenantCache = new Map();
const TENANT_TTL_MS = 15_000;
async function cachedTenant(id) {
  const hit = tenantCache.get(id);
  if (hit && Date.now() - hit.at < TENANT_TTL_MS) return hit.tenant;
  const tenant = await store.getTenantRaw(id);
  if (tenant) tenantCache.set(id, { tenant, at: Date.now() });
  else tenantCache.delete(id);
  return tenant;
}

/** Loads the tenant behind the session onto req.tenant + a scoped client. */
async function loadTenant(req, res, next) {
  try {
    const tenant = await cachedTenant(req.authSession.tenantId);
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
      const tenant = await cachedTenant(req.authSession.tenantId);
      if (tenant) {
        return {
          role: 'client',
          tenant: store.toPublic(tenant),
          mode: tenantMode(tenant),
          pricing: { rate_per_minute_inr: tenant.clientRateInrPerMin },
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
    tenant: store.toPublic(req.tenant),
    mode: tenantMode(req.tenant),
    pricing: { rate_per_minute_inr: req.tenant.clientRateInrPerMin },
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
  route((req) => overviewPayload(req)),
);

// --- Calls ----------------------------------------------------------------
// Calls list, served from the in-memory mirror. Opaque cursor = page offset.
async function filteredCalls(req) {
  const { status, direction, phone_number } = req.query;
  const digits = String(phone_number || '').replace(/\D/g, '');

  let rows = await getCalls(req.tenant, req.client, todayISO());
  if (status) rows = rows.filter((c) => c.status === status);
  if (direction) rows = rows.filter((c) => c.direction === direction);
  if (digits) rows = rows.filter((c) => `${c.from || ''}${c.to || ''}`.replace(/\D/g, '').includes(digits));
  return rows;
}

async function mirrorPage(req) {
  const rows = await filteredCalls(req);
  const size = Math.min(Number(req.query.limit) || 10, 100);
  const offset = Number(req.query.cursor) || 0;
  const has_more = offset + size < rows.length;
  return {
    data: rows.slice(offset, offset + size).map((c) => priceCall(c, req.tenant)),
    has_more,
    next_cursor: has_more ? String(offset + size) : null,
  };
}

app.get('/api/calls', requireClient, loadTenant, route(mirrorPage));

// SSE: the first 10 rows go out immediately so page 1 paints at once; the rest
// follow in the background in chunks of 50 while the user is already reading.
app.get(
  '/api/calls/stream',
  requireClient,
  loadTenant,
  sseRoute(async (req, sse) => {
    const rows = await filteredCalls(req);
    const FIRST = 10;
    const CHUNK = 50;
    const send = (slice, offset) =>
      sse.send({
        data: slice.map((c) => priceCall(c, req.tenant)),
        has_more: offset + slice.length < rows.length,
        total: rows.length,
      });

    send(rows.slice(0, FIRST), 0);
    for (let i = FIRST; i < rows.length; i += CHUNK) {
      await new Promise((r) => setImmediate(r));
      send(rows.slice(i, i + CHUNK), i);
    }
    sse.done();
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
  route(async (req) => {
    const callId = req.params.id;
    let rec;
    try {
      rec = await req.client.getRecording(callId);
    } catch (err) {
      console.error(`[recording] Sonex error for ${callId}:`, err.status, err.message, err.body);
      throw Object.assign(
        new Error(err.message || 'No recording available for this call.'),
        { status: err.status || 404 },
      );
    }

    // Log the raw response so we can see what Sonex actually returns.
    console.log(`[recording] raw response for ${callId}:`, JSON.stringify(rec));

    // Sonex returns url=null when the recording hasn't been processed yet.
    // Surface this as a 404 so the frontend shows a useful error.
    if (!rec || !rec.url) {
      throw Object.assign(
        new Error('Recording is not ready yet — Sonex may still be processing it. Try again in a few seconds.'),
        { status: 404 },
      );
    }

    return rec;
  }),
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
    const { from, to } = resolveRange();
    const toolMap = req.query.tools ? JSON.parse(req.query.tools) : DEFAULT_TOOL_MAP;
    const calls = await getCalls(req.tenant, req.client, todayISO());

    const result = await collectAppointments(req.client, {
      toolMap,
      scanLimit: Math.min(Number(req.query.scan_limit) || 60, 200),
      calls,
    });

    return { ...result, range: { from, to }, tool_map: toolMap };
  }),
);

// SSE: stream appointments as tool-call details are fetched. Completed-call
// details are cached for good, so only never-seen calls cost an upstream request.
app.get(
  '/api/appointments/stream',
  requireClient,
  loadTenant,
  sseRoute(async (req, sse) => {
    const { from, to } = resolveRange();
    const toolMap = req.query.tools ? JSON.parse(req.query.tools) : DEFAULT_TOOL_MAP;
    const scanLimit = Math.min(Number(req.query.scan_limit) || 80, 200);
    const BATCH = 25;

    const calls = await getCalls(req.tenant, req.client, todayISO());
    const eligible = calls.filter(isScannable);
    const candidates = eligible.slice(0, scanLimit);
    const meta = { total_calls_in_window: calls.length, truncated: eligible.length > candidates.length, range: { from, to } };

    let scanned = 0;
    const failures = [];

    for (let i = 0; i < candidates.length; i += BATCH) {
      const batch = candidates.slice(i, i + BATCH);
      const settled = await Promise.allSettled(batch.map((s) => req.client.getCall(s.id, 'tool_calls')));

      const found = [];
      settled.forEach((r, j) => {
        scanned += 1;
        if (r.status === 'fulfilled') found.push(...appointmentsFromCall({ ...batch[j], ...r.value }, toolMap));
        else failures.push({ call_id: batch[j].id, message: r.reason?.message || 'Error' });
      });

      if (found.length > 0) sse.send({ data: found, scanned_calls: scanned, failures: [], streaming: true, ...meta });
    }

    sse.send({ data: [], scanned_calls: scanned, failures, streaming: false, ...meta });
    sse.done();
  }),
);

// --- Billing (client-facing: their own rate only, no provider cost/margin) --
app.get(
  '/api/billing',
  requireClient,
  loadTenant,
  route(async (req) => {
    const { days, from, to } = resolveRange();

    const [calls, balance] = await Promise.all([
      getCalls(req.tenant, req.client, todayISO()),
      req.client.getBalance(),
    ]);

    return {
      range: { from, to, days, timezone: TIMEZONE },
      pricing: { rate_per_minute_inr: req.tenant.clientRateInrPerMin },
      balance,
      summary: buildBillingSummary(calls, req.tenant),
      // Per-call history (client rate only — never provider cost or margin).
      line_items: calls.map((c) => {
        const { id, started_at, agent, direction, from: caller, to: callee, status, duration_secs, cost_inr } = priceCall(c, req.tenant);
        return { id, started_at, agent, direction, from: caller, to: callee, status, duration_secs, cost_inr };
      }),
    };
  }),
);

// ---------------------------------------------------------------------------
// SSE: stream overview — emits balance + recent calls fast, then KPI data.
// ---------------------------------------------------------------------------
app.get(
  '/api/overview/stream',
  requireClient,
  loadTenant,
  sseRoute(async (req, sse) => {
    sse.send({ ...(await overviewPayload(req)), data: [], streaming: false });
    sse.done();
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
    clearMirror(req.params.id);
    tenantCache.delete(req.params.id);
    return { data: updated };
  }),
);

app.delete(
  '/api/admin/tenants/:id',
  requireAdmin,
  route(async (req) => {
    const ok = await store.deleteTenant(req.params.id);
    clearTenantClientCache(req.params.id);
    clearMirror(req.params.id);
    tenantCache.delete(req.params.id);
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

    const { days, from, to } = resolveRange();
    const client = getScopedClient(tenant);
    const calls = await getCalls(tenant, client, todayISO());
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
  startMirrorWarmer(async (tenantId) => {
    const t = await store.getTenantRaw(tenantId);
    return t ? getScopedClient(t) : null;
  });
  app.listen(PORT, async () => {
    console.log(`\n  The Super Voice API  ->  http://localhost:${PORT}`);
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
