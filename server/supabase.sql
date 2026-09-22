-- Run this once against your Supabase project (SQL Editor -> New query)
-- before setting SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.

create extension if not exists pgcrypto;

create table if not exists tenants (
  id                          uuid primary key default gen_random_uuid(),
  name                        text not null,
  username                    text not null unique,
  password_hash               text not null,   -- salt:scrypt-hash, never plaintext
  sonex_api_key               text not null default '',
  agent_id                    text,             -- Sonex agent.id that scopes this client's data
  agent_name                  text,             -- display label only, not used for filtering
  client_rate_inr_per_min     numeric not null default 5,
  provider_cost_inr_per_min   numeric not null default 2.5,
  pulse_seconds               integer not null default 30,
  created_at                  timestamptz not null default now()
);

create unique index if not exists tenants_username_lower_idx on tenants (lower(username));

-- The server talks to this table with the service-role key only (never the
-- browser), so Row Level Security can stay off — access control lives in the
-- Express session/admin middleware, not in Postgres policies.
alter table tenants disable row level security;

-- No seed data needed: once SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set,
-- sign in to /admin with ADMIN_USERNAME / ADMIN_PASSWORD (from .env) and use
-- "+ Add client" to create your first tenant through the UI.
