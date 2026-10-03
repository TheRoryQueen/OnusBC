-- Retrieval returns which document (Policy or Procedures) each chunk comes from, for Ask citations.
drop function public.match_policy_chunks(uuid, extensions.vector, int);
create function public.match_policy_chunks(p_institution_id uuid, query_embedding extensions.vector(768), k int default 6)
returns table (id bigint, document text, section text, content text, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select c.id, c.document, c.section, c.content, 1 - (c.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.policy_chunks c
  where c.institution_id = p_institution_id and c.embedding is not null
  order by c.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(k, 1), 20)
$$;
revoke execute on function public.match_policy_chunks(uuid, extensions.vector, int) from public, anon, authenticated;
grant execute on function public.match_policy_chunks(uuid, extensions.vector, int) to service_role;
