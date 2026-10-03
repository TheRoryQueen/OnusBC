-- Onus schema, row level security, functions and auth hook.
-- Source of truth: docs/PRD.md, "Build handoff: database schema" and "Grading system".
-- Privacy rules enforced here: ratings carry no user id and no timestamp finer than a week,
-- ratings are readable and writable by nobody except through submit_rating and edit_rating,
-- edit codes are stored only as SHA-256 hashes, and no column accepts free text from users.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  short_name text,
  type text not null check (type in ('university', 'college')),
  sector text not null default 'public' check (sector in ('public', 'private')),
  city text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  email_domains text[] not null default '{}',     -- student domains
  employee_domains text[] not null default '{}',
  alumni_domains text[] not null default '{}',    -- e.g. alum.ubc.ca (PRD matching rules: accepted, labeled alumni)
  blocked_domains text[] not null default '{}',   -- retired or forwarding-only, always rejected
  website text,
  phone text,
  policy_url text,
  policy_found boolean not null default false,
  report_url text,
  contact_office text,
  contact_email text,
  contact_phone text,
  about text
);

create table public.criteria (
  id text primary key,
  category text not null,
  label text not null,
  description text,
  origin text not null check (origin in ('SFCC', 'Onus')),
  sort int not null
);

create table public.grades (
  institution_id uuid not null references public.institutions(id) on delete cascade,
  criterion_id text not null references public.criteria(id),
  score int not null check (score between 0 and 2),
  quote text,
  section text,
  verified boolean not null default false,
  note text,
  graded_at timestamptz not null default now(),
  primary key (institution_id, criterion_id),
  -- Zero unverified quotes stored: a stored quote must have passed the quote check,
  -- and any point scored must be backed by a verified quote.
  constraint quote_must_be_verified check (quote is null or verified),
  constraint points_need_quote check (score = 0 or (quote is not null and verified))
);

create table public.policy_chunks (
  id bigint generated always as identity primary key,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  section text,
  content text not null,
  embedding extensions.vector(768)
);
create index policy_chunks_institution_idx on public.policy_chunks (institution_id);

create table public.public_records (
  id bigint generated always as identity primary key,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  year text not null,
  metric text not null,
  value numeric not null,
  note text,
  source_url text not null check (source_url ~ '^https?://')
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  institution_id uuid references public.institutions(id) on delete set null,
  role text check (role in ('student', 'staff', 'alumni')),
  is_judge boolean not null default false,
  created_at timestamptz not null default now()
);

-- No user id, no exact timestamp. ids are random so insert order can't be read from them.
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  role text check (role in ('student', 'staff', 'alumni')),  -- null for judge ratings
  knows_how boolean,
  trust int check (trust between 1 and 5),
  went_through boolean,                                        -- null = prefer not to say
  believed int check (believed between 1 and 5),
  informed int check (informed between 1 and 5),
  time_bucket text check (time_bucket in ('under_1m', '1_3m', '3_6m', '6m_plus_or_waiting')),
  consequence text check (consequence in ('yes', 'no', 'still_waiting', 'prefer_not')),
  week date not null,
  source text not null check (source in ('onus', 'sample')),
  is_demo boolean not null default false,
  edit_code_hash text unique check (edit_code_hash ~ '^[0-9a-f]{64}$'),
  withdrawn boolean not null default false,
  -- Step 2 answers only exist when the rater went through the process.
  constraint step2_only_if_went_through check (
    went_through is true
    or (believed is null and informed is null and time_bucket is null and consequence is null)
  ),
  constraint week_is_monday check (extract(isodow from week) = 1),
  constraint onus_ratings_have_code check (source <> 'onus' or edit_code_hash is not null)
);
create index ratings_institution_idx on public.ratings (institution_id);

create table public.has_rated (
  user_id uuid not null references auth.users(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  primary key (user_id, institution_id)
);

create table public.institution_scores (
  institution_id uuid primary key references public.institutions(id) on delete cascade,
  paper_gpa numeric(3, 2),
  paper_letter text check (paper_letter in ('A', 'B', 'C', 'D', 'F')),
  practice_gpa numeric(3, 2),
  practice_letter text check (practice_letter in ('A', 'B', 'C', 'D', 'F')),
  practice_everyone_only boolean not null default false,  -- fewer than 5 process responses
  n_public int not null default 0,
  n_onus int not null default 0,
  n_sample int not null default 0,
  n_process int not null default 0,
  gap numeric(4, 2),
  gap_label text check (gap_label in (
    'aligned', 'some_gap', 'big_gap', 'better_in_practice', 'no_policy', 'not_enough_ratings'
  )),  -- null while a found policy is still being graded
  updated_at timestamptz not null default now()
);

-- Server-side settings. demo_mode mirrors DEMO_MODE: true counts is_demo ratings in scores.
create table public.app_settings (
  key text primary key,
  value jsonb not null
);
insert into public.app_settings (key, value) values ('demo_mode', 'true');

-- Emails the judge-login route has cleared to be created despite a non-school domain.
-- Written only by the server (service role) after the event code is checked.
create table public.pending_judges (
  email text primary key check (email = lower(email)),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------

alter table public.institutions enable row level security;
alter table public.criteria enable row level security;
alter table public.grades enable row level security;
alter table public.policy_chunks enable row level security;
alter table public.public_records enable row level security;
alter table public.profiles enable row level security;
alter table public.ratings enable row level security;
alter table public.has_rated enable row level security;
alter table public.institution_scores enable row level security;
alter table public.app_settings enable row level security;
alter table public.pending_judges enable row level security;

-- Start from nothing for the API roles, then grant only what each table needs.
revoke all on all tables in schema public from anon, authenticated;

grant select on public.institutions, public.criteria, public.grades, public.public_records,
  public.institution_scores to anon, authenticated;
create policy "public read" on public.institutions for select using (true);
create policy "public read" on public.criteria for select using (true);
create policy "public read" on public.grades for select using (true);
create policy "public read" on public.public_records for select using (true);
create policy "public read" on public.institution_scores for select using (true);

-- Owner reads own profile. No update policy: username is locked, and role and school are set
-- once through choose_profile, so nobody can switch school to rate somewhere else.
grant select on public.profiles to authenticated;
create policy "owner reads own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));

grant select on public.has_rated to authenticated;
create policy "owner reads own rows" on public.has_rated
  for select to authenticated using (user_id = (select auth.uid()));

-- ratings, policy_chunks, app_settings, pending_judges: no grants and no policies for anon or
-- authenticated. Only security definer functions and the service role touch them.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.letter_for(gpa numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  -- PRD cutoffs: A 3.5 to 4.0, B 2.5 to 3.4, C 1.5 to 2.4, D 0.5 to 1.4, F below 0.5 (on one decimal).
  select case
    when gpa is null then null
    when round(gpa, 1) >= 3.5 then 'A'
    when round(gpa, 1) >= 2.5 then 'B'
    when round(gpa, 1) >= 1.5 then 'C'
    when round(gpa, 1) >= 0.5 then 'D'
    else 'F'
  end
$$;

create or replace function public.hash_edit_code(code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(upper(btrim(code)), 'sha256'), 'hex')
$$;

-- Eight characters from an alphabet without look-alikes (no 0/O, 1/I/L). Rejection sampling, no bias.
create or replace function public.new_edit_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  n constant int := length(alphabet);   -- 31
  code text := '';
  b int;
begin
  while length(code) < 8 loop
    b := get_byte(extensions.gen_random_bytes(1), 0);
    if b < n * (256 / n) then
      code := code || substr(alphabet, (b % n) + 1, 1);
    end if;
  end loop;
  return code;
end;
$$;

-- Validates a rating's answers. Only known keys, only booleans, integers 1 to 5, or fixed choices,
-- so no free text can ever be stored. Returns the normalized answers.
create or replace function public.validate_answers(answers jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  allowed constant text[] := array['knows_how', 'trust', 'went_through', 'believed', 'informed',
                                   'time_bucket', 'consequence'];
  went text;
begin
  if answers is null or jsonb_typeof(answers) <> 'object' then
    raise exception 'invalid_answers: answers must be an object' using errcode = '22023';
  end if;
  for k in select jsonb_object_keys(answers) loop
    if not k = any(allowed) then
      raise exception 'invalid_answers: unknown field %', k using errcode = '22023';
    end if;
  end loop;

  if answers ? 'knows_how' and jsonb_typeof(answers->'knows_how') not in ('boolean', 'null') then
    raise exception 'invalid_answers: knows_how' using errcode = '22023';
  end if;
  foreach k in array array['trust', 'believed', 'informed'] loop
    if answers ? k and jsonb_typeof(answers->k) <> 'null' and (
      jsonb_typeof(answers->k) <> 'number'
      or (answers->>k) !~ '^[1-5]$'
    ) then
      raise exception 'invalid_answers: % must be 1 to 5', k using errcode = '22023';
    end if;
  end loop;

  went := answers->>'went_through';
  if answers ? 'went_through' and jsonb_typeof(answers->'went_through') <> 'null'
     and (jsonb_typeof(answers->'went_through') <> 'string' or went not in ('yes', 'no', 'prefer_not')) then
    raise exception 'invalid_answers: went_through' using errcode = '22023';
  end if;
  if answers ? 'time_bucket' and jsonb_typeof(answers->'time_bucket') <> 'null'
     and (jsonb_typeof(answers->'time_bucket') <> 'string'
          or answers->>'time_bucket' not in ('under_1m', '1_3m', '3_6m', '6m_plus_or_waiting')) then
    raise exception 'invalid_answers: time_bucket' using errcode = '22023';
  end if;
  if answers ? 'consequence' and jsonb_typeof(answers->'consequence') <> 'null'
     and (jsonb_typeof(answers->'consequence') <> 'string'
          or answers->>'consequence' not in ('yes', 'no', 'still_waiting', 'prefer_not')) then
    raise exception 'invalid_answers: consequence' using errcode = '22023';
  end if;

  if coalesce(went, '') <> 'yes' and (
    coalesce(answers->>'believed', answers->>'informed', answers->>'time_bucket', answers->>'consequence') is not null
  ) then
    raise exception 'invalid_answers: step 2 answers need went_through = yes' using errcode = '22023';
  end if;
  return answers;
end;
$$;

-- ---------------------------------------------------------------------------
-- Scores
-- ---------------------------------------------------------------------------

create or replace function public.refresh_scores(p_institution_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy_found boolean;
  v_demo boolean;
  v_paper numeric;
  v_n_criteria int;
  v_n_total int;
  v_n_onus int;
  v_n_sample int;
  v_n_process int;
  v_n_public int;
  v_everyone numeric;
  v_process numeric;
  v_practice numeric;
  v_gap numeric;
  v_label text;
begin
  select policy_found into v_policy_found from public.institutions where id = p_institution_id;
  if not found then
    raise exception 'unknown_institution' using errcode = 'P0002';
  end if;
  select coalesce((value)::text::boolean, false) into v_demo from public.app_settings where key = 'demo_mode';
  v_demo := coalesce(v_demo, false);

  -- On paper: each category = points earned / points possible * 4; grade = mean of the 5 categories.
  select count(*) into v_n_criteria from public.grades where institution_id = p_institution_id;
  if v_policy_found and v_n_criteria > 0 then
    select avg(cat_score) into v_paper from (
      select sum(g.score)::numeric / (2 * count(*)) * 4 as cat_score
      from public.grades g
      join public.criteria c on c.id = g.criterion_id
      where g.institution_id = p_institution_id
      group by c.category
    ) cats;
  end if;

  -- In practice. Counted ratings: not withdrawn; demo rows only when demo_mode is on.
  select count(*), count(*) filter (where source = 'onus'), count(*) filter (where source = 'sample'),
         count(*) filter (where went_through is true)
    into v_n_total, v_n_onus, v_n_sample, v_n_process
  from public.ratings r
  where r.institution_id = p_institution_id and not r.withdrawn and (v_demo or not r.is_demo);

  -- Public: rows in public_records for this school (see PRD, Live rating count).
  select count(*) into v_n_public from public.public_records where institution_id = p_institution_id;

  if v_n_total >= 5 then
    -- Everyone block: mean of (share answering Yes to "know how to report" x 4) and (trust - 1).
    -- Process block (went through the process): believed - 1, informed - 1, time score, consequence score.
    select
      (select avg(x) from unnest(array[
         avg(case when knows_how then 4.0 when not knows_how then 0.0 end),
         avg(trust - 1.0)]) x),
      (select avg(x) from unnest(array[
         avg(believed - 1.0) filter (where went_through),
         avg(informed - 1.0) filter (where went_through),
         avg(case time_bucket when 'under_1m' then 4.0 when '1_3m' then 3.0
                              when '3_6m' then 2.0 when '6m_plus_or_waiting' then 1.0 end) filter (where went_through),
         avg(case consequence when 'yes' then 4.0 when 'no' then 0.0 end) filter (where went_through)]) x)
      into v_everyone, v_process
    from public.ratings r
    where r.institution_id = p_institution_id and not r.withdrawn and (v_demo or not r.is_demo);

    if v_n_process >= 5 and v_process is not null and v_everyone is not null then
      v_practice := 0.4 * v_everyone + 0.6 * v_process;
    else
      v_practice := v_everyone;
    end if;
  end if;

  -- The gap.
  if not v_policy_found then
    v_label := 'no_policy';
  elsif v_paper is null then
    v_label := null;  -- policy found, grading in progress
  elsif v_practice is null then
    v_label := 'not_enough_ratings';
  else
    v_gap := round(v_paper, 2) - round(v_practice, 2);
    v_label := case
      when abs(v_gap) <= 0.5 then 'aligned'
      when v_gap < -0.5 then 'better_in_practice'
      when v_gap <= 1.5 then 'some_gap'
      else 'big_gap'
    end;
  end if;

  insert into public.institution_scores as s (
    institution_id, paper_gpa, paper_letter, practice_gpa, practice_letter, practice_everyone_only,
    n_public, n_onus, n_sample, n_process, gap, gap_label, updated_at
  ) values (
    p_institution_id, round(v_paper, 2), public.letter_for(v_paper),
    round(v_practice, 2), public.letter_for(v_practice),
    v_practice is not null and v_n_process < 5,
    v_n_public, v_n_onus, v_n_sample, v_n_process,
    case when v_policy_found then v_gap end, v_label, now()
  )
  on conflict (institution_id) do update set
    paper_gpa = excluded.paper_gpa, paper_letter = excluded.paper_letter,
    practice_gpa = excluded.practice_gpa, practice_letter = excluded.practice_letter,
    practice_everyone_only = excluded.practice_everyone_only,
    n_public = excluded.n_public, n_onus = excluded.n_onus, n_sample = excluded.n_sample,
    n_process = excluded.n_process, gap = excluded.gap, gap_label = excluded.gap_label,
    updated_at = excluded.updated_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ratings: the only ways in
-- ---------------------------------------------------------------------------

create or replace function public.submit_rating(p_institution_id uuid, p_answers jsonb)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  a jsonb;
  v_code text;
  v_week date := date_trunc('week', now() at time zone 'America/Vancouver')::date;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then
    raise exception 'no_profile' using errcode = '42501';
  end if;
  if not exists (select 1 from public.institutions where id = p_institution_id) then
    raise exception 'unknown_institution' using errcode = 'P0002';
  end if;
  if not v_profile.is_judge then
    if v_profile.institution_id is null or v_profile.role is null then
      raise exception 'profile_incomplete' using errcode = '42501';
    end if;
    if v_profile.institution_id <> p_institution_id then
      raise exception 'wrong_institution' using errcode = '42501';
    end if;
  end if;

  a := public.validate_answers(p_answers);

  -- has_rated first: its primary key also stops two simultaneous submits.
  begin
    insert into public.has_rated (user_id, institution_id) values (v_uid, p_institution_id);
  exception when unique_violation then
    raise exception 'already_rated' using errcode = '23505';
  end;

  loop
    v_code := public.new_edit_code();
    begin
      insert into public.ratings (
        institution_id, role, knows_how, trust, went_through, believed, informed,
        time_bucket, consequence, week, source, is_demo, edit_code_hash
      ) values (
        p_institution_id,
        case when v_profile.is_judge then null else v_profile.role end,
        (a->>'knows_how')::boolean,
        (a->>'trust')::int,
        case a->>'went_through' when 'yes' then true when 'no' then false end,
        (a->>'believed')::int,
        (a->>'informed')::int,
        a->>'time_bucket',
        a->>'consequence',
        v_week, 'onus', v_profile.is_judge, public.hash_edit_code(v_code)
      );
      exit;
    exception when unique_violation then
      -- Hash collision on a fresh code: draw another.
    end;
  end loop;

  perform public.refresh_scores(p_institution_id);
  return v_code;
end;
$$;

create or replace function public.edit_rating(p_edit_code text, p_answers jsonb default null, p_withdraw boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rating public.ratings;
  a jsonb;
begin
  if p_edit_code is null or upper(btrim(p_edit_code)) !~ '^[A-Z0-9]{8}$' then
    raise exception 'invalid_code' using errcode = '22023';
  end if;
  select * into v_rating from public.ratings
    where edit_code_hash = public.hash_edit_code(p_edit_code) and not withdrawn
    for update;
  if not found then
    raise exception 'code_not_found' using errcode = 'P0002';
  end if;

  if p_withdraw then
    update public.ratings set withdrawn = true where id = v_rating.id;
  else
    a := public.validate_answers(p_answers);
    -- Week stays as first submitted, so an edit can't be dated.
    update public.ratings set
      knows_how = (a->>'knows_how')::boolean,
      trust = (a->>'trust')::int,
      went_through = case a->>'went_through' when 'yes' then true when 'no' then false end,
      believed = (a->>'believed')::int,
      informed = (a->>'informed')::int,
      time_bucket = a->>'time_bucket',
      consequence = a->>'consequence'
    where id = v_rating.id;
  end if;

  perform public.refresh_scores(v_rating.institution_id);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Policy retrieval (server only)
-- ---------------------------------------------------------------------------

create or replace function public.match_policy_chunks(p_institution_id uuid, query_embedding extensions.vector(768), k int default 6)
returns table (id bigint, section text, content text, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select c.id, c.section, c.content, 1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.policy_chunks c
  where c.institution_id = p_institution_id and c.embedding is not null
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(k, 1), 20)
$$;

-- ---------------------------------------------------------------------------
-- Sign-up: domain allowlist hook, profile creation, one-time role and campus choice
-- ---------------------------------------------------------------------------

-- Exact domain after the @, lowercased. No wildcard subdomains.
create or replace function public.email_domain(email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(split_part(btrim(email), '@', 2))
$$;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event->'user'->>'email'));
  v_domain text := public.email_domain(event->'user'->>'email');
  reject constant jsonb := jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Onus works with BC public college and university emails. Use your school address, like name@my.capilanou.ca.'
  ));
begin
  if v_email is null or v_domain = '' then
    return reject;
  end if;
  -- Judges cleared by the judge-login route (event code checked server-side).
  if exists (select 1 from public.pending_judges where email = v_email and expires_at > now()) then
    return '{}'::jsonb;
  end if;
  if exists (select 1 from public.institutions where v_domain = any(blocked_domains)) then
    return reject;
  end if;
  if exists (
    select 1 from public.institutions
    where v_domain = any(email_domains) or v_domain = any(employee_domains) or v_domain = any(alumni_domains)
  ) then
    return '{}'::jsonb;
  end if;
  return reject;
end;
$$;

create or replace function public.random_username()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  adjectives constant text[] := array['quiet','steady','bright','gentle','brave','calm','clear','kind',
    'swift','bold','patient','honest','careful','warm','keen','plain','fair','true','firm','sunny'];
  animals constant text[] := array['heron','otter','orca','raven','marmot','salmon','cougar','lynx',
    'beaver','eagle','owl','seal','fox','bear','wren','elk','loon','hare','moose','crane'];
  candidate text;
begin
  loop
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::int] || '-' ||
                 animals[1 + floor(random() * array_length(animals, 1))::int] || '-' ||
                 (10 + floor(random() * 90))::int;
    exit when not exists (select 1 from public.profiles where username = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_domain text := public.email_domain(new.email);
  v_is_judge boolean;
  v_matches int;
  v_institution uuid;
  v_role text;
begin
  v_is_judge := exists (select 1 from public.pending_judges where email = lower(new.email));
  if v_is_judge then
    delete from public.pending_judges where email = lower(new.email);
    insert into public.profiles (id, username, is_judge) values (new.id, public.random_username(), true);
    return new;
  end if;

  select count(*) into v_matches from public.institutions
    where v_domain = any(email_domains) or v_domain = any(employee_domains) or v_domain = any(alumni_domains);

  if v_matches = 1 then
    select id,
      case
        -- Same domain for students and staff: the user picks their role once.
        when v_domain = any(email_domains) and v_domain = any(employee_domains) then null
        when v_domain = any(email_domains) then 'student'
        when v_domain = any(employee_domains) then 'staff'
        when v_domain = any(alumni_domains) then 'alumni'
      end
      into v_institution, v_role
    from public.institutions
    where v_domain = any(email_domains) or v_domain = any(employee_domains) or v_domain = any(alumni_domains);
  elsif v_matches > 1 then
    -- Shared across campuses (UBC Vancouver and Okanagan): the user picks a campus once.
    -- The role is fixed by the domain kind when every campus agrees on it.
    select case
      when bool_and(v_domain = any(email_domains) and not v_domain = any(employee_domains)) then 'student'
      when bool_and(v_domain = any(employee_domains) and not v_domain = any(email_domains)) then 'staff'
      when bool_and(v_domain = any(alumni_domains) and not v_domain = any(email_domains) and not v_domain = any(employee_domains)) then 'alumni'
    end into v_role
    from public.institutions
    where v_domain = any(email_domains) or v_domain = any(employee_domains) or v_domain = any(alumni_domains);
  end if;

  insert into public.profiles (id, username, institution_id, role)
  values (new.id, public.random_username(), v_institution, v_role);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- One-time choice for shared domains: role (student, staff, alumni) and, for UBC, campus.
-- Only fills values that are still empty, and only with a school that matches the email domain.
create or replace function public.choose_profile(p_role text default null, p_institution_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_domain text;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.is_judge then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select public.email_domain(email) into v_domain from auth.users where id = v_uid;

  if p_role is not null then
    if v_profile.role is not null then
      raise exception 'role_already_set' using errcode = '42501';
    end if;
    if p_role not in ('student', 'staff', 'alumni') then
      raise exception 'invalid_role' using errcode = '22023';
    end if;
    update public.profiles set role = p_role where id = v_uid;
  end if;

  if p_institution_id is not null then
    if v_profile.institution_id is not null then
      raise exception 'institution_already_set' using errcode = '42501';
    end if;
    if not exists (
      select 1 from public.institutions
      where id = p_institution_id
        and (v_domain = any(email_domains) or v_domain = any(employee_domains) or v_domain = any(alumni_domains))
    ) then
      raise exception 'institution_does_not_match_email' using errcode = '42501';
    end if;
    update public.profiles set institution_id = p_institution_id where id = v_uid;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing is callable unless granted here.
-- ---------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.submit_rating(uuid, jsonb) to authenticated;
grant execute on function public.edit_rating(text, jsonb, boolean) to anon, authenticated;
grant execute on function public.choose_profile(text, uuid) to authenticated;
grant execute on function public.letter_for(numeric) to anon, authenticated;

grant execute on function public.refresh_scores(uuid) to service_role;
grant execute on function public.match_policy_chunks(uuid, extensions.vector, int) to service_role;

grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from service_role;

-- New functions created later in public should also start closed.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: the map listens for score changes.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.institution_scores;

-- ---------------------------------------------------------------------------
-- The 16 criteria (PRD, Grading system, On paper). Origins as listed in the PRD.
-- ---------------------------------------------------------------------------

insert into public.criteria (id, category, label, origin, sort) values
  ('AC-1', 'Accessible', 'Stand-alone policy, not run through the student code of conduct', 'SFCC', 1),
  ('AC-2', 'Accessible', 'Publicly posted and easy to find', 'Onus', 2),
  ('AC-3', 'Accessible', 'Plain-language reporting steps', 'Onus', 3),
  ('SR-1', 'Survivor rights', 'No questions about sexual history', 'SFCC', 4),
  ('SR-2', 'Survivor rights', 'Protection from face-to-face contact', 'SFCC', 5),
  ('SR-3', 'Survivor rights', 'No gag orders', 'SFCC', 6),
  ('SR-4', 'Survivor rights', 'Choice of institutional and external processes', 'SFCC', 7),
  ('SR-5', 'Survivor rights', 'Amnesty for drug or alcohol use when reporting', 'Onus', 8),
  ('PR-1', 'Process', 'Reasonable, binding timelines', 'SFCC', 9),
  ('PR-2', 'Process', 'Interim protections (class, residence, work changes)', 'Onus', 10),
  ('PR-3', 'Process', 'Covers co-op, internships, work placements', 'SFCC', 11),
  ('AB-1', 'Accountability', 'Survivor told the outcome', 'SFCC', 12),
  ('AB-2', 'Accountability', 'Public annual reporting of numbers', 'Onus', 13),
  ('AB-3', 'Accountability', 'Policy reviewed every 2 years', 'SFCC', 14),
  ('AB-4', 'Accountability', 'At least 30% student representation on policy committees', 'SFCC', 15),
  ('TR-1', 'Training', 'Mandatory trauma-informed training for decision-makers', 'SFCC', 16),
  ('TR-2', 'Training', 'Prevention education for students', 'Onus', 17);
