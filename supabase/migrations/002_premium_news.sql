-- ─────────────────────────────────────────────────────────────────────────────
-- RecallRadar — Premium + News Intelligence
-- Run this in: Supabase Dashboard → SQL Editor → Run
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Premium flag on users ─────────────────────────────────────────────────────

alter table public.users add column if not exists is_premium boolean default false;

-- ── news_snapshots ────────────────────────────────────────────────────────────
-- One row per recall. Stores the raw articles + Claude summary.
-- Keyed by recall_number so it works whether the recall is in our DB or not.
-- Refreshed every 24h via the fetch-news Edge Function.

create table if not exists public.news_snapshots (
  id            uuid        default gen_random_uuid() primary key,
  recall_number text        unique not null,
  recall_id     uuid        references public.recalls(id) on delete set null,
  query         text        not null,
  articles      jsonb       default '[]'::jsonb,
  summary       text,
  article_count integer     default 0,
  computed_at   timestamptz default now(),
  expires_at    timestamptz default (now() + interval '24 hours')
);

create index if not exists news_recall_number_idx on public.news_snapshots(recall_number);
create index if not exists news_expires_idx       on public.news_snapshots(expires_at);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- The fetch-news Edge Function uses the service role key so it always bypasses
-- RLS when reading/writing snapshots. No direct client access needed.

alter table public.news_snapshots enable row level security;
