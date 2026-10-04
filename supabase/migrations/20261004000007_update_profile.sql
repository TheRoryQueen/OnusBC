-- My account: school and role can be changed, but only within what the school email proves, so nobody can
-- switch school to rate somewhere else.
-- - School: only a school whose domains include the email's domain (in practice UBC Vancouver and UBC
--   Okanagan, which share domains), and not once any school has been rated from this account.
-- - Role: only where the domain doesn't set it (shared student and staff domains). A student domain is a
--   student, an employee domain is staff, an alumni domain is alumni.
-- Judges have no school or role to change.
create or replace function public.update_profile(p_role text default null, p_institution_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  v_domain text;
  v_fixed_role text;
  v_matches int;
begin
  if v_uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.is_judge then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select public.email_domain(email) into v_domain from auth.users where id = v_uid;

  if p_institution_id is not null and p_institution_id is distinct from v_profile.institution_id then
    if exists (select 1 from public.has_rated where user_id = v_uid) then
      raise exception 'school_locked_after_rating' using errcode = '42501';
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

  if p_role is not null and p_role is distinct from v_profile.role then
    if p_role not in ('student', 'staff', 'alumni') then
      raise exception 'invalid_role' using errcode = '22023';
    end if;
    -- The same rule as sign-up: a role the domain sets can't be changed.
    select count(*),
      case
        when bool_and(v_domain = any(email_domains) and not v_domain = any(employee_domains)) then 'student'
        when bool_and(v_domain = any(employee_domains) and not v_domain = any(email_domains)) then 'staff'
        when bool_and(v_domain = any(alumni_domains) and not v_domain = any(email_domains) and not v_domain = any(employee_domains)) then 'alumni'
      end
      into v_matches, v_fixed_role
    from public.institutions
    where v_domain = any(email_domains) or v_domain = any(employee_domains) or v_domain = any(alumni_domains);
    if v_matches = 0 or v_fixed_role is not null then
      raise exception 'role_set_by_email' using errcode = '42501';
    end if;
    update public.profiles set role = p_role where id = v_uid;
  end if;
end;
$$;

revoke execute on function public.update_profile(text, uuid) from public, anon, authenticated;
grant execute on function public.update_profile(text, uuid) to authenticated;
