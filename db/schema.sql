create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  display_name text,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  symbol text,
  name text not null,
  asset_type text not null check (asset_type in ('equity','etf','crypto','ipo_candidate','macro','other')),
  primary_exchange text,
  currency text not null default 'USD',
  is_active boolean not null default true,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index assets_symbol_unique_idx on assets (lower(symbol)) where symbol is not null;

create table holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete restrict,
  quantity numeric(20,8) not null,
  cost_basis numeric(20,8),
  opened_at timestamptz,
  closed_at timestamptz,
  source_type text not null default 'manual' check (source_type in ('manual','broker_sync')),
  source_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index holdings_user_asset_idx on holdings (user_id, asset_id);

create table watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  description text,
  kind text not null default 'manual' check (kind in ('manual','theme_supporting','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references watchlists(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete restrict,
  added_at timestamptz not null default now(),
  notes text,
  unique (watchlist_id, asset_id)
);

create table theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  title text not null,
  slug text not null,
  summary text,
  rationale text,
  status text not null default 'active' check (status in ('active','paused','archived')),
  priority smallint not null default 50,
  review_cadence text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);
create index theses_user_status_idx on theses (user_id, status);

create table thesis_asset_links (
  id uuid primary key default gen_random_uuid(),
  thesis_id uuid not null references theses(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete restrict,
  relationship_type text not null default 'supporting' check (relationship_type in ('core','supporting','watch','hedge','contra')),
  why_relevant text,
  confidence numeric(4,3),
  created_at timestamptz not null default now(),
  unique (thesis_id, asset_id)
);

create table source_documents (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  source_name text,
  title text,
  published_at timestamptz,
  retrieved_at timestamptz,
  document_type text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table signal_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  title text not null,
  summary text,
  occurred_at timestamptz,
  source_published_at timestamptz,
  source_document_id uuid references source_documents(id) on delete set null,
  confidence numeric(4,3),
  severity smallint,
  raw_payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index signal_events_type_occurred_idx on signal_events (event_type, occurred_at desc);

create table signal_event_assets (
  id uuid primary key default gen_random_uuid(),
  signal_event_id uuid not null references signal_events(id) on delete cascade,
  asset_id uuid not null references assets(id) on delete cascade,
  match_reason text,
  unique (signal_event_id, asset_id)
);
create index signal_event_assets_asset_event_idx on signal_event_assets (asset_id, signal_event_id);

create table catalysts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  thesis_id uuid references theses(id) on delete set null,
  source_signal_event_id uuid references signal_events(id) on delete set null,
  catalyst_type text not null check (catalyst_type in ('earnings','filing','etf_change','macro','listing','news','thesis_update','custom')),
  title text not null,
  summary text,
  scheduled_for timestamptz,
  window_start timestamptz,
  window_end timestamptz,
  status text not null default 'upcoming' check (status in ('upcoming','active','resolved','dismissed')),
  importance_score numeric(5,2),
  why_it_matters text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index catalysts_user_scheduled_idx on catalysts (user_id, scheduled_for);
create index catalysts_user_thesis_scheduled_idx on catalysts (user_id, thesis_id, scheduled_for);

create table alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  catalyst_id uuid references catalysts(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  thesis_id uuid references theses(id) on delete set null,
  alert_type text not null check (alert_type in ('pre_event','change_detected','digest_prompt','custom')),
  state text not null default 'pending' check (state in ('pending','seen','snoozed','muted','sent','cancelled')),
  scheduled_for timestamptz,
  sent_at timestamptz,
  snoozed_until timestamptz,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index alerts_user_scheduled_state_idx on alerts (user_id, scheduled_for, state);

create table digests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  digest_date date not null,
  window_label text not null default 'daily',
  summary text,
  payload_json jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  unique (user_id, digest_date)
);

create table research_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  scope_type text not null check (scope_type in ('asset','thesis','portfolio','custom')),
  asset_id uuid references assets(id) on delete set null,
  thesis_id uuid references theses(id) on delete set null,
  question text not null,
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index research_runs_user_created_idx on research_runs (user_id, created_at desc);

create table research_snapshots (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references research_runs(id) on delete cascade,
  version_number integer not null,
  summary text,
  body_markdown text not null,
  sources_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (research_run_id, version_number)
);

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  target_type text not null check (target_type in ('asset','holding','watchlist','thesis','catalyst','research_run')),
  target_id uuid not null,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notes_user_target_idx on notes (user_id, target_type, target_id);
