-- Run this once against your Supabase project (SQL Editor -> New query)
-- before setting SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.
--
-- Safe to re-run: every statement is idempotent, so running this again
-- against a table that already exists (e.g. to pick up updated_at below)
-- only adds what's missing, it never drops or overwrites data.

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
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- If this table was created before updated_at existed, this adds it without
-- touching anything else.
alter table tenants add column if not exists updated_at timestamptz not null default now();

create unique index if not exists tenants_username_lower_idx on tenants (lower(username));

-- Keep updated_at current automatically on every UPDATE — including edits
-- made directly in the SQL editor, not just through the admin console.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists tenants_set_updated_at on tenants;
create trigger tenants_set_updated_at
  before update on tenants
  for each row
  execute function set_updated_at();

-- The server talks to this table with the service-role key only (never the
-- browser), so Row Level Security can stay off — access control lives in the
-- Express session/admin middleware, not in Postgres policies.
alter table tenants disable row level security;

-- No seed data needed: once SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set,
-- sign in to /admin with ADMIN_USERNAME / ADMIN_PASSWORD (from .env) and use
-- "+ Add client" to create your first tenant through the UI.
