-- Rubric v2, 0 to 100 scale (docs/rubric-v2-proposal.md, approved Oct 4, 2026).
-- Both grades move to 0 to 100 (option A): On paper from the stricter category maths, In practice by
-- scaling the same 0 to 4 answer blocks by 25. The gap keeps one shared scale; its bands scale by 25
-- (today's 0.5 and 1.5 become 12.5 and 37.5). Letters: A 80+, B 70+, C 60+, D 50+, F below 50.

alter table public.institution_scores alter column paper_gpa type numeric(5, 2);
alter table public.institution_scores alter column practice_gpa type numeric(5, 2);
alter table public.institution_scores alter column gap type numeric(5, 2);

create or replace function public.letter_for(gpa numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  -- v2 cutoffs on 0 to 100, whole numbers, a half rounding down.
  select case
    when gpa is null then null
    when floor(gpa + 0.5) >= 80 then 'A'
    when floor(gpa + 0.5) >= 70 then 'B'
    when floor(gpa + 0.5) >= 60 then 'C'
    when floor(gpa + 0.5) >= 50 then 'D'
    else 'F'
  end
$$;

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

  -- On paper, v2: each category = points earned / points possible * 100; the score is the mean of the
  -- five category scores on 0 to 100, a half rounding down.
  select count(*) into v_n_criteria from public.grades where institution_id = p_institution_id;
  if v_policy_found and v_n_criteria > 0 then
    select floor(avg(cat_score) + 0.5) into v_paper from (
      select sum(g.score)::numeric / (2 * count(*)) * 100 as cat_score
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

    -- Same weights as before, on the 0 to 100 scale.
    if v_n_process >= 5 and v_process is not null and v_everyone is not null then
      v_practice := floor((0.4 * v_everyone + 0.6 * v_process) * 25 + 0.5);
    else
      v_practice := floor(v_everyone * 25 + 0.5);
    end if;
  end if;

  -- The gap, in points on the shared 0 to 100 scale.
  if not v_policy_found then
    v_label := 'no_policy';
  elsif v_paper is null then
    v_label := null;  -- policy found, grading in progress
  elsif v_practice is null then
    v_label := 'not_enough_ratings';
  else
    v_gap := v_paper - v_practice;
    v_label := case
      when abs(v_gap) <= 12.5 then 'aligned'
      when v_gap < -12.5 then 'better_in_practice'
      when v_gap <= 37.5 then 'some_gap'
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
