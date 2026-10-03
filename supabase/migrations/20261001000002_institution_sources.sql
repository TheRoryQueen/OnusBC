-- Milestone 3: keep the support page, the per-field source links, and the institute/college/university
-- kind alongside each institution (PRD: every school fact stored with its source URL).
alter table public.institutions
  add column support_url text,
  add column kind text check (kind in ('university', 'college', 'institute')),
  add column sources jsonb not null default '{}'::jsonb,
  add column flags text[] not null default '{}';
