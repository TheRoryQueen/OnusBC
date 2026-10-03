-- 1. Edit codes are checked only through /api/ratings, which limits attempts per IP. Before this, anyone could
--    call edit_rating straight through the database API and guess codes without that limit.
revoke execute on function public.edit_rating(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.edit_rating(text, jsonb, boolean) to service_role;

-- 2. A school's score row is public and updates when a rating lands, so its exact timestamp would date that
--    rating to the second. Round it to the week, like rating dates.
create or replace function private.round_score_time() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := date_trunc('week', now());
  return new;
end;
$$;
drop trigger if exists round_score_time on public.institution_scores;
create trigger round_score_time before insert or update on public.institution_scores
  for each row execute function private.round_score_time();
update public.institution_scores set updated_at = date_trunc('week', updated_at);
