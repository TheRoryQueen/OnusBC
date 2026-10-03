-- Live grading runs ("Grade a policy", judges and admins only). Server-only: RLS on, no policies, no
-- grants to anon or authenticated, so only the service role (the /api/grade route) reads or writes.
-- Results are never joined to institutions or grades: a live run is never added to the BC map.
-- Counted per day so the shared Gemini quota is protected; the latest finished run is shown, labelled
-- "Recorded run from [time]", when a live run fails.
create table public.grading_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  source_kind text not null check (source_kind in ('sample', 'url')),
  source_label text not null,
  source_url text not null,
  model text not null,
  gemini_calls int not null default 0,
  error text,
  result jsonb
);
create index grading_runs_created_at on public.grading_runs (created_at desc);
alter table public.grading_runs enable row level security;
revoke all on public.grading_runs from anon, authenticated;
