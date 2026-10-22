-- Workbase Forms: files the nightly clean-up should remove (service role only): uploads never
-- sent with an answer after a day, and files whose answer or form was deleted.
create or replace function public.form_stale_uploads(p_limit integer default 500)
returns setof text language sql stable security definer set search_path = '' as $$
  select u.path from public.form_uploads u
  where (u.response_id is null and u.created_at < now() - interval '1 day')
     or not exists (select 1 from public.forms f where f.id = u.form_id)
     or (u.response_id is not null and not exists (select 1 from public.form_responses r where r.id = u.response_id))
  limit least(greatest(coalesce(p_limit, 500), 1), 1000)
$$;
revoke execute on function public.form_stale_uploads(integer) from public, anon, authenticated;
grant execute on function public.form_stale_uploads(integer) to service_role;
