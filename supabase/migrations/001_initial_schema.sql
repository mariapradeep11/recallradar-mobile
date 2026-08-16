-- ─────────────────────────────────────────────────────────────────────────────
-- RecallRadar — Initial Schema
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- ── users ────────────────────────────────────────────────────────────────────
-- Extends auth.users with the household safety profile collected during onboarding.

create table if not exists public.users (
  id                   uuid        references auth.users(id) on delete cascade primary key,
  name                 text,
  zip_code             text,
  household_size       integer     default 1,
  vulnerabilities      jsonb       default '[]'::jsonb,
  allergies            jsonb       default '[]'::jsonb,
  medications_flag     boolean     default false,
  alert_threshold      text        default 'ALL'  check (alert_threshold in ('HIGH', 'ALL')),
  monitored_categories jsonb       default '["food","drug","device"]'::jsonb,
  theme                text        default 'dark' check (theme in ('dark', 'light')),
  expo_push_token      text,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();

-- ── recalls ──────────────────────────────────────────────────────────────────
-- The core asset. Every recall ever synced from FDA lives here permanently.
-- Rows are upserted by recall_number; status fields update, rows never delete.

create table if not exists public.recalls (
  id                     uuid        default gen_random_uuid() primary key,
  recall_number          text        unique,
  category               text        not null check (category in ('food', 'drug', 'device', 'consumer', 'vehicle')),
  source                 text,
  product_description    text,
  recalling_firm         text,
  reason_for_recall      text,
  classification         text,
  status                 text,
  report_date            date,
  recall_initiation_date date,
  affected_states        text,
  distribution_pattern   text,
  quantity_recalled      text,
  code_info              text,
  country                text        default 'US',
  raw_fda                jsonb,
  severity               text        check (severity in ('HIGH', 'MEDIUM', 'LOW')),
  search_vector          tsvector,
  first_seen_at          timestamptz default now(),
  last_synced_at         timestamptz default now()
);

-- Full-text search: product (A), reason + firm (B), lot codes (C)
create or replace function public.build_recall_search_vector()
returns trigger as $$
begin
  new.search_vector :=
    setweight(to_tsvector('english', coalesce(new.product_description, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.reason_for_recall,   '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.recalling_firm,      '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.code_info,           '')), 'C');
  return new;
end;
$$ language plpgsql;

drop trigger if exists recall_search_trigger on public.recalls;
create trigger recall_search_trigger
  before insert or update on public.recalls
  for each row execute function public.build_recall_search_vector();

create index if not exists recalls_search_idx    on public.recalls using gin(search_vector);
create index if not exists recalls_category_idx  on public.recalls(category);
create index if not exists recalls_date_idx      on public.recalls(report_date desc nulls last);
create index if not exists recalls_firm_idx      on public.recalls(recalling_firm);
create index if not exists recalls_synced_idx    on public.recalls(last_synced_at desc);

-- ── sync_log ─────────────────────────────────────────────────────────────────

create table if not exists public.sync_log (
  id              uuid        default gen_random_uuid() primary key,
  category        text,
  started_at      timestamptz default now(),
  completed_at    timestamptz,
  records_added   integer     default 0,
  records_updated integer     default 0,
  status          text        default 'running' check (status in ('running', 'success', 'failed')),
  error           text
);

-- ── user_searches ─────────────────────────────────────────────────────────────

create table if not exists public.user_searches (
  id           uuid        default gen_random_uuid() primary key,
  user_id      uuid        references public.users(id) on delete cascade,
  query        text        not null,
  category     text,
  result_count integer     default 0,
  created_at   timestamptz default now()
);

create index if not exists user_searches_user_idx on public.user_searches(user_id, created_at desc);

-- ── watchlist ────────────────────────────────────────────────────────────────

create table if not exists public.watchlist (
  id         uuid        default gen_random_uuid() primary key,
  user_id    uuid        references public.users(id) on delete cascade,
  query      text        not null,
  category   text,
  notify     boolean     default true,
  created_at timestamptz default now(),
  unique(user_id, query, category)
);

-- ── user_alerts ──────────────────────────────────────────────────────────────

create table if not exists public.user_alerts (
  id               uuid        default gen_random_uuid() primary key,
  user_id          uuid        references public.users(id) on delete cascade,
  recall_id        uuid        references public.recalls(id),
  matched_reasons  jsonb       default '{}'::jsonb,
  notified_at      timestamptz default now(),
  read_at          timestamptz,
  dismissed_at     timestamptz
);

create index if not exists alerts_user_idx on public.user_alerts(user_id, notified_at desc);

-- ── intelligence layer ───────────────────────────────────────────────────────

create table if not exists public.brand_safety_scores (
  firm                text        primary key,
  total_recalls       integer     default 0,
  high_severity_count integer     default 0,
  score               numeric(4,2) default 10.00,
  last_computed_at    timestamptz default now()
);

create table if not exists public.recall_trends (
  id           uuid        default gen_random_uuid() primary key,
  category     text,
  period       date,
  count        integer     default 0,
  high_count   integer     default 0,
  computed_at  timestamptz default now(),
  unique(category, period)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.users              enable row level security;
alter table public.recalls            enable row level security;
alter table public.sync_log           enable row level security;
alter table public.user_searches      enable row level security;
alter table public.watchlist          enable row level security;
alter table public.user_alerts        enable row level security;
alter table public.brand_safety_scores enable row level security;
alter table public.recall_trends      enable row level security;

-- users: own row only
create policy "users_select_own"  on public.users for select using (auth.uid() = id);
create policy "users_insert_own"  on public.users for insert with check (auth.uid() = id);
create policy "users_update_own"  on public.users for update using (auth.uid() = id);

-- recalls: any authenticated user can read; only service role writes (via Edge Function)
create policy "recalls_read" on public.recalls for select using (auth.role() = 'authenticated');

-- sync_log: service role only — no public policies

-- user_searches: own rows
create policy "searches_select" on public.user_searches for select using (auth.uid() = user_id);
create policy "searches_insert" on public.user_searches for insert with check (auth.uid() = user_id);

-- watchlist: own rows
create policy "watchlist_select" on public.watchlist for select using (auth.uid() = user_id);
create policy "watchlist_insert" on public.watchlist for insert with check (auth.uid() = user_id);
create policy "watchlist_delete" on public.watchlist for delete using (auth.uid() = user_id);

-- user_alerts: own rows
create policy "alerts_select" on public.user_alerts for select using (auth.uid() = user_id);
create policy "alerts_update" on public.user_alerts for update using (auth.uid() = user_id);

-- intelligence tables: any authenticated user can read
create policy "brand_scores_read" on public.brand_safety_scores for select using (auth.role() = 'authenticated');
create policy "trends_read"       on public.recall_trends        for select using (auth.role() = 'authenticated');
