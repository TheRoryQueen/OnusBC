-- Decision Oct 2, 2026: grade a school's policy plus its separate procedures as one combined text.
-- Every quote records which document it came from; the panel shows it.
alter table public.grades add column document text check (document in ('Policy', 'Procedures'));
alter table public.policy_chunks add column document text check (document in ('Policy', 'Procedures'));
alter table public.institutions
  add column procedures_url text,
  add column policy_note text;  -- e.g. "Policy exists but requires a login to read"
