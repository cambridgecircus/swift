-- SWIFT Intelligence storage — initial schema (Step 10E-2B)
-- Apply in Supabase SQL editor or via migration tooling.
-- Stores each intelligence run and linked signals, jobs, and source health for historical review.

-- gen_random_uuid() is built into PostgreSQL 13+ (Supabase default).

create table if not exists public.swift_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check (run_type in ('manual', 'scheduled', 'debug')),
  generated_at timestamptz not null default now(),
  headline text,
  executive_summary text,
  report_json jsonb not null default '{}'::jsonb,
  raw_signal_count int not null default 0,
  clean_signal_count int not null default 0,
  live_job_count int not null default 0,
  email_status text,
  email_message_id text,
  created_at timestamptz not null default now()
);

comment on table public.swift_runs is 'One row per SWIFT intelligence generation (manual, scheduled, or debug).';

create table if not exists public.swift_market_signals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.swift_runs (id) on delete cascade,
  title text not null,
  source_name text,
  source_url text,
  category text,
  published_at timestamptz,
  relevance_score int,
  signal_strength text,
  summary text,
  why_it_matters text,
  hrbp_implication text,
  created_at timestamptz not null default now()
);

comment on table public.swift_market_signals is 'Cleaned RSS / market signals captured for a given swift_runs row.';

create table if not exists public.swift_job_opportunities (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.swift_runs (id) on delete cascade,
  role text not null,
  company text,
  location text,
  source text,
  source_url text,
  apply_url text,
  date_found timestamptz,
  fit_score int,
  why_this_fits text,
  gaps jsonb not null default '[]'::jsonb,
  recommended_action text,
  status text,
  created_at timestamptz not null default now()
);

comment on table public.swift_job_opportunities is 'Live (or attached) job opportunities stored per run.';

create table if not exists public.swift_source_health (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.swift_runs (id) on delete cascade,
  source_name text not null,
  status text,
  item_count int,
  error_message text,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.swift_source_health is 'RSS and job-ingestion source health snapshots per run.';

create table if not exists public.swift_source_registry_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.swift_runs (id) on delete cascade,
  total_sources int,
  enabled_sources int,
  rss_enabled int,
  api_planned int,
  json_planned int,
  manual_planned int,
  by_topic jsonb,
  by_type jsonb,
  enabled_source_names jsonb,
  disabled_source_names jsonb,
  snapshot_json jsonb,
  created_at timestamptz not null default now()
);

comment on table public.swift_source_registry_snapshots is 'Stores source registry summary at each SWIFT run for weekly/monthly source coverage comparison.';

create index if not exists swift_runs_generated_at_idx on public.swift_runs (generated_at desc);
create index if not exists swift_market_signals_run_id_idx on public.swift_market_signals (run_id);
create index if not exists swift_job_opportunities_run_id_idx on public.swift_job_opportunities (run_id);
create index if not exists swift_source_health_run_id_idx on public.swift_source_health (run_id);
create index if not exists swift_source_registry_snapshots_run_id_idx on public.swift_source_registry_snapshots (run_id);

-- LinkedIn job alert rows ingested from Outlook / Hotmail via Power Automate (no LinkedIn page scraping).
create table if not exists public.swift_imported_job_alerts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  role text,
  company text,
  location text,
  apply_url text,
  source_url text,
  email_subject text,
  email_from text,
  email_date timestamptz,
  fit_score int,
  status text not null default 'to_review',
  notes text,
  raw_json jsonb,
  created_at timestamptz not null default now()
);

comment on table public.swift_imported_job_alerts is 'LinkedIn job alert emails forwarded by Power Automate; URLs only, no HTML scraping of LinkedIn.';

create index if not exists swift_imported_job_alerts_created_at_idx on public.swift_imported_job_alerts (created_at desc);
create index if not exists swift_imported_job_alerts_source_apply_idx on public.swift_imported_job_alerts (source, apply_url);
