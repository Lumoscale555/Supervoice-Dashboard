# Super Voice Dashboard

A multi-tenant, white/blue operations dashboard for voice agent deployments —
**Overview, Calls, Appointments, Billing, Settings** — built directly against
the [Sonex Labs API](https://docs.sonexlabs.com/api-reference)
(`https://api.sonexlabs.com`, OpenAPI spec at `/openapi.json`) as the calling
and transcription backend.

## Multi-tenancy

There are two logins:

- **Admin console** (`/admin`) — `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`.
  Creates and manages **clients** (tenants): a name, a username/password, that
  client's own Sonex API key, and the **agent scope** that isolates their data.
- **Client dashboard** (`/login`) — each client signs in with the
  username/password an admin gave them, and only ever sees their own calls,
  appointments and billing.

**How isolation works:** Sonex has no client/tenant concept of its own — the
only thing it exposes per call is `agent: { id, name }`, and `GET /v1/calls`
filters on `agent_id` (not `agent.name`, which is just a display label Sonex
doesn't guarantee unique). So every tenant record stores an `agentId`, and
`server/tenantClient.js` forces that `agent_id` onto every list/scan request
for that tenant and rejects any single-call lookup whose `agent.id` doesn't
match — one client can never see another client's calls, even if they share
one Sonex API key. Leave `agentId` blank only when a client has their own
dedicated Sonex account/API key, so the whole account is already theirs.

## Billing model

Each client has two rates, set per-tenant in the admin console:

- **Client rate** — what you charge that client, e.g. ₹5/min.
- **Provider cost** — what Sonex charges you to run their calls, e.g. ₹2.50/min.

Both are billed the same way: a **flat rate, pulsed every 30 seconds** — every
started pulse is a full billing unit, and only calls that connected are
billed. **Margin = client rate − provider cost.** The client's own dashboard
(`/billing`) shows only their rate and what they owe; provider cost and margin
are computed only for the admin (`/admin`, per-client "Billing" panel) and are
never sent to a client's own session. See `server/pricing.js` and
`server/billing.js`.

## Tenant storage: Supabase or local file

`server/store.js` picks the backend automatically:

- **Supabase**, once `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in
  `.env`. Run `server/supabase.sql` once against that project first (SQL
  Editor → New query) to create the `tenants` table. The service-role key is
  used because this runs server-side only — it's never sent to the browser,
  and access control is enforced by the Express session/admin middleware, not
  by Postgres row-level security.
- **Local JSON file** (`server/data/tenants.json`) otherwise — zero setup.
  Starts empty; optionally set `DEMO_SEED_USERNAME` / `DEMO_SEED_PASSWORD` in
  `.env` to seed one demo client on first run (has no effect once Supabase is
  configured). Good for development; switch to Supabase before deploying
  anywhere with more than one machine, since the file store doesn't survive a
  redeploy or scale past one process.

Switching backends is just adding the two env vars and restarting — nothing
else in the app changes, and passwords are hashed (`scrypt`, per-record salt)
in both. **There are no hardcoded credentials anywhere in the source** — admin
login is refused outright until `ADMIN_USERNAME`/`ADMIN_PASSWORD` are set in
`.env`, and `SESSION_SECRET` falls back to a random value per process (not a
fixed string) if left unset.

## Quick start

```bash
npm install
cp .env.example .env   # fill in ADMIN_USERNAME / ADMIN_PASSWORD at minimum
npm run dev             # API proxy on :8787, Vite dev server on :5173
```

Open http://localhost:5173 → redirects to `/login`.

- **Admin console:** sign in at `/login` with the `ADMIN_USERNAME` /
  `ADMIN_PASSWORD` you set in `.env` — one login screen serves both roles, and
  the server routes you to `/admin` automatically. From there, **+ Add
  client** to create a real client: paste their Sonex API key, their
  `agentId` (if they share an account with other clients), and set their
  billing rate and your provider cost.
- **Client login:** whatever username/password the admin gave that client. If
  you set `DEMO_SEED_USERNAME`/`DEMO_SEED_PASSWORD` in `.env` (file-store mode
  only), that account also works and runs on demo data.

Production: `npm run build && npm start` serves the built SPA and the API
from one Express process on `PORT` (default 8787).

## How the API maps to each tab

Per tenant, the dashboard talks to **five read endpoints** through
`server/tenantClient.js`; nothing else exists in the Sonex API surface.

| Endpoint | Used for |
|---|---|
| `GET /v1/calls`, `GET /v1/calls/{id}` | Calls list, call detail drawer (cost recomputed per tenant — see Billing model) |
| `GET /v1/calls/{id}/transcript` | Transcript, shown in the call detail drawer |
| `GET /v1/calls/{id}/recording` | Inline "Play recording" button below the call's cost — fetched live on click, 15-minute signed URL |
| `GET /v1/balance` | Wallet balance + service credits (Overview, Billing) |
| `GET /v1/voices` | Available but not currently surfaced in the UI |

Overview and Billing pull each tenant's raw call list (`listAllCalls`, always
agent-scoped) for the selected date range and aggregate it locally
(`server/billing.js`) using that tenant's rates, rather than trusting Sonex's
`/v1/usage` cost fields.

**Appointments has no dedicated endpoint.** Sonex Labs models booking purely as
a tool the voice agent calls mid-conversation
(`GET /v1/calls/{id}?include=tool_calls`), not as a calendar resource. So
`server/appointments.js` scans a tenant's recent calls' tool calls for names
that look like a booking action (`book_appointment`, `reschedule_appointment`,
`cancel_appointment`, …, configurable in `DEFAULT_TOOL_MAP`) and reconstructs
appointment rows from their arguments/results — already agent-scoped, since it
runs through the same tenant-scoped client as everything else. This scan
happens server-side only; the Calls tab's detail drawer shows transcript and
an inline recording player, not raw tool calls.

## Architecture

```
server/
  sonex.js            Real API client — auth, 5 req/s + 120 req/min pacing, 429 retry, response cache
  mock.js             Deterministic demo-data client with the exact same interface
  tenantClient.js      Wraps sonex.js/mock.js per tenant: forces agent_id, verifies call ownership
  pricing.js            Flat, pulse-billed rate — client rate and (admin-only) provider cost + margin
  billing.js             Aggregates a tenant's calls into day breakdowns using pricing.js
  appointments.js      Derives appointment rows from a tenant's calls' tool_calls
  crypto.js            Password hashing (scrypt) shared by both store backends
  store.js             Picks file vs Supabase backend from env
  store.file.js         Local JSON file tenant store (dev fallback)
  store.supabase.js     Supabase-backed tenant store (production)
  supabase.sql          Run once against your Supabase project to create the tenants table
  auth.js              Session middleware: requireClient / requireAdmin
  index.js             Express app: auth routes, admin routes, tenant-scoped data routes

src/
  lib/                Types, typed fetch hook, session context (one login, both roles), formatters
  components/         Shell (nav/topbar/tenant badge), reusable UI, chart primitives
  pages/              Login · Overview · Calls · Appointments · Billing · Settings
  pages/admin/        Client management console (admin-only, same /login screen)
```

No Sonex API key or Supabase key ever reaches the browser — the client only
ever calls `/api/*` on this same origin, behind a session cookie.

## Design

White/blue theme, Inter type, a validated 4-slot categorical palette (blue /
orange / aqua / yellow) checked against contrast, colorblind-safe (CVD) and
normal-vision separation gates — see `src/index.css` for the token definitions
and the rationale in code comments. Motion is deliberate and restrained:
staggered fade-ups on load, slide-in detail drawers, animated chart entrances,
skeleton loading states, and a `prefers-reduced-motion` override throughout.
# Supervoice-Dashboard
